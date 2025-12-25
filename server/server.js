import path from 'path'
import fs from 'fs'
import { URL } from 'url'
import { createHash } from 'crypto'
import { createServer } from 'http'
import { createConnection } from 'mysql2/promise'
import { Client as PgClient } from 'pg'
import { createClient as createRedisClient } from 'redis'

const projectRoot = process.cwd()
const port = Number(process.env.PORT || 4000)

const fetchWithTimeout = async (url, opts, timeoutMs) => {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const composeSignal = (a, b) => {
    if (!a && !b) return undefined
    const ac = new AbortController()
    const onAbort = () => { try { ac.abort() } catch {} }
    if (a) a.addEventListener('abort', onAbort, { once: true })
    if (b) b.addEventListener('abort', onAbort, { once: true })
    return ac.signal
  }
  const signal = composeSignal(opts?.signal, ctrl.signal)
  try {
    const resp = await fetch(url, { ...opts, signal })
    clearTimeout(timer)
    return resp
  } catch (e) {
    clearTimeout(timer)
    throw e
  }
}

const readJson = async (req) => {
  const chunks = []
  await new Promise((resolve) => {
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve())
  })
  const raw = Buffer.concat(chunks).toString('utf-8')
  try { return JSON.parse(raw || '{}') } catch { return {} }
}

const walkSqlFiles = (baseDir) => {
  const out = []
  const entries = fs.existsSync(baseDir) ? fs.readdirSync(baseDir, { withFileTypes: true }) : []
  for (const e of entries) {
    const fp = path.join(baseDir, e.name)
    if (e.isDirectory()) out.push(...walkSqlFiles(fp))
    else if (e.isFile() && e.name.toLowerCase().endsWith('.sql')) out.push(fp)
  }
  return out
}

const parseName = (fileName) => {
  const m = fileName.match(/^V([^_]+)__(.+)\.sql$/i)
  const version = m ? m[1] : ''
  const description = m ? m[2].replace(/_/g, ' ') : fileName
  return { version, description }
}

const table = (() => {
  let c
  const t = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1))
    t[n] = c
  }
  return t
})()

const crc32 = (str) => {
  let crc = 0 ^ (-1)
  for (let i = 0; i < str.length; i++) crc = (crc >>> 8) ^ table[(crc ^ str.charCodeAt(i)) & 0xFF]
  return (crc ^ (-1)) | 0
}

const ensureHistoryTableMySQL = async (conn) => {
  await conn.execute(
    'CREATE TABLE IF NOT EXISTS flyway_schema_history (installed_rank INT NOT NULL, version VARCHAR(50), description VARCHAR(200) NOT NULL, type VARCHAR(20) NOT NULL, script VARCHAR(1000) NOT NULL, checksum INT, installed_by VARCHAR(100) NOT NULL, installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, execution_time INT NOT NULL, success TINYINT(1) NOT NULL, PRIMARY KEY (installed_rank))'
  )
}

