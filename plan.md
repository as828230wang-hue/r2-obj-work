## 这是一个cloudflare的r2对象存储的计划文档，用于记录和跟踪项目的进展和任务。

## 1. 项目概述
- 项目名称：cloudflare-r2-obj-work
- 项目目标：使用cloudflare的r2对象存储进行数据存储和管理。
- 项目团队：由前端开发、后端开发和运维人员组成。

## 2. 项目计划
1, 使用work page 管理和暂时存储数据
2, 暴露API接口，供前端和后端使用
3, 使用cloudflare的r2对象存储进行数据存储和管理
4, 后台管理页面加上鉴权处理
5, 对外暴露的API接口进行鉴权处理
6, 后台管理可以对数据进行增删改查的操作, 同时管理API接口的权限, 生成API接口的鉴权令牌
7, 暂定这些功能的实现，后续根据需求进行调整和优化。

## 3 开发环境
- 官方的地址:https://dash.cloudflare.com/cb827a3099c66aa300fb16559c5b8c41/r2/default/buckets/hkjc/settings#public-dev-url, 已经登陆并打开了页面.
- 可以使用chrome-cdp-skills 进行调试和开发, 获取相关的配置信息。
- 检查是否安装了cloudflare的相关工具和库，如r2-cli、cloudflare-cli等。
- 检查是否安装了node.js和npm，用于开发和部署项目。
- 如果项目支持bun.js，检查是否安装了bun.js和bun-magic, 尽量使用bun.js进行开发。
- python的虚拟环境: /Volumes/Work/python/py312env/bin/python
- 如果需要使用python开发, http客户端统一使用curl_cffi, 并统一使用asyncio进行异步编程。
- 检查是否安装了git，用于版本控制和协作开发。
- 第一阶段在test目录下进行开发，第二阶段在dev目录下进行开发，第三阶段在prod目录下进行开发。
- 所有项目和环境不要使用docker，尽量使用bun.js进行开发。

## 4. 开发进展
### 第一阶段 (test/ 目录) — 已完成 ✅ (2026-07-29, 本地验证通过)
技术栈: Cloudflare Workers + Hono, D1(SQLite) 存鉴权/令牌, R2 存对象。

已实现 plan 全部 7 项功能:
1. Workers 计算层 (Hono), 启动时幂等建表 + 引导管理员账号
2. 对外 API (`/api/*`): 对象的 增/查/下载/覆盖/删除, 返回 JSON
3. R2 对象存储 (`BUCKET` 绑定, bucket `hkjc`)
4. 后台鉴权: 用户名+密码 (PBKDF2) → 签名 session cookie (HMAC-SHA256)
5. API 鉴权: Bearer 令牌 (sha256 哈希入库), 令牌即用即失效可停用
6. 后台 CRUD (`/admin`): 上传/列表/下载/删除对象; 令牌管理(生成/列表/停用); 令牌明文仅展示一次

权限模型: 令牌授权 `objects:read` / `objects:write` (或 `*`), 中间件按需校验。

本地运行:
```bash
cd test && bun run dev      # http://localhost:8787  默认 admin / admin12345 (.dev.vars)
```
本地冒烟测试 15 项全部通过: 健康检查/登录页/错密401/正密302/仪表盘/上传/令牌生成/无令牌401/列表/上传/下载/删除/只读令牌写403读200/停用令牌401/删除。

### 第二/三阶段 (dev/ prod/) — 待办
部署前置:
1. `bun run db:create:prod` 创建远程 D1, 把返回的 database_id 填回 wrangler.toml
2. R2 bucket `hkjc` 已存在于 dashboard; 确认即可
3. `wrangler secret put SESSION_SECRET` 和 `wrangler secret put ADMIN_PASSWORD`
4. `bun run db:apply:prod` 建表, `bun run deploy`

## 5. 目标确认与转向（2026-07-29）
真实目标：**开放 token 鉴权 API，供开发者存放足球赛事投注详细记录与赛事信息；后台可管理/查看数据**。
因此项目从"R2 对象存储台"转为"**足球投注台账 API（多租户隔离）+ 管理后台**"，D1 为主存，R2 仅存附件。

数据模型（D1，全部按 token_id 隔离）：matches / bookmaker_accounts / bet_records(含 profit/hedge_group_id) / odds_snapshots / hedge_groups / attachments。
决策：①按 token 隔离（每开发者只看自己的数据，含 R2 附件）；②完整版字段（含对冲/盈亏）；③D1 + R2(附件)。

### dev/ 阶段（隔离真实资源）— 已完成本地验证 ✅
- 真实资源：D1 `hkjc-dev`(e837e24b…) + R2 `hkjc-dev`（与 prod hkjc 隔离）
- 运行：`wrangler dev --port 8788`（本地仿真）；`wrangler dev --remote --port 8788`（真实 hkjc-dev 联调）
- API（token 鉴权+scope）：/api/matches /api/bets(/settle) /api/accounts /api/hedges /api/odds /api/attachments(R2) /api/stats/summary /api/stats/by
- 后台：控制台(盈亏看板+按庄家盈亏+最近投注+令牌管理+改密) / 投注表(筛选+结算+删) / 赛事表 / 账号表
追加接口：`/api/data`（通用自定义数据，按 Content-Type 自动分流——JSON→D1、二进制→R2，按 key 幂等 upsert，token 隔离；权限 data:read|write）。已本地验证：JSON/blob CRUD、幂等、类型切换(R2 清理)、隔离、god 视图 /admin/data。
- 本地冒烟全过：隔离(A/B 互不可见、附件也隔离)、权限(只读→403)、CRUD、结算盈亏(profit 90)、god-mode 后台、R2 附件上传下载

### 待办（prod 阶段）
prod 用 hkjc(D1 d92feeff… + R2 hkjc)。部署：`wrangler secret put SESSION_SECRET/ADMIN_PASSWORD` → `bun run db:apply:prod` → `wrangler deploy`（仍遵循本地先过再上云）。