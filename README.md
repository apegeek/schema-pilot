<div align="center">
  <h1>SchemaPilot Studio · 数据库迁移可视化工作台</h1>
  <p>Visual, Operable, and Insightful Flyway migrations</p>

  <p>
    <img alt="React" src="https://img.shields.io/badge/React-19.0-61DAFB?logo=react" />
    <img alt="Vite" src="https://img.shields.io/badge/Vite-5.x-646CFF?logo=vite" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript" />
    <img alt="Flyway" src="https://img.shields.io/badge/Flyway-Schema%20History-E83D44?logo=flyway" />
    <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-Server-4169E1?logo=postgresql" />
    <img alt="MySQL" src="https://img.shields.io/badge/MySQL-Server-4479A1?logo=mysql" />
  </p>
</div>

---

## 为什么做
- 数据库迁移是交付关键路径，但脚本与历史常常分散、不可视、不可操作。
- SchemaPilot Studio 把“脚本树 / 历史记录 / SQL 编辑与执行 / 运行日志”整合在一个可视化工作台中，提升迁移效率、降低出错率。
- 目标：让 Flyway 迁移像操作 IDE 一样顺手，脚本管理“可见、可改、可控”。

## 核心优势
- 三栏工作台：左侧脚本树、中栏历史表、右侧 SQL 编辑器，底部统一运行日志。
- 真连接测试：支持 MySQL/PostgreSQL 的真实连接校验，错误即报错。
- 文件系统直连：读取并上传 `.sql` 到你配置的目录（如 `D:\demo`），无中间层。
- 状态映射：脚本与 `flyway_schema_history` 自动比对，标记“已应用/失败/待执行”。
- 语法高亮与编辑：SQL 高亮、行号、可滚动；仅“待执行”脚本可编辑与保存。
- 即时刷新：配置变更后自动拉取最新脚本与历史，展示实时数据。
- 免密刷新：登录后 30 分钟免登录，刷新不丢状态。

## 功能特性
- 脚本树
  - 递归读取配置目录，解析 `V<版本>__<描述>.sql` 文件结构
  - 上传新脚本至配置目录；执行状态图标与文案支持中英
- 历史记录
  - 原始数据来自 `flyway_schema_history`，包含脚本名、耗时、执行状态
  - 列表数据不缓存，每次刷新即查询最新
- SQL 编辑器
  - CodeMirror 高亮；仅“待执行”允许编辑与保存
  - 全屏查看，长脚本更易读；顶部工具栏两行布局，长文件名不挤压按钮
- 运行日志
  - 统一置底，横跨中栏+右栏，不遮挡脚本树；支持打开/隐藏

## 快速开始
### 环境要求
- Node.js 18+
- 推荐包管理器：pnpm

### 安装与启动
```bash
pnpm install
pnpm run dev
```
访问：`http://localhost:3000`

### 构建与预览
```bash
pnpm run build
pnpm run preview
```

## 使用说明
- 配置
  - 打开右上角设置，填写数据库信息与脚本目录（如 `D:\demo`）
  - “测试连接”会进行真实连接与 `SELECT 1` 校验
- 浏览脚本
  - 左侧树显示脚本；点击文件在右侧查看与编辑
  - 上传按钮支持 `.sql` 文件，保存到你配置的目录
- 编辑与保存
  - 仅“待执行”脚本可编辑；内容变更后显示“保存”按钮
  - 保存会写入真实文件系统，并在列表中立即生效
- 变更历史
  - 中栏表格显示 `flyway_schema_history` 最新记录；支持滚动查看

## 截图与布局
- 三栏工作台（左：脚本树｜中：历史表｜右：SQL 编辑器），底部运行日志
- 可拖拽调整列宽，分隔条带有握柄图标与“拖拽以调整宽度”提示

> 注：截图与演示 GIF 可在仓库的 `docs/` 目录补充添加

## 部署
- 本项目为前端 SPA 应用，可配合任何静态服务器部署 `dist/`
  - Nginx 示例：
    ```nginx
    server {
      listen 80;
      server_name your-domain;
      root /var/www/schema-pilot/dist;
      location / { try_files $uri /index.html; }
    }
    ```
- 开发服务内置了部分后端路由（文件读取/上传、连接测试），生产环境请按需替换为你自己的后端服务。

## SEO 与曝光建议
- 项目名与描述：
  - 英文：`SchemaPilot Studio — Visual Flyway Migration Workbench`
  - 中文：`SchemaPilot Studio — 数据库迁移可视化工作台`
- 关键词建议：
  - `Flyway 可视化`、`数据库迁移工具`、`SQL 脚本管理`、`Schema History`、`React Vite`、`CodeMirror SQL`、`PostgreSQL MySQL`
- README 要素：
  - 清晰的功能列表、快速开始、截图/GIF、架构说明与路线图
  - 添加 GitHub 话题（Topics）：`flyway` `database-migration` `sql` `react` `vite` `visualization`
  - 在项目简介中加入英文与中文双语描述，提高搜索覆盖
  - 在 Releases 与 Tags 中标注语义化版本（如 `v1.1.0`），便于外部引用与聚合

## 路线图
- 数据源扩展：支持更多数据库类型与云托管服务
- 审批与安全：脚本变更审计、只读/维护窗口策略
- 团队协作：多人编辑与变更 CR 流程
- 生产后端：将开发路由替换为独立服务，提供鉴权与审计

## License
- 本项目采用“SchemaPilot Studio 社区许可协议（Community License）”。
- 允许学习与研究、个人与组织内部使用（含生产部署）；不允许售卖或有偿分发。
- 如需二次开发并售卖或对外收费，请联系作者获取商业授权：`jiang.dai@hopechart.com`。
- 详见仓库根目录的 `LICENSE` 文件。

---

> 旧称 “Flyway 可视化工具” 已升级为 “SchemaPilot Studio”。如需变更仓库名与路径，请同步更新仓库 Settings 与文档中的链接。

## 作者
- 85后全栈工程师，职业生涯献给编程与产品化实践，长期专注高质量交付与工程化能力建设。
- 持续钻研前沿技术：AI 应用与工程、云原生与 DevOps、数据工程与数据库演进；相信技术与体验的统一价值。
- 热爱交友与户外，倡导开放协作与知识共享，愿与同行共建更卓越的数据与应用生态。
- 联系邮箱：`jiang.dai@hopechart.com`

## 支持项目
- 如果 SchemaPilot Studio 对你有帮助，欢迎 Star、Fork 与分享；也可通过以下方式支持项目：

<div align="center">
  <table>
    <tr>
      <td align="center">
        <strong>支付宝</strong><br/>
        <img alt="Alipay QR" src="./docs/donate-alipay.png" width="180" />
      </td>
      <td align="center">
        <strong>微信</strong><br/>
        <img alt="WeChat QR" src="./docs/donate-wechat.png" width="180" />
      </td>
    </tr>
  </table>
  <p>（请将上述二维码图片替换为你的收款码）</p>
  <p>你的支持将用于：完善功能、撰写文档与示例、维护社区与路线图。</p>
</div>
