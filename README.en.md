<div align="center">
  <h1>SchemaPilot Studio · Visual Flyway Migration Workbench</h1>
  <p>Visual, Operable, and Insightful Flyway migrations</p>

  <p>
    <img alt="React" src="https://img.shields.io/badge/React-19.0-61DAFB?logo=react" />
    <img alt="Vite" src="https://img.shields.io/badge/Vite-5.x-646CFF?logo=vite" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript" />
    <img alt="Flyway" src="https://img.shields.io/badge/Flyway-Schema%20History-E83D44?logo=flyway" />
    <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-Server-4169E1?logo=postgresql" />
    <img alt="MySQL" src="https://img.shields.io/badge/MySQL-Server-4479A1?logo=mysql" />
  </p>
  <p><strong>Flyway • Database Migration • Schema History • SQL</strong></p>
</div>

---

> Language / 语言：[English](./README.en.md) · [中文](./README.md)

## Why
- Database migration is on the critical path of delivery. Scripts and history are often scattered, invisible, and hard to operate.
- SchemaPilot Studio integrates Script Tree / History Table / SQL Editor & Execution / Unified Log into one visual workbench to improve migration efficiency and reduce errors.
- Goal: make Flyway migrations as smooth as operating an IDE; ensure scripts are visible, editable, and controllable.

## Core Advantages
- Three-column workbench: left Script Tree, middle History Table, right SQL Editor, with a unified bottom log panel.
- Real connection test: supports MySQL/PostgreSQL with actual connection and `SELECT 1` validation.
- Direct file system access: read and upload `.sql` files to your configured directory.
- Status mapping: automatically compares scripts with `flyway_schema_history`, marking applied/failed/pending.
- Syntax highlight & editing: SQL highlighting and line numbers; only "Pending" scripts are editable.
- Instant refresh: configuration changes trigger fresh reads of scripts and history.
- Session convenience: 30-minute token for quick refresh without re-login.
- AI features: built-in "AI Analyze SQL" and "AI Generate SQL" with Gemini/DeepSeek, streaming output and SQL highlighting.

## Features
- Script Tree
  - Recursively reads configured directory and parses `V<version>__<description>.sql` pattern
  - Upload new scripts to the configured directory; bilingual UI for status labels
- History Table
  - Raw data from `flyway_schema_history` including script name, elapsed time, and execution status
  - No cache; always fetch latest on refresh
- SQL Editor
  - CodeMirror highlighting; only Pending scripts are editable/savable
  - Fullscreen mode; toolbar optimized for long names
- Log Panel
  - Unified bottom panel spanning middle+right columns; open/close and adjustable height

### Backend APIs (Dev Mode)
- `POST /api/ai/analyze/stream`: Streaming AI analysis
- `POST /api/ai/generate-sql/stream`: Streaming AI SQL generation

## Quick Start
### Requirements
- Node.js 18+
- Recommended package manager: pnpm

### Install & Launch
```bash
pnpm install
pnpm run dev
```
Open: `http://localhost:3000`

### Build & Preview
```bash
pnpm run build
pnpm run preview
```

## Usage
- Configuration
  - Open Settings at top-right and fill in database info and script directory
  - "Test Connection" performs real connection and `SELECT 1`
- Browse Scripts
  - Left tree lists scripts; click to view/edit on the right
  - Upload supports `.sql` and writes to your configured path
- Edit & Save
  - Only "Pending" scripts are editable; changes show a "Save" button
  - Save writes to real file system and takes effect immediately
- History
  - Middle table shows latest `flyway_schema_history`; supports scrolling

## Screenshots
- Login: `./docs/login.png`
- Config Wizard (DB & Cache): `./docs/c1.png` – `./docs/c4.png`
- Home: `./docs/home.png`
- AI Generate SQL: `./docs/gen.png`
- AI Analyze SQL: `./docs/ai.png`
- Fullscreen: `./docs/full.png`

## Advanced Capabilities
- AI dual engines & configurable: `Gemini` and `DeepSeek`, customizable provider/model/apiKey, cached prompts, Markdown rendering with SQL highlighting
- Version naming automation: auto-compute next version `V<version>__<slug>.sql` when saving generated content
- SQL-only save: extract fenced or keyword-recognized blocks to ensure only SQL is written
- Layout stability: analysis/generation panels use `min-h-0` and internal scrolling
- Status mapping & read-only protection: applied scripts are read-only, pending are editable
- Redis & local cache: on-demand cache for scripts and history; AI global config read/write
- Connectivity & health checks: real DB test and Redis Ping
- Multi-pane & fullscreen; adjustable bottom log panel
- i18n: Chinese/English toggle
- Production notes: dev router for convenience; replace with your backend for auth & audit in production