const ensureHistoryTablePg = async (client, schema) => {
  const s = schema && schema.trim() ? schema : 'public'
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${s}`)
  await client.query(`CREATE TABLE IF NOT EXISTS ${s}.flyway_schema_history (installed_rank INT NOT NULL, version VARCHAR(50), description VARCHAR(200) NOT NULL, type VARCHAR(20) NOT NULL, script VARCHAR(1000) NOT NULL, checksum INT, installed_by VARCHAR(100) NOT NULL, installed_on TIMESTAMP NOT NULL DEFAULT NOW(), execution_time INT NOT NULL, success BOOLEAN NOT NULL, PRIMARY KEY (installed_rank))`)
  await client.query(`CREATE INDEX IF NOT EXISTS flyway_schema_history_s_idx ON ${s}.flyway_schema_history USING btree (success)`)
}

const readPrompt = async () => {
  try {
    const client = createRedisClient({ socket: { host: '127.0.0.1', port: 6379 } })
    await client.connect()
    const raw = await client.get('schema-pilot:ai:prompt:analyze')
    await client.quit()
    if (raw && raw.trim()) return raw
  } catch {}
  const p = path.resolve(projectRoot, 'prompts/analyze.md')
  try { return fs.readFileSync(p, 'utf-8') } catch { return '' }
}

let volatileAiConfig = null
const localAiConfigPath = path.resolve(projectRoot, '.schema-pilot/ai-config.json')

const sseInit = (res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  })
  return {
    send: (d) => { try { res.write(`data: ${JSON.stringify(d)}\n\n`) } catch {} },
    end: () => { try { res.write('event: done\n'); res.write('data: [DONE]\n\n'); res.end() } catch {} }
  }
}

const server = createServer(async (req, res) => {
  try {
    if (!req.url) {
      res.statusCode = 404
      res.end('')
      return
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      })
      res.end()
      return
    }
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (req.url.startsWith('/api/scripts/upload')) {
      try {
        const body = await readJson(req)
        const targetDir = String(body.path || '')
        const fileName = String(body.name || '')
        const content = String(body.content || '')
        if (!targetDir || !fileName) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'Missing path or name' })); return }
        const base = path.isAbsolute(targetDir) ? targetDir : path.resolve(projectRoot, targetDir)
        const safeName = path.basename(fileName)
        if (!safeName.toLowerCase().endsWith('.sql')) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'Only .sql files allowed' })); return }
        if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true })
        const outPath = path.join(base, safeName)
        fs.writeFileSync(outPath, content, 'utf-8')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ ok: false, error: String(err?.message || 'Upload failed') }))
      }
      return
    }

    if (req.url.startsWith('/api/scripts/rename')) {
      try {
        const body = await readJson(req)
        const targetDir = String(body.path || '')
        const relDir = String(body.dir || '')
        const oldName = String(body.oldName || '')
        const newName = String(body.newName || '')
        if (!targetDir || !oldName || !newName) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'Missing path or names' })); return }
        const base = path.isAbsolute(targetDir) ? targetDir : path.resolve(projectRoot, targetDir)
        const safeDir = relDir.replace(/\\/g, '/')
        const outDir = safeDir ? path.join(base, safeDir) : base
        const safeOld = path.basename(oldName)
        const safeNew = path.basename(newName)
        if (!safeOld.toLowerCase().endsWith('.sql') || !safeNew.toLowerCase().endsWith('.sql')) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'Only .sql files allowed' })); return }
        const oldPath = path.join(outDir, safeOld)
        const newPath = path.join(outDir, safeNew)
        if (!fs.existsSync(oldPath)) { res.statusCode = 404; res.end(JSON.stringify({ ok: false, error: 'File not found' })); return }
        if (safeOld === safeNew) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true })); return }
        if (fs.existsSync(newPath)) { res.statusCode = 409; res.end(JSON.stringify({ ok: false, error: 'Target exists' })); return }
        fs.renameSync(oldPath, newPath)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ ok: false, error: String(err?.message || 'Rename failed') }))
      }
      return
    }

    if (req.url.startsWith('/api/scripts/save')) {
      try {
        const body = await readJson(req)
        const targetDir = String(body.path || '')
        const relDir = String(body.dir || '')
        const fileName = String(body.name || '')
        const content = String(body.content || '')
        if (!targetDir || !fileName) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'Missing path or name' })); return }
        const base = path.isAbsolute(targetDir) ? targetDir : path.resolve(projectRoot, targetDir)
        const safeName = path.basename(fileName)
        const safeDir = relDir.replace(/\\/g, '/')
        const outDir = safeDir ? path.join(base, safeDir) : base
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
        const outPath = path.join(outDir, safeName)
        fs.writeFileSync(outPath, content, 'utf-8')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ ok: false, error: String(err?.message || 'Save failed') }))
      }
      return
    }

    if (req.url.startsWith('/api/scripts/delete')) {
      try {
        const body = await readJson(req)
        const targetDir = String(body.path || '')
        const relDir = String(body.dir || '')
        const fileName = String(body.name || '')
        if (!targetDir || !fileName) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'Missing path or name' })); return }
        const base = path.isAbsolute(targetDir) ? targetDir : path.resolve(projectRoot, targetDir)
        const safeName = path.basename(fileName)
        if (!safeName.toLowerCase().endsWith('.sql')) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'Only .sql files allowed' })); return }
        const safeDir = relDir.replace(/\\/g, '/')
        const outDir = safeDir ? path.join(base, safeDir) : base
        const outPath = path.join(outDir, safeName)
        if (!fs.existsSync(outPath)) { res.statusCode = 404; res.end(JSON.stringify({ ok: false, error: 'File not found' })); return }
        fs.unlinkSync(outPath)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ ok: false, error: String(err?.message || 'Delete failed') }))
      }
      return
    }

    if (req.url.startsWith('/api/scripts')) {
      try {
        const u = new URL(req.url, 'http://localhost')
        const pathParam = u.searchParams.get('path') || ''
        const base = path.isAbsolute(pathParam) ? pathParam : path.resolve(projectRoot, pathParam)
        const files = walkSqlFiles(base)
        const scripts = files.map((full) => {
          const relDir = path.relative(base, path.dirname(full)).replace(/\\/g, '/')
          const name = path.basename(full)
          const { version, description } = parseName(name)
          const id = createHash('md5').update(full).digest('hex')
          const content = fs.readFileSync(full, 'utf-8')
          return { id, version, description, name, content, status: 'PENDING', type: 'SQL', path: relDir || '' }
        })
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(scripts))
        return
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ error: 'Failed to read scripts' }))
        return
      }
    }

    if (req.url === '/api/history' && req.method === 'POST') {
      try {
        const cfg = await readJson(req)
        let rows = []
        if (cfg.type === 'MySQL' || cfg.type === 'MariaDB') {
          const conn = await createConnection({ host: cfg.host, port: Number(cfg.port || '3306'), user: cfg.user, password: cfg.password, database: cfg.database })
          await ensureHistoryTableMySQL(conn)
          const [result] = await conn.execute('SELECT installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success FROM flyway_schema_history ORDER BY installed_rank')
          rows = Array.isArray(result) ? result : []
          await conn.end()
        } else if (cfg.type === 'PostgreSQL') {
          const client = new PgClient({ host: cfg.host, port: Number(cfg.port || '5432'), user: cfg.user, password: cfg.password, database: cfg.database })
          await client.connect()
          const schema = cfg.schema && cfg.schema.trim() ? cfg.schema : 'public'
          await ensureHistoryTablePg(client, schema)
          const resPg = await client.query(`SELECT installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success FROM ${schema}.flyway_schema_history ORDER BY installed_rank`)
          rows = resPg.rows || []
          await client.end()
        } else {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Unsupported DB type' }))
          return
        }
        const data = rows.map((r) => ({
          installed_rank: Number(r.installed_rank),
          version: r.version === null ? null : String(r.version),
          description: String(r.description),
          type: String(r.type),
          script: String(r.script),
          checksum: Number(r.checksum),
          installed_by: String(r.installed_by),
          installed_on: typeof r.installed_on === 'string' ? r.installed_on : new Date(r.installed_on).toISOString(),
          execution_time: Number(r.execution_time),
          success: Boolean(r.success)
        }))
        try {
          if (cfg.redis?.enabled) {
            const client = createRedisClient({ socket: { host: String(cfg.redis.host || '127.0.0.1'), port: Number(cfg.redis.port || 6379) }, database: Number(cfg.redis.dbIndex ?? 0), password: cfg.redis.password ? String(cfg.redis.password) : undefined })
            await client.connect()
            const key = 'schema-pilot:db:history'
            await client.set(key, JSON.stringify(data))
            await client.quit()
          }
        } catch {}
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(data))
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ error: String(err?.message || 'History query failed') }))
      }
      return
    }

    if (req.url.startsWith('/api/history/cache') && req.method === 'GET') {
      try {
        const u = new URL(req.url, 'http://localhost')
        const host = u.searchParams.get('host') || '127.0.0.1'
        const portR = Number(u.searchParams.get('port') || 6379)
        const dbIndex = Number(u.searchParams.get('dbIndex') || 0)
        const password = u.searchParams.get('password') || ''
        const client = createRedisClient({ socket: { host, port: portR }, database: dbIndex, password: password ? String(password) : undefined })
        await client.connect()
        const raw = await client.get('schema-pilot:db:history')
        await client.quit()
        const arr = raw ? JSON.parse(raw) : []
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(Array.isArray(arr) ? arr : []))
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ error: String(err?.message || 'History cache read failed') }))
      }
      return
    }

    if (req.url.startsWith('/api/migrate')) {
      try {
        const body = await readJson(req)
        const cfg = body.config
        const sc = body.script
        const batch = body.scripts

        if (!cfg) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'Missing config' })); return }

        const cmpVer = (a, b) => {
          const pa = String(a || '').split('.').map(x => parseInt(x, 10)).map(n => isNaN(n) ? 0 : n)
          const pb = String(b || '').split('.').map(x => parseInt(x, 10)).map(n => isNaN(n) ? 0 : n)
          const len = Math.max(pa.length, pb.length)
          for (let i = 0; i < len; i++) { const ai = pa[i] || 0, bi = pb[i] || 0; if (ai !== bi) return ai - bi }
          return 0
        }

        if (Array.isArray(batch) && batch.length) {
          const list = batch.map(x => ({ name: String(x.name || ''), content: String(x.content || ''), ...parseName(String(x.name || '')) }))
          list.sort((a, b) => cmpVer(a.version, b.version) || String(a.name).localeCompare(String(b.name)))
          if (cfg.type === 'MySQL' || cfg.type === 'MariaDB') {
            const conn = await createConnection({ host: cfg.host, port: Number(cfg.port || '3306'), user: cfg.user, password: cfg.password, database: cfg.database, multipleStatements: true })
            await ensureHistoryTableMySQL(conn)
            let historyErrs = []
            let results = []
            const [rowsMax] = await conn.query('SELECT MAX(installed_rank) as max_rank FROM flyway_schema_history')
            let nextRank = (Number(rowsMax[0]?.max_rank) || 0) + 1
            for (const item of list) {
              const started = Date.now()
              try {
                await conn.query(item.content)
                const execTime = Date.now() - started
                const checksum = crc32(item.content)
                try {
                  await conn.query('INSERT INTO flyway_schema_history (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success, installed_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())', [nextRank, item.version || null, item.description, 'SQL', item.name, checksum, 'SchemaPilot', execTime, 1])
                  await conn.query('COMMIT')
                  historyErrs.push('')
                } catch (e) { historyErrs.push(String(e?.message || e)) }
                results.push({ name: item.name, ok: true })
                nextRank += 1
              } catch (e) {
                results.push({ name: item.name, ok: false, error: String(e?.message || e) })
                break
              }
            }
            await conn.end()
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: results.every(r => r.ok), results, historyErrors: historyErrs }))
            return
          } else if (cfg.type === 'PostgreSQL') {
            const client = new PgClient({ host: cfg.host, port: Number(cfg.port || '5432'), user: cfg.user, password: cfg.password, database: cfg.database })
            await client.connect()
            const schema = cfg.schema && cfg.schema.trim() ? cfg.schema : 'public'
            await client.query(`SET search_path TO ${schema}`)
            await ensureHistoryTablePg(client, schema)
            let historyErrs = []
            let results = []
            const resMax = await client.query(`SELECT MAX(installed_rank) as max_rank FROM ${schema}.flyway_schema_history`)
            let nextRank = (Number(resMax.rows[0]?.max_rank) || 0) + 1
            for (const item of list) {
              const started = Date.now()
              try {
                await client.query(item.content)
                const execTime = Date.now() - started
                const checksum = crc32(item.content)
                try {
                  await client.query(`INSERT INTO ${schema}.flyway_schema_history (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success, installed_on) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`, [nextRank, item.version || null, item.description, 'SQL', item.name, checksum, 'SchemaPilot', execTime, true])
                  await client.query('COMMIT')
                  historyErrs.push('')
                } catch (e) { historyErrs.push(String(e?.message || e)) }
                results.push({ name: item.name, ok: true })
                nextRank += 1
              } catch (e) {
                results.push({ name: item.name, ok: false, error: String(e?.message || e) })
                break
              }
            }
            await client.end()
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: results.every(r => r.ok), results, historyErrors: historyErrs }))
            return
          } else {
            res.statusCode = 400
            res.end(JSON.stringify({ ok: false, error: 'Unsupported DB type' }))
            return
          }
        }

        if (!sc || !sc.content) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'Missing script' })); return }
        const startTime = Date.now()
        const { version, description } = parseName(sc.name)
        const checksum = crc32(sc.content)
        if (cfg.type === 'MySQL' || cfg.type === 'MariaDB') {
          const conn = await createConnection({ host: cfg.host, port: Number(cfg.port || '3306'), user: cfg.user, password: cfg.password, database: cfg.database, multipleStatements: true })
          await ensureHistoryTableMySQL(conn)
          await conn.query(sc.content)
          const execTime = Date.now() - startTime
          let historyErr = ''
          try {
            const [rows] = await conn.query('SELECT MAX(installed_rank) as max_rank FROM flyway_schema_history')
            const nextRank = (Number(rows[0]?.max_rank) || 0) + 1
            await conn.query('INSERT INTO flyway_schema_history (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success, installed_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())', [nextRank, version || null, description, 'SQL', sc.name, checksum, 'SchemaPilot', execTime, 1])
            await conn.query('COMMIT')
          } catch (e) { historyErr = String(e?.message || e) }
          await conn.end()
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, historyError: historyErr || undefined }))
          return
        } else if (cfg.type === 'PostgreSQL') {
          const client = new PgClient({ host: cfg.host, port: Number(cfg.port || '5432'), user: cfg.user, password: cfg.password, database: cfg.database })
          await client.connect()
          const schema = cfg.schema && cfg.schema.trim() ? cfg.schema : 'public'
          await client.query(`SET search_path TO ${schema}`)
          await ensureHistoryTablePg(client, schema)
          await client.query(sc.content)
          const execTime = Date.now() - startTime
          let historyErr = ''
          try {
            const resRank = await client.query(`SELECT MAX(installed_rank) as max_rank FROM ${schema}.flyway_schema_history`)
            const nextRank = (Number(resRank.rows[0]?.max_rank) || 0) + 1
            await client.query(`INSERT INTO ${schema}.flyway_schema_history (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success, installed_on) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`, [nextRank, version || null, description, 'SQL', sc.name, checksum, 'SchemaPilot', execTime, true])
            await client.query('COMMIT')
          } catch (e) { historyErr = String(e?.message || e) }
          await client.end()
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, historyError: historyErr || undefined }))
          return
        } else {
          res.statusCode = 400
          res.end(JSON.stringify({ ok: false, error: 'Unsupported DB type' }))
          return
        }
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ ok: false, error: String(err?.message || 'Migration execution failed') }))
      }
      return
    }

    if (req.url.startsWith('/api/redis-test')) {
      try {
        const body = await readJson(req)
        const hRaw = String(body.host ?? '').trim()
        const host = hRaw && hRaw !== 'undefined' ? hRaw : '127.0.0.1'
        const portR = Number(body.port ?? 6379) || 6379
        const dbIndex = Number(body.dbIndex ?? 0) || 0
        const password = body.password ? String(body.password) : undefined
        const client = createRedisClient({ socket: { host, port: portR }, database: dbIndex, password })
        await client.connect()
        await client.ping()
        await client.quit()
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ ok: false, error: String(err?.message || 'Redis test failed') }))
      }
      return
    }

    if (req.url.startsWith('/api/ai/config/save')) {
      try {
        const body = await readJson(req)
        const ai = body.ai
        const redisCfg = body.redis
        if (!ai) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'Missing AI config' })); return }
        if (!redisCfg?.enabled) {
          volatileAiConfig = ai
          try {
            const dir = path.dirname(localAiConfigPath)
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(localAiConfigPath, JSON.stringify(ai), 'utf-8')
          } catch {}
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
          return
        }
        const client = createRedisClient({ socket: { host: String(redisCfg.host), port: Number(redisCfg.port || 6379) }, database: Number(redisCfg.dbIndex ?? 0), password: redisCfg.password ? String(redisCfg.password) : undefined })
        await client.connect()
        await client.set('schema-pilot:ai:config', JSON.stringify(ai))
        await client.quit()
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ ok: false, error: String(err?.message || 'Save AI config failed') }))
      }
      return
    }

    if (req.url.startsWith('/api/ai/config/get')) {
      try {
        const u = new URL(req.url, 'http://localhost')
        const host = u.searchParams.get('host') || '127.0.0.1'
        const portR = Number(u.searchParams.get('port') || 6379)
        const dbIndex = Number(u.searchParams.get('dbIndex') || 0)
        const password = u.searchParams.get('password') || ''
        const client = createRedisClient({ socket: { host, port: portR }, database: dbIndex, password: password ? String(password) : undefined })
        await client.connect()
        const raw = await client.get('schema-pilot:ai:config')
        await client.quit()
        let aiCfg = raw ? JSON.parse(raw) : (volatileAiConfig || null)
        if (!aiCfg && fs.existsSync(localAiConfigPath)) { try { aiCfg = JSON.parse(fs.readFileSync(localAiConfigPath, 'utf-8')) } catch {} }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, ai: aiCfg }))
      } catch (err) {
        let aiCfg = volatileAiConfig || null
        if (!aiCfg && fs.existsSync(localAiConfigPath)) { try { aiCfg = JSON.parse(fs.readFileSync(localAiConfigPath, 'utf-8')) } catch {} }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, ai: aiCfg }))
      }
      return
    }

    if (req.url.startsWith('/api/config/save')) {
      try {
        const body = await readJson(req)
        const cfg = body.config
        const redisCfg = body.redis
        if (!cfg) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'Missing config' })); return }
        const dbCfg = {
          type: String(cfg.type || ''),
          host: String(cfg.host || ''),
          port: String(cfg.port || ''),
          database: String(cfg.database || ''),
          user: String(cfg.user || ''),
          password: String(cfg.password || ''),
          schema: String(cfg.schema || ''),
          scriptsPath: String(cfg.scriptsPath || ''),
        }
        const redisConn = cfg.redis || {}
        const appPassword = String(cfg.appPassword || '')
        if (redisCfg?.enabled) {
          const client = createRedisClient({ socket: { host: String(redisCfg.host), port: Number(redisCfg.port || 6379) }, database: Number(redisCfg.dbIndex ?? 0), password: redisCfg.password ? String(redisCfg.password) : undefined })
          await client.connect()
          await client.set('schema-pilot:db:config', JSON.stringify(dbCfg))
          await client.set('schema-pilot:redis:config', JSON.stringify(redisConn))
          await client.set('schema-pilot:security:password', appPassword)
          await client.quit()
        } else {
          const p = path.resolve(projectRoot, '.schema-pilot')
          try {
            fs.mkdirSync(p, { recursive: true })
            fs.writeFileSync(path.join(p, 'db-config.json'), JSON.stringify(dbCfg || {}), 'utf-8')
            fs.writeFileSync(path.join(p, 'redis-config.json'), JSON.stringify(redisConn || {}), 'utf-8')
            fs.writeFileSync(path.join(p, 'security-password.txt'), appPassword, 'utf-8')
          } catch {}
        }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ ok: false, error: String(err?.message || 'Save config failed') }))
      }
      return
    }

    if (req.url.startsWith('/api/config/get')) {
      try {
        const u = new URL(req.url, 'http://localhost')
        const host = u.searchParams.get('host') || '127.0.0.1'
        const portR = Number(u.searchParams.get('port') || 6379)
        const dbIndex = Number(u.searchParams.get('dbIndex') || 0)
        const password = u.searchParams.get('password') || ''
        let cfg = null
        try {
          const client = createRedisClient({ socket: { host, port: portR }, database: dbIndex, password: password ? String(password) : undefined })
          await client.connect()
          const rawDb = await client.get('schema-pilot:db:config')
          const rawRedis = await client.get('schema-pilot:redis:config')
          const rawSec = await client.get('schema-pilot:security:password')
          await client.quit()
          const dbCfg = rawDb ? JSON.parse(rawDb) : {}
          const redisCfg = rawRedis ? JSON.parse(rawRedis) : {}
          const secPass = typeof rawSec === 'string' ? rawSec : ''
          cfg = { ...dbCfg, redis: redisCfg, appPassword: secPass }
        } catch {}
        if (!cfg || Object.keys(cfg).length === 0) {
          const p = path.resolve(projectRoot, '.schema-pilot')
          const fDb = path.join(p, 'db-config.json')
          const fRedis = path.join(p, 'redis-config.json')
          const fSec = path.join(p, 'security-password.txt')
          let dbCfg = {}
          let redisCfg = {}
          let secPass = ''
          try { if (fs.existsSync(fDb)) dbCfg = JSON.parse(fs.readFileSync(fDb, 'utf-8')) } catch {}
          try { if (fs.existsSync(fRedis)) redisCfg = JSON.parse(fs.readFileSync(fRedis, 'utf-8')) } catch {}
          try { if (fs.existsSync(fSec)) secPass = fs.readFileSync(fSec, 'utf-8') } catch {}
          cfg = { ...dbCfg, redis: redisCfg, appPassword: secPass }
        }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, config: cfg }))
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ ok: false, error: String(err?.message || 'Get config failed') }))
      }
      return
    }

    if (req.url.startsWith('/api/ai/prompt/get')) {
      try {
        const u = new URL(req.url, 'http://localhost')
        const source = u.searchParams.get('source') || ''
        let text = ''
        if (source === 'default') {
          const p = path.resolve(projectRoot, 'prompts/analyze.md')
          text = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : ''
        } else {
          text = await readPrompt()
          if (!text) {
            const p = path.resolve(projectRoot, 'prompts/analyze.md')
            text = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : ''
          }
        }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, text }))
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ ok: false, error: String(err?.message || 'Get prompt failed') }))
      }
      return
    }

    if (req.url.startsWith('/api/ai/prompt/save')) {
      try {
        const body = await readJson(req)
        const promptText = String(body.prompt || '')
        if (!promptText.trim()) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'Empty prompt' })); return }
        const redisCfg = body.redis
        if (redisCfg?.enabled) {
          const client = createRedisClient({ socket: { host: String(redisCfg.host), port: Number(redisCfg.port || 6379) }, database: Number(redisCfg.dbIndex ?? 0), password: redisCfg.password ? String(redisCfg.password) : undefined })
          await client.connect()
          await client.set('schema-pilot:ai:prompt:analyze', promptText)
          await client.quit()
        } else {
          const p = path.resolve(projectRoot, 'prompts')
          if (!fs.existsSync(p)) { try { fs.mkdirSync(p, { recursive: true }) } catch {} }
          const out = path.join(p, 'analyze.md')
          try { fs.writeFileSync(out, promptText, 'utf-8') } catch {}
        }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ ok: false, error: String(err?.message || 'Save prompt failed') }))
      }
      return
    }

    if (req.url === '/api/ai/analyze') {
      try {
        const body = await readJson(req)
        let ai = body.config?.ai
        if (!ai?.provider || !ai?.model || !ai?.apiKey) {
          try {
            const client = createRedisClient({ socket: { host: '127.0.0.1', port: 6379 } })
            await client.connect()
            const raw = await client.get('schema-pilot:ai:config')
            await client.quit()
            ai = raw ? JSON.parse(raw) : undefined
          } catch {}
        }
        if (!ai?.provider || !ai?.model || !ai?.apiKey) {
          ai = volatileAiConfig || (fs.existsSync(localAiConfigPath) ? JSON.parse(fs.readFileSync(localAiConfigPath, 'utf-8')) : undefined)
        }
        if (!ai?.provider || !ai?.model || !ai?.apiKey) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: false, error: 'AI config incomplete' })); return }
        const sql = String(body.script?.content || '')
        const title = String(body.script?.name || 'script.sql')
        const role = await readPrompt()
        const userInput = `脚本文件名: ${title}\n\n\`\`\`sql\n${sql}\n\`\`\``
        let text = ''
        if (ai.provider === 'Gemini') {
          const prompt = `${role}\n\n### 输入脚本\n${userInput}`
          const resp = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ai.model)}:generateContent?key=${encodeURIComponent(ai.apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }) }, 12000)
          if (!resp.ok) { const errText = await resp.text().catch(() => ''); throw new Error(`Gemini HTTP ${resp.status}: ${errText}`) }
          const data = await resp.json()
          text = (data?.candidates?.[0]?.content?.parts?.[0]?.text) || 'No output'
        } else if (ai.provider === 'DeepSeek') {
          const resp = await fetchWithTimeout('https://api.deepseek.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ai.apiKey}` }, body: JSON.stringify({ model: ai.model || 'deepseek-chat', messages: [ { role: 'system', content: role }, { role: 'user', content: userInput } ] }) }, 12000)
          if (!resp.ok) {
            const errText = await resp.text().catch(() => '')
            const gmKey = process.env.GEMINI_API_KEY || ''
            if (String(resp.status) === '402' && gmKey) {
              const prompt = `${role}\n\n### 输入脚本\n${userInput}`
              const gmResp = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent('gemini-2.5-flash')}:generateContent?key=${encodeURIComponent(gmKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }) }, 12000)
              if (!gmResp.ok) { const gmErrText = await gmResp.text().catch(() => ''); throw new Error(`Gemini HTTP ${gmResp.status}: ${gmErrText}`) }
              const gmData = await gmResp.json()
              text = (gmData?.candidates?.[0]?.content?.parts?.[0]?.text) || 'No output'
            } else {
              throw new Error(`DeepSeek HTTP ${resp.status}: ${errText}`)
            }
          } else {
            const data = await resp.json()
            text = (data?.choices?.[0]?.message?.content) || 'No output'
          }
        } else { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'Unsupported provider' })); return }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, text }))
      } catch (err) {
        res.statusCode = 500
        const message = String(err?.message || 'AI analyze failed')
        const isAbort = message.includes('aborted') || message.includes('AbortError')
        res.end(JSON.stringify({ ok: false, error: isAbort ? 'AI request timeout' : message }))
      }
      return
    }

    if (req.url.startsWith('/api/ai/analyze/stream')) {
      try {
        const body = await readJson(req)
        let ai = body.config?.ai
        if (!ai?.provider || !ai?.model || !ai?.apiKey) {
          try { const client = createRedisClient({ socket: { host: '127.0.0.1', port: 6379 } }); await client.connect(); const raw = await client.get('schema-pilot:ai:config'); await client.quit(); ai = raw ? JSON.parse(raw) : undefined } catch {}
        }
        const es = sseInit(res)
        if (!ai?.provider || !ai?.model || !ai?.apiKey) ai = volatileAiConfig || (fs.existsSync(localAiConfigPath) ? JSON.parse(fs.readFileSync(localAiConfigPath, 'utf-8')) : undefined)
        if (!ai?.provider || !ai?.model || !ai?.apiKey) { es.send('Error: AI config incomplete'); es.end(); return }
        const sql = String(body.script?.content || '')
        const title = String(body.script?.name || 'script.sql')
        const role = await readPrompt()
        const userInput = `脚本文件名: ${title}\n\n\`\`\`sql\n${sql}\n\`\`\``
        if (ai.provider === 'DeepSeek') {
          const controller = new AbortController()
          req.on('close', () => { try { controller.abort() } catch {} })
          const resp = await fetchWithTimeout('https://api.deepseek.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream', 'Authorization': `Bearer ${ai.apiKey}` }, body: JSON.stringify({ model: ai.model || 'deepseek-chat', messages: [ { role: 'system', content: role }, { role: 'user', content: userInput } ], stream: true, stream_options: { include_usage: false }, temperature: 0.7, top_p: 0.95 }), signal: controller.signal }, 18000)
          if (!resp.ok || !resp.body) {
            const errText = await resp.text().catch(() => '')
            const gmKey = process.env.GEMINI_API_KEY || ''
            if (String(resp.status) === '402' && gmKey) {
              const prompt = `${role}\n\n### 输入脚本\n${userInput}`
              es.send('提示：DeepSeek 余额不足，自动切换 Gemini')
              const gmResp = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent('gemini-2.5-flash')}:generateContent?key=${encodeURIComponent(gmKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }) }, 18000)
              if (!gmResp.ok) { const gmErr = await gmResp.text().catch(() => ''); es.send(`Error: Gemini HTTP ${gmResp.status}: ${gmErr}`); es.end(); return }
              const gmData = await gmResp.json()
              const gmText = (gmData?.candidates?.[0]?.content?.parts?.[0]?.text) || ''
              if (!gmText) { es.send('No output'); es.end(); return }
              const pieces = String(gmText).split(/\n\n/)
              const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
              for (const p of pieces) { es.send(p); await sleep(60) }
              es.end()
              return
            }
            es.send(`Error: DeepSeek HTTP ${resp.status}: ${errText}`)
            es.end()
            return
          }
          const reader = resp.body.getReader()
          const decoder = new TextDecoder()
          let finished = false
          while (!finished) {
            const { value, done } = await reader.read()
            finished = done
            if (value) {
              const chunk = decoder.decode(value, { stream: true })
              const lines = chunk.split(/\r?\n/)
              let sawDone = false
              for (const line of lines) {
                if (!line.startsWith('data:')) continue
                const data = line.replace(/^data:\s*/, '').trim()
                if (!data) continue
                if (data === '[DONE]') { sawDone = true; break }
                try { const json = JSON.parse(data); const delta = json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || ''; if (delta) es.send(delta) } catch { es.send(data) }
              }
              if (sawDone) { try { await reader.cancel() } catch {} break }
            }
          }
          es.end()
        } else {
          const prompt = `${role}\n\n### 输入脚本\n${userInput}`
          const resp = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ai.model)}:generateContent?key=${encodeURIComponent(ai.apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }) }, 18000)
          if (!resp.ok) { const errText = await resp.text().catch(() => ''); es.send(`Error: Gemini HTTP ${resp.status}: ${errText}`); es.end(); return }
          const data = await resp.json()
          const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text) || ''
          if (!text) { es.send('No output'); es.end(); return }
          const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
          const chunkText = (s, size) => { const out = []; for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size)); return out }
          const pieces = chunkText(String(text), 15)
          for (const p of pieces) { es.send(p); await sleep(30) }
          es.end()
        }
      } catch (err) {
        try { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write(`data: ${String(err?.message || 'AI analyze failed')}\n\n`); res.end() } catch {}
      }
      return
    }

    if (req.url.startsWith('/api/ai/generate-sql/stream')) {
      try {
        const body = await readJson(req)
        let ai = body.config?.ai
        if (!ai?.provider || !ai?.model || !ai?.apiKey) { try { const client = createRedisClient({ socket: { host: '127.0.0.1', port: 6379 } }); await client.connect(); const raw = await client.get('schema-pilot:ai:config'); await client.quit(); ai = raw ? JSON.parse(raw) : undefined } catch {} }
        const es = sseInit(res)
        if (!ai?.provider || !ai?.model || !ai?.apiKey) ai = volatileAiConfig || (fs.existsSync(localAiConfigPath) ? JSON.parse(fs.readFileSync(localAiConfigPath, 'utf-8')) : undefined)
        if (!ai?.provider || !ai?.model || !ai?.apiKey) { es.send('Error: AI config incomplete'); es.end(); return }
        const genPath = path.resolve(projectRoot, 'prompts/gen.md')
        const promptMd = fs.existsSync(genPath) ? fs.readFileSync(genPath, 'utf-8') : ''
        const dbInfo = body.config?.type ? `数据库类型: ${String(body.config.type)}` : ''
        const desc = String(body.description || '').trim()
        if (!desc) { es.send('Error: Missing description'); es.end(); return }
        const userMsg = `${dbInfo ? dbInfo + '\n' : ''}${desc}`
        if (ai.provider === 'DeepSeek') {
          const controller = new AbortController()
          req.on('close', () => { try { controller.abort() } catch {} })
          const resp = await fetchWithTimeout('https://api.deepseek.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream', 'Authorization': `Bearer ${ai.apiKey}` }, body: JSON.stringify({ model: ai.model || 'deepseek-chat', messages: [ ...(promptMd ? [{ role: 'system', content: promptMd }] : []), { role: 'user', content: userMsg } ], stream: true, stream_options: { include_usage: false }, temperature: 0.7, top_p: 0.95 }), signal: controller.signal }, 18000)
          if (!resp.ok || !resp.body) {
            const errText = await resp.text().catch(() => '')
            const gmKey = process.env.GEMINI_API_KEY || ''
            if (String(resp.status) === '402' && gmKey) {
              const prompt = `${promptMd}\n\n用户需求:\n${userMsg}`
              es.send('提示：DeepSeek 余额不足，自动切换 Gemini')
              const gmResp = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent('gemini-2.5-flash')}:generateContent?key=${encodeURIComponent(gmKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }) }, 18000)
              if (!gmResp.ok) { const gmErr = await gmResp.text().catch(() => ''); es.send(`Error: Gemini HTTP ${gmResp.status}: ${gmErr}`); es.end(); return }
              const gmData = await gmResp.json()
              const gmText = (gmData?.candidates?.[0]?.content?.parts?.[0]?.text) || ''
              if (!gmText) { es.send('No output'); es.end(); return }
              const pieces = String(gmText).split(/\n\n/)
              const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
              for (const p of pieces) { es.send(p); await sleep(60) }
              es.end()
              return
            }
            es.send(`Error: DeepSeek HTTP ${resp.status}: ${errText}`)
            es.end()
            return
          }
          const reader = resp.body.getReader()
          const decoder = new TextDecoder()
          let finished = false
          while (!finished) {
            const { value, done } = await reader.read()
            finished = done
            if (value) {
              const chunk = decoder.decode(value, { stream: true })
              const lines = chunk.split(/\r?\n/)
              let sawDone = false
              for (const line of lines) {
                if (!line.startsWith('data:')) continue
                const data = line.replace(/^data:\s*/, '').trim()
                if (!data) continue
                if (data === '[DONE]') { sawDone = true; break }
                try { const json = JSON.parse(data); const delta = json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || ''; if (delta) es.send(delta) } catch { es.send(data) }
              }
              if (sawDone) { try { await reader.cancel() } catch {} break }
            }
          }
          es.end()
        } else {
          const resp = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ai.model)}:generateContent?key=${encodeURIComponent(ai.apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [ ...(promptMd ? [{ text: promptMd }] : []), { text: userMsg } ] }] }) }, 18000)
          if (!resp.ok) { const errText = await resp.text().catch(() => ''); es.send(`Error: Gemini HTTP ${resp.status}: ${errText}`); es.end(); return }
          const data = await resp.json()
          const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text) || ''
          if (!text) { es.send('No output'); es.end(); return }
          const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
          const chunkText = (s, size) => { const out = []; for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size)); return out }
          const pieces = chunkText(String(text), 20)
          for (const p of pieces) { es.send(p); await sleep(25) }
          es.end()
        }
      } catch (err) {
        try { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write(`data: ${String(err?.message || 'Generate SQL failed')}\n\n`); res.end() } catch {}
      }
      return
    }

    if (req.url.startsWith('/api/ai/generate-sql')) {
      try {
        const body = await readJson(req)
        let ai = body.config?.ai
        if (!ai?.provider || !ai?.model || !ai?.apiKey) { try { const client = createRedisClient({ socket: { host: '127.0.0.1', port: 6379 } }); await client.connect(); const raw = await client.get('schema-pilot:ai:config'); await client.quit(); ai = raw ? JSON.parse(raw) : undefined } catch {} }
        if (!ai?.provider || !ai?.model || !ai?.apiKey) ai = volatileAiConfig || undefined
        if (!ai?.provider || !ai?.model || !ai?.apiKey) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'AI config incomplete' })); return }
        const dbInfo = body.config?.type ? `Target DB: ${String(body.config.type)}` : ''
        const desc = String(body.description || '').trim()
        if (!desc) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'Missing description' })); return }
        const genPath = path.resolve(projectRoot, 'prompts/gen.md')
        const promptMd = fs.existsSync(genPath) ? fs.readFileSync(genPath, 'utf-8') : ''
        const userMsg = `${dbInfo ? dbInfo + '\n' : ''}用户需求:\n${desc}`
        let text = ''
        if (ai.provider === 'DeepSeek') {
          const resp = await fetchWithTimeout('https://api.deepseek.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ai.apiKey}` }, body: JSON.stringify({ model: ai.model || 'deepseek-reasoner', messages: [ ...(promptMd ? [{ role: 'system', content: promptMd }] : []), { role: 'user', content: userMsg } ] }) }, 15000)
          if (!resp.ok) { const errText = await resp.text().catch(() => ''); throw new Error(`DeepSeek HTTP ${resp.status}: ${errText}`) }
          const data = await resp.json()
          text = (data?.choices?.[0]?.message?.content) || ''
        } else {
          const resp = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ai.model)}:generateContent?key=${encodeURIComponent(ai.apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [ ...(promptMd ? [{ text: promptMd }] : []), { text: userMsg } ] }] }) }, 15000)
          if (!resp.ok) { const errText = await resp.text().catch(() => ''); throw new Error(`Gemini HTTP ${resp.status}: ${errText}`) }
          const data = await resp.json()
          text = (data?.candidates?.[0]?.content?.parts?.[0]?.text) || ''
        }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, text }))
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ ok: false, error: String(err?.message || 'Generate SQL failed') }))
      }
      return
    }

    if (req.url.startsWith('/api/db-test')) {
      try {
        const cfg = await readJson(req)
        if (cfg.type === 'MySQL' || cfg.type === 'MariaDB') {
          const conn = await createConnection({ host: cfg.host, port: Number(cfg.port || '3306'), user: cfg.user, password: cfg.password, database: cfg.database })
          await conn.query('SELECT 1')
          await conn.end()
        } else if (cfg.type === 'PostgreSQL') {
          const client = new PgClient({ host: cfg.host, port: Number(cfg.port || '5432'), user: cfg.user, password: cfg.password, database: cfg.database })
          await client.connect()
          await client.query('SELECT 1')
          await client.end()
        } else { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'Unsupported DB type' })); return }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ ok: false, error: String(err?.message || 'DB test failed') }))
      }
      return
    }

    res.statusCode = 404
    res.end(JSON.stringify({ error: 'Not found' }))
  } catch (e) {
    try { res.statusCode = 500; res.end(JSON.stringify({ error: 'Internal error' })) } catch {}
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`[SchemaPilot Node] Listening on http://0.0.0.0:${port}`)
})

