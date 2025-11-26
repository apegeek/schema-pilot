import path from 'path';
import fs from 'fs';
import { URL } from 'url';
import { createHash } from 'crypto';
import type { IncomingMessage } from 'http';
import type { DbConfig, HistoryRecord } from './types';
import { createConnection } from 'mysql2/promise';
import { Client as PgClient } from 'pg';
import { createClient as createRedisClient } from 'redis';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import type { AiModelConfig } from './types';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        {
          name: 'flyway-fs-api',
          configureServer(server) {
            const projectRoot = process.cwd();
            const fetchWithTimeout = async (url: string, opts: any, timeoutMs: number) => {
              const timeoutCtrl = new AbortController();
              const timer = setTimeout(() => timeoutCtrl.abort(), timeoutMs);
              const composeSignal = (a?: AbortSignal, b?: AbortSignal) => {
                if (!a && !b) return undefined;
                const ac = new AbortController();
                const onAbort = () => { try { ac.abort(); } catch {} };
                if (a) a.addEventListener('abort', onAbort, { once: true });
                if (b) b.addEventListener('abort', onAbort, { once: true });
                return ac.signal;
              };
              const signal = composeSignal(opts?.signal, timeoutCtrl.signal);
              try {
                const resp = await fetch(url, { ...opts, signal });
                clearTimeout(timer);
                return resp;
              } catch (e) {
                clearTimeout(timer);
                throw e;
              }
            };

            const readJson = async (req: IncomingMessage) => {
              const chunks: Buffer[] = [];
              await new Promise<void>((resolve) => {
                req.on('data', (c) => chunks.push(Buffer.from(c)));
                req.on('end', () => resolve());
              });
              const raw = Buffer.concat(chunks).toString('utf-8');
              try { return JSON.parse(raw || '{}'); } catch { return {}; }
            };

            const walkSqlFiles = (baseDir: string): string[] => {
              const out: string[] = [];
              const entries = fs.existsSync(baseDir)
                ? fs.readdirSync(baseDir, { withFileTypes: true })
                : [];
              for (const e of entries) {
                const fp = path.join(baseDir, e.name);
                if (e.isDirectory()) out.push(...walkSqlFiles(fp));
                else if (e.isFile() && e.name.toLowerCase().endsWith('.sql')) out.push(fp);
              }
              return out;
            };

            const parseName = (fileName: string) => {
              const m = fileName.match(/^V([^_]+)__(.+)\.sql$/i);
              const version = m ? m[1] : '';
              const description = m ? m[2].replace(/_/g, ' ') : fileName;
              return { version, description };
            };

            const readPrompt = async (): Promise<string> => {
              try {
                const client = createRedisClient({ socket: { host: '127.0.0.1', port: 6379 } });
                await client.connect();
                const raw = await client.get('schema-pilot:ai:prompt:analyze');
                await client.quit();
                if (raw && raw.trim()) return raw;
              } catch {}
              const p = path.resolve(projectRoot, 'prompts/analyze.md');
              try { return fs.readFileSync(p, 'utf-8'); } catch { return ''; }
            };

            let volatileAiConfig: AiModelConfig | null = null;
            const localAiConfigPath = path.resolve(projectRoot, '.schema-pilot/ai-config.json');

            server.middlewares.use(async (req, res, next) => {
              if (!req.url) return next();
              if (req.url.startsWith('/api/scripts')) {
                try {
                  const u = new URL(req.url, 'http://localhost');
                  const pathParam = u.searchParams.get('path') || '';
                  const base = path.isAbsolute(pathParam)
                    ? pathParam
                    : path.resolve(projectRoot, pathParam);
                  const files = walkSqlFiles(base);
                  const scripts = files.map((full) => {
                    const relDir = path.relative(base, path.dirname(full)).replace(/\\/g, '/');
                    const name = path.basename(full);
                    const { version, description } = parseName(name);
                    const id = createHash('md5').update(full).digest('hex');
                    const content = fs.readFileSync(full, 'utf-8');
                    return {
                      id,
                      version,
                      description,
                      name,
                      content,
                      status: 'PENDING',
                      type: 'SQL',
                      path: relDir || ''
                    };
                  });
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(scripts));
                  return;
                } catch (err) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: 'Failed to read scripts' }));
                  return;
                }
              }

              if (req.url.startsWith('/api/scripts/upload')) {
                try {
                  const body = await readJson(req);
                  const targetDir = String(body.path || '');
                  const fileName = String(body.name || '');
                  const content = String(body.content || '');
                  if (!targetDir || !fileName) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ ok: false, error: 'Missing path or name' }));
                    return;
                  }
                  const base = path.isAbsolute(targetDir)
                    ? targetDir
                    : path.resolve(projectRoot, targetDir);
                  const safeName = path.basename(fileName);
                  if (!safeName.toLowerCase().endsWith('.sql')) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ ok: false, error: 'Only .sql files allowed' }));
                    return;
                  }
                  if (!fs.existsSync(base)) {
                    fs.mkdirSync(base, { recursive: true });
                  }
                  const outPath = path.join(base, safeName);
                  fs.writeFileSync(outPath, content, 'utf-8');
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ ok: false, error: String(err?.message || 'Upload failed') }));
                }
                return;
              }

              if (req.url.startsWith('/api/scripts/save')) {
                try {
              const body = await readJson(req);
              const targetDir = String(body.path || '');
              const relDir = String(body.dir || '');
              const fileName = String(body.name || '');
              const content = String(body.content || '');
              if (!targetDir || !fileName) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Missing path or name' }));
                return;
              }
              const base = path.isAbsolute(targetDir)
                ? targetDir
                : path.resolve(projectRoot, targetDir);
              const safeName = path.basename(fileName);
              const safeDir = relDir.replace(/\\/g, '/');
              const outDir = safeDir ? path.join(base, safeDir) : base;
              if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
              const outPath = path.join(outDir, safeName);
              fs.writeFileSync(outPath, content, 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch (err: any) {
              console.error('[API Error] Save script failed:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: String(err?.message || 'Save failed') }));
            }
                return;
              }

              if (req.url.startsWith('/api/history')) {
                try {
                  const cfg = await readJson(req) as DbConfig;
                  let rows: any[] = [];
                  if (cfg.type === 'MySQL' || cfg.type === 'MariaDB') {
                    const conn = await createConnection({
                      host: cfg.host,
                      port: Number(cfg.port || '3306'),
                      user: cfg.user,
                      password: cfg.password,
                      database: cfg.database
                    });
                    const [result] = await conn.execute('SELECT installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success FROM flyway_schema_history ORDER BY installed_rank');
                    rows = Array.isArray(result) ? result : [];
                    await conn.end();
                  } else if (cfg.type === 'PostgreSQL') {
                    const client = new PgClient({
                      host: cfg.host,
                      port: Number(cfg.port || '5432'),
                      user: cfg.user,
                      password: cfg.password,
                      database: cfg.database
                    });
                    await client.connect();
                    const schema = cfg.schema && cfg.schema.trim() ? cfg.schema : 'public';
                    const resPg = await client.query(`SELECT installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success FROM ${schema}.flyway_schema_history ORDER BY installed_rank`);
                    rows = resPg.rows || [];
                    await client.end();
                  } else {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Unsupported DB type' }));
                    return;
                  }
                  const data: HistoryRecord[] = rows.map((r: any) => ({
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
                  }));
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(data));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: String(err?.message || 'History query failed') }));
                }
                return;
              }

              if (req.url.startsWith('/api/migrate')) {
                try {
                  const body = await readJson(req) as { config: DbConfig, script: { name: string, content: string } };
                  const cfg = body.config;
                  const sc = body.script;
                  if (!cfg || !sc || !sc.content) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ ok: false, error: 'Missing config or script' }));
                    return;
                  }
                  if (cfg.type === 'MySQL' || cfg.type === 'MariaDB') {
                    const conn = await createConnection({
                      host: cfg.host,
                      port: Number(cfg.port || '3306'),
                      user: cfg.user,
                      password: cfg.password,
                      database: cfg.database,
                      multipleStatements: true
                    });
                    await conn.query(sc.content);
                    await conn.end();
                  } else if (cfg.type === 'PostgreSQL') {
                    const client = new PgClient({
                      host: cfg.host,
                      port: Number(cfg.port || '5432'),
                      user: cfg.user,
                      password: cfg.password,
                      database: cfg.database
                    });
                    await client.connect();
                    const schema = cfg.schema && cfg.schema.trim() ? cfg.schema : 'public';
                    await client.query(`SET search_path TO ${schema}`);
                    await client.query(sc.content);
                    await client.end();
                  } else {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ ok: false, error: 'Unsupported DB type' }));
                    return;
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ ok: false, error: String(err?.message || 'Migration execution failed') }));
                }
                return;
              }

              if (req.url.startsWith('/api/redis-test')) {
                try {
                  const body = await readJson(req);
                  const client = createRedisClient({
                    socket: { host: String(body.host), port: Number(body.port || 6379) },
                    database: Number(body.dbIndex ?? 0),
                    password: body.password ? String(body.password) : undefined,
                  });
                  await client.connect();
                  await client.ping();
                  await client.quit();
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ ok: false, error: String(err?.message || 'Redis test failed') }));
                }
                return;
              }

              if (req.url.startsWith('/api/ai/config/save')) {
                try {
                  const body = await readJson(req) as { ai?: AiModelConfig, redis?: any };
                  const ai = body.ai;
                  const redisCfg = body.redis;
                  if (!ai) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ ok: false, error: 'Missing AI config' }));
                    return;
                  }
                  if (!redisCfg?.enabled) {
                    volatileAiConfig = ai;
                    try {
                      const dir = path.dirname(localAiConfigPath);
                      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                      fs.writeFileSync(localAiConfigPath, JSON.stringify(ai), 'utf-8');
                    } catch {}
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: true }));
                    return;
                  }
                  const client = createRedisClient({
                    socket: { host: String(redisCfg.host), port: Number(redisCfg.port || 6379) },
                    database: Number(redisCfg.dbIndex ?? 0),
                    password: redisCfg.password ? String(redisCfg.password) : undefined,
                  });
                  await client.connect();
                  const key = 'schema-pilot:ai:config';
                  await client.set(key, JSON.stringify(ai));
                  await client.quit();
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ ok: false, error: String(err?.message || 'Save AI config failed') }));
                }
                return;
              }

              if (req.url.startsWith('/api/ai/config/get')) {
                try {
                  const u = new URL(req.url, 'http://localhost');
                  const host = u.searchParams.get('host') || '';
                  void host; // reserved for future scoping
                  const client = createRedisClient({ socket: { host: '127.0.0.1', port: 6379 } });
                  await client.connect();
                  const key = 'schema-pilot:ai:config';
                  const raw = await client.get(key);
                  await client.quit();
                  let aiCfg = raw ? JSON.parse(raw) : (volatileAiConfig || null);
                  if (!aiCfg && fs.existsSync(localAiConfigPath)) {
                    try { aiCfg = JSON.parse(fs.readFileSync(localAiConfigPath, 'utf-8')); } catch {}
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true, ai: aiCfg }));
                } catch (err: any) {
                  let aiCfg = volatileAiConfig || null;
                  if (!aiCfg && fs.existsSync(localAiConfigPath)) {
                    try { aiCfg = JSON.parse(fs.readFileSync(localAiConfigPath, 'utf-8')); } catch {}
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true, ai: aiCfg }));
                }
                return;
              }

              if (req.url.startsWith('/api/ai/prompt/get')) {
                try {
                  const u = new URL(req.url, 'http://localhost');
                  const source = u.searchParams.get('source') || '';
                  let text = '';
                  if (source === 'default') {
                    const p = path.resolve(projectRoot, 'prompts/analyze.md');
                    text = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
                  } else {
                    text = await readPrompt();
                    if (!text) {
                      const p = path.resolve(projectRoot, 'prompts/analyze.md');
                      text = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
                    }
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true, text }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ ok: false, error: String(err?.message || 'Get prompt failed') }));
                }
                return;
              }

              if (req.url.startsWith('/api/ai/prompt/save')) {
                try {
                  const body = await readJson(req) as { prompt: string, redis?: any };
                  const promptText = String(body.prompt || '');
                  if (!promptText.trim()) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ ok: false, error: 'Empty prompt' }));
                    return;
                  }
                  const redisCfg = body.redis;
                  if (redisCfg?.enabled) {
                    const client = createRedisClient({
                      socket: { host: String(redisCfg.host), port: Number(redisCfg.port || 6379) },
                      database: Number(redisCfg.dbIndex ?? 0),
                      password: redisCfg.password ? String(redisCfg.password) : undefined,
                    });
                    await client.connect();
                    await client.set('schema-pilot:ai:prompt:analyze', promptText);
                    await client.quit();
                  } else {
                    const client = createRedisClient({ socket: { host: '127.0.0.1', port: 6379 } });
                    try {
                      await client.connect();
                      await client.set('schema-pilot:ai:prompt:analyze', promptText);
                      await client.quit();
                    } catch {}
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ ok: false, error: String(err?.message || 'Save prompt failed') }));
                }
                return;
              }

              if (req.url === '/api/ai/analyze') {
                try {
                  const body = await readJson(req) as { config?: DbConfig, script: { name: string, content: string } };
                  let ai = body.config?.ai as AiModelConfig | undefined;
                  if (!ai?.provider || !ai?.model || !ai?.apiKey) {
                    try {
                      const client = createRedisClient({ socket: { host: '127.0.0.1', port: 6379 } });
                      await client.connect();
                      const raw = await client.get('schema-pilot:ai:config');
                      await client.quit();
                      ai = raw ? JSON.parse(raw) as AiModelConfig : undefined;
                    } catch {}
                  }
                  if (!ai?.provider || !ai?.model || !ai?.apiKey) {
                    ai = volatileAiConfig || (fs.existsSync(localAiConfigPath) ? JSON.parse(fs.readFileSync(localAiConfigPath, 'utf-8')) : undefined);
                  }
                  if (!ai?.provider || !ai?.model || !ai?.apiKey) {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: false, error: 'AI config incomplete' }));
                    return;
                  }
                  const sql = String(body.script?.content || '');
                  const title = String(body.script?.name || 'script.sql');
                  const role = await readPrompt();
                  const userInput = `脚本文件名: ${title}\n\n\`\`\`sql\n${sql}\n\`\`\``;
                  let text = '';
                  if (ai.provider === 'Gemini') {
                    const prompt = `${role}\n\n### 输入脚本\n${userInput}`;
                    const resp = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ai.model)}:generateContent?key=${encodeURIComponent(ai.apiKey)}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
                    }, 12000);
                    if (!resp.ok) {
                      const errText = await resp.text().catch(() => '');
                      throw new Error(`Gemini HTTP ${resp.status}: ${errText}`);
                    }
                    const data = await resp.json();
                    text = (data?.candidates?.[0]?.content?.parts?.[0]?.text) || (data?.candidates?.[0]?.content?.parts?.[0]?.text) || 'No output';
                  } else if (ai.provider === 'DeepSeek') {
                    const resp = await fetchWithTimeout('https://api.deepseek.com/v1/chat/completions', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${ai.apiKey}`
                      },
                      body: JSON.stringify({
                        model: ai.model || 'deepseek-chat',
                        messages: [
                          { role: 'system', content: role },
                          { role: 'user', content: userInput }
                        ]
                      })
                    }, 12000);
                    if (!resp.ok) {
                      const errText = await resp.text().catch(() => '');
                      const gmKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
                      if (String(resp.status) === '402' && gmKey) {
                        const prompt = `${role}\n\n### 输入脚本\n${userInput}`;
                        const gmResp = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent('gemini-2.5-flash')}:generateContent?key=${encodeURIComponent(gmKey)}`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
                        }, 12000);
                        if (!gmResp.ok) {
                          const gmErrText = await gmResp.text().catch(() => '');
                          throw new Error(`Gemini HTTP ${gmResp.status}: ${gmErrText}`);
                        }
                        const gmData = await gmResp.json();
                        text = (gmData?.candidates?.[0]?.content?.parts?.[0]?.text) || 'No output';
                      } else {
                        throw new Error(`DeepSeek HTTP ${resp.status}: ${errText}`);
                      }
                    } else {
                      const data = await resp.json();
                      text = (data?.choices?.[0]?.message?.content) || 'No output';
                    }
                  } else {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ ok: false, error: 'Unsupported provider' }));
                    return;
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true, text }));
                } catch (err: any) {
                  res.statusCode = 500;
                  console.error('[AI Analyze Error]', err);
                  const message = String(err?.message || 'AI analyze failed');
                  const isAbort = message.includes('aborted') || message.includes('AbortError');
                  res.end(JSON.stringify({ ok: false, error: isAbort ? 'AI request timeout' : message }));
                }
                return;
              }

              if (req.url.startsWith('/api/ai/analyze/stream')) {
                const sseInit = (res: any) => {
                  res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                  });
                  return {
                    send: (d: string) => { try { res.write(`data: ${JSON.stringify(d)}\n\n`); } catch {} },
                    end: () => { try { res.write('event: done\n'); res.write('data: [DONE]\n\n'); res.end(); } catch {} }
                  };
                };
                try {
                  const body = await readJson(req) as { config?: DbConfig, script: { name: string, content: string } };
                  let ai = body.config?.ai as AiModelConfig | undefined;
                  if (!ai?.provider || !ai?.model || !ai?.apiKey) {
                    try {
                      const client = createRedisClient({ socket: { host: '127.0.0.1', port: 6379 } });
                      await client.connect();
                      const raw = await client.get('schema-pilot:ai:config');
                      await client.quit();
                      ai = raw ? JSON.parse(raw) as AiModelConfig : undefined;
                    } catch {}
                  }
                  const es = sseInit(res);
                  if (!ai?.provider || !ai?.model || !ai?.apiKey) {
                    ai = volatileAiConfig || (fs.existsSync(localAiConfigPath) ? JSON.parse(fs.readFileSync(localAiConfigPath, 'utf-8')) : undefined);
                  }
                  if (!ai?.provider || !ai?.model || !ai?.apiKey) {
                    es.send('Error: AI config incomplete');
                    es.end();
                    return;
                  }
                  const sql = String(body.script?.content || '');
                  const title = String(body.script?.name || 'script.sql');
                  const role = await readPrompt();
                  const userInput = `脚本文件名: ${title}\n\n\`\`\`sql\n${sql}\n\`\`\``;
                  if (ai.provider === 'DeepSeek') {
                    const controller = new AbortController();
                    req.on('close', () => { try { controller.abort(); } catch {} });
                    const resp = await fetchWithTimeout('https://api.deepseek.com/v1/chat/completions', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'text/event-stream',
                        'Authorization': `Bearer ${ai.apiKey}`
                      },
                      body: JSON.stringify({
                        model: ai.model || 'deepseek-chat',
                        messages: [
                          { role: 'system', content: role },
                          { role: 'user', content: userInput }
                        ],
                        stream: true,
                        stream_options: { include_usage: false },
                        temperature: 0.7,
                        top_p: 0.95
                      }),
                      signal: controller.signal
                    }, 18000);
                    if (!resp.ok || !resp.body) {
                      const errText = await resp.text().catch(() => '');
                      const gmKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
                      if (String(resp.status) === '402' && gmKey) {
                        const prompt = `${role}\n\n### 输入脚本\n${userInput}`;
                        es.send('提示：DeepSeek 余额不足，自动切换 Gemini');
                        const gmResp = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent('gemini-2.5-flash')}:generateContent?key=${encodeURIComponent(gmKey)}`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
                        }, 18000);
                        if (!gmResp.ok) {
                          const gmErr = await gmResp.text().catch(() => '');
                          es.send(`Error: Gemini HTTP ${gmResp.status}: ${gmErr}`);
                          es.end();
                          return;
                        }
                        const gmData = await gmResp.json();
                        const gmText = (gmData?.candidates?.[0]?.content?.parts?.[0]?.text) || '';
                        if (!gmText) {
                          es.send('No output');
                          es.end();
                          return;
                        }
                        const pieces = String(gmText).split(/\n\n/);
                        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
                        for (const p of pieces) { es.send(p); await sleep(60); }
                        es.end();
                        return;
                      }
                      console.error('[DeepSeek Stream Error]', resp.status, errText);
                      es.send(`Error: DeepSeek HTTP ${resp.status}: ${errText}`);
                      es.end();
                      return;
                    }
                    const reader = resp.body.getReader();
                    const decoder = new TextDecoder();
                    let finished = false;
                    while (!finished) {
                      const { value, done } = await reader.read();
                      finished = done;
                      if (value) {
                        const chunk = decoder.decode(value, { stream: true });
                        const lines = chunk.split(/\r?\n/);
                        let sawDone = false;
                        for (const line of lines) {
                          if (!line.startsWith('data:')) continue;
                          const data = line.replace(/^data:\s*/, '').trim();
                          if (!data) continue;
                          if (data === '[DONE]') { sawDone = true; break; }
                          try {
                            const json = JSON.parse(data);
                            const delta = json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || '';
                            if (delta) es.send(delta);
                          } catch {
                            es.send(data);
                          }
                        }
                        if (sawDone) {
                          try { await reader.cancel(); } catch {}
                          break;
                        }
                      }
                    }
                    es.end();
                  } else {
                    const prompt = `${role}\n\n### 输入脚本\n${userInput}`;
                    const resp = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ai.model)}:generateContent?key=${encodeURIComponent(ai.apiKey)}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
                    }, 18000);
                    if (!resp.ok) {
                      const errText = await resp.text().catch(() => '');
                      es.send(`Error: Gemini HTTP ${resp.status}: ${errText}`);
                      es.end();
                      return;
                    }
                    const data = await resp.json();
                    const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text) || '';
                    if (!text) {
                      es.send('No output');
                      es.end();
                      return;
                    }
                    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
                    const chunkText = (s: string, size: number): string[] => {
                      const out: string[] = [];
                      for (let i = 0; i < s.length; i += size) {
                        out.push(s.slice(i, i + size));
                      }
                      return out;
                    };
                    const pieces = chunkText(String(text), 15);
                    for (const p of pieces) { es.send(p); await sleep(30); }
                    es.end();
                  }
                } catch (err: any) {
                  console.error('[AI Analyze Stream Error]', err);
                  try {
                    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
                    res.write(`data: ${String(err?.message || 'AI analyze failed')}\n\n`);
                    res.end();
                  } catch {}
                }
                return;
              }

              if (req.url.startsWith('/api/ai/generate-sql')) {
                try {
                  const body = await readJson(req) as { config?: DbConfig, description: string };
                  let ai = body.config?.ai as AiModelConfig | undefined;
                  if (!ai?.provider || !ai?.model || !ai?.apiKey) {
                    try {
                      const client = createRedisClient({ socket: { host: '127.0.0.1', port: 6379 } });
                      await client.connect();
                      const raw = await client.get('schema-pilot:ai:config');
                      await client.quit();
                      ai = raw ? JSON.parse(raw) as AiModelConfig : undefined;
                    } catch {}
                  }
                  if (!ai?.provider || !ai?.model || !ai?.apiKey) {
                    ai = volatileAiConfig || undefined;
                  }
                  if (!ai?.provider || !ai?.model || !ai?.apiKey) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ ok: false, error: 'AI config incomplete' }));
                    return;
                  }
                  const dbInfo = body.config?.type ? `Target DB: ${String(body.config.type)}` : '';
                  const desc = String(body.description || '').trim();
                  if (!desc) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ ok: false, error: 'Missing description' }));
                    return;
                  }
                  const prompt = `${dbInfo}\nDesign DDL strictly following these rules:\n- Output ONE fenced block labeled sql only\n- Include CREATE TABLE statements with primary key, NOT NULL constraints\n- Include indexes and foreign keys if relationships are described\n- Use snake_case naming\n- Add created_at TIMESTAMP and updated_at TIMESTAMP where appropriate\n- Avoid DROP statements\n\nRequirements:\n${desc}`;
                  let text = '';
                  if (ai.provider === 'DeepSeek') {
                    const resp = await fetchWithTimeout('https://api.deepseek.com/v1/chat/completions', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${ai.apiKey}`
                      },
                      body: JSON.stringify({ model: ai.model || 'deepseek-reasoner', messages: [{ role: 'user', content: prompt }] })
                    }, 15000);
                    if (!resp.ok) {
                      const errText = await resp.text().catch(() => '');
                      throw new Error(`DeepSeek HTTP ${resp.status}: ${errText}`);
                    }
                    const data = await resp.json();
                    text = (data?.choices?.[0]?.message?.content) || '';
                  } else {
                    const resp = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ai.model)}:generateContent?key=${encodeURIComponent(ai.apiKey)}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
                    }, 15000);
                    if (!resp.ok) {
                      const errText = await resp.text().catch(() => '');
                      throw new Error(`Gemini HTTP ${resp.status}: ${errText}`);
                    }
                    const data = await resp.json();
                    text = (data?.candidates?.[0]?.content?.parts?.[0]?.text) || '';
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true, text }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ ok: false, error: String(err?.message || 'Generate SQL failed') }));
                }
                return;
              }

              if (req.url.startsWith('/api/db-test')) {
                try {
                  const cfg = await readJson(req) as DbConfig;
                  if (cfg.type === 'MySQL' || cfg.type === 'MariaDB') {
                    const conn = await createConnection({
                      host: cfg.host,
                      port: Number(cfg.port || '3306'),
                      user: cfg.user,
                      password: cfg.password,
                      database: cfg.database
                    });
                    await conn.query('SELECT 1');
                    await conn.end();
                  } else if (cfg.type === 'PostgreSQL') {
                    const client = new PgClient({
                      host: cfg.host,
                      port: Number(cfg.port || '5432'),
                      user: cfg.user,
                      password: cfg.password,
                      database: cfg.database
                    });
                    await client.connect();
                    await client.query('SELECT 1');
                    await client.end();
                  } else {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ ok: false, error: 'Unsupported DB type' }));
                    return;
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ ok: false, error: String(err?.message || 'DB test failed') }));
                }
                return;
              }

              next();
            });
          },
        },
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