## Deployment
- SPA; serve `dist/` with any static server
  - Nginx example:
    ```nginx
    server {
      listen 80;
      server_name your-domain;
      root /var/www/schema-pilot/dist;
      location / { try_files $uri /index.html; }
    }
    ```
- Dev server includes some backend routes (file ops, connection tests); replace with your own service in production

## System Design: Redis Cache & Keyspace
- Purpose: store AI model config (provider/model/apiKey) for unified reads without re-entering
- Keys (latest flat structure, without namespace separators):
  - `schema-pilot:ai:config`: AI model config object (`provider`, `model`, `apiKey`)
  - `schema-pilot:db:config`: global DB config
  - `schema-pilot:security:password`: app login password
  - `schema-pilot:db:history`: latest `flyway_schema_history` snapshot for cache reads
- Routes:
  - `POST /api/ai/config/save`: save AI config to Redis (when enabled)
  - `GET /api/ai/config/get`: read AI config; returns `null` if not set
  - `POST /api/ai/analyze`: AI analysis; prefers request `config.ai`, falls back to Redis/global file

## SEO / Discoverability (GitHub)
- Name & description:
  - English: `SchemaPilot Studio — Visual Flyway Migration Workbench`
  - Chinese: `SchemaPilot Studio — 数据库迁移可视化工作台`
- Keywords: `flyway`, `flyway migration`, `schema history`, `database migration`, `sql`, `react`, `vite`
- README best practices: clear features, quick start, screenshots/GIFs, architecture and roadmap; bilingual improves reach
- Tag releases with semantic versions and add topics

## Roadmap
- Data source expansion: more DB types and cloud-managed services
- Approval & security: audit trails, read-only windows, maintenance mode
- Team collaboration: multi-user editing and change CR flow
- Production backend: replace dev router with standalone services; auth and audit

## Third-Party Dependencies & Acknowledgements
- Core concept & conventions
  - Flyway — database migration and `flyway_schema_history` convention; drives versioned and traceable scripts (https://flywaydb.org/)
- Database access & cache
  - `mysql2` — Node.js MySQL/MariaDB client (https://github.com/sidorares/node-mysql2)
  - `pg` — Node.js PostgreSQL client (https://github.com/brianc/node-postgres)
  - `redis` — Node.js Redis client (https://github.com/redis/node-redis)
- Frontend & build
  - `React`, `React DOM` — rendering framework (https://react.dev/)
  - `Vite` — dev & build tool (https://vitejs.dev/)
  - `TypeScript` — type system (https://www.typescriptlang.org/)
- Editing & rendering
  - `@uiw/react-codemirror`, `@codemirror/lang-sql`, `@codemirror/theme-one-dark`
  - `react-markdown`, `remark-gfm`
  - `react-syntax-highlighter`
  - `lucide-react`
- AI (optional)
  - `@google/genai` and Google Generative Language API; DeepSeek API for reasoning and streaming
- Acknowledgements
  - Sincere thanks to the above open-source projects and maintainers. SchemaPilot benefits greatly from the maturity and best practices of the open-source ecosystem.
  - Names and trademarks belong to their respective owners; references are for technical integration and acknowledgement only.
  - If you maintain related projects or have suggestions, we welcome collaboration. We will keep compatibility, respect licenses, and contribute back.

## License
- Community License — free for study/research and internal use (incl. production); not allowed to sell or distribute for a fee without authorization.
- For commercial licensing, contact: `daijiang@apegeek.com`.
- See [LICENSE](./LICENSE) (Chinese) and [LICENSE.en](./LICENSE.en) (English).

## Author
- Full-stack engineer focused on high-quality delivery and engineering practices; passionate about AI apps, cloud-native/DevOps, data engineering, and database evolution.
- Contact: `daijiang@apegeek.com`.

## Support
- If SchemaPilot helps you, star, fork, and share.
<div align="center">
  <table>
    <tr>
      <td align="center" style="margin: 10px 0; padding-right: 24px;">
        <img alt="Alipay QR" src="./docs/donate-alipay.jpg" width="180" />
      </td>
      <td align="center" style="margin: 10px 0; padding-left: 24px;">
        <img alt="WeChat QR" src="./docs/donate-wechat.jpg" width="180" />
      </td>
    </tr>
  </table>
  <p>Your support helps: feature improvements, writing docs, maintaining the community & roadmap.</p>
</div>
