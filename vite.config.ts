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
