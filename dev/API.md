# 足球投注台账 · 开发者 API 文档

Token 鉴权的 REST API，供开发者存放**足球赛事 / 投注记录 / 自定义数据**。所有数据按令牌（开发者）隔离，互不可见。

- **Base URL**：部署后的 Worker 地址，记作 `https://<WORKER>`（本地开发为 `http://localhost:8788`）
- **令牌**：由后台管理控制台签发，明文仅展示一次；调用时放在请求头
- **数据存储**：结构化数据 → D1（SQLite）；二进制文件 → R2 对象存储
- **时间字段**：均为 **epoch 秒（UTC）**

---

## 1. 鉴权与通用约定

### 鉴权
所有请求必须携带 Bearer 令牌：
```bash
curl -H "Authorization: Bearer <TOKEN>" https://<WORKER>/api/bets
```
- 缺令牌 → `401 {"error":"missing bearer token"}`
- 令牌无效/已停用 → `401 {"error":"invalid or revoked token"}`
- 权限不足 → `403 {"error":"token lacks permission: xxx"}`

### 令牌权限（scope）
| scope | 含义 |
|---|---|
| `matches:read` / `matches:write` | 赛事 读 / 写 |
| `bets:read` / `bets:write` | 投注 读 / 写（账号、对冲、统计、附件也归这组） |
| `data:read` / `data:write` | 自定义数据 读 / 写 |
| `*` | 通配（拥有全部权限） |

> 投注相关的账号 / 对冲 / 统计 / 附件接口，复用 `bets:read|write` 权限。

### 数据隔离
每个令牌只能读写**自己提交的数据**。一个令牌查询不到另一个令牌的赛事、投注、自定义数据或 R2 附件。

### 分页（游标）
列表接口统一用游标分页：
- 请求参数：`limit`（默认 100，最大 500）、`cursor`（上一页返回的 `next_cursor`）
- 响应字段：`next_cursor`（还有下一页时给出游标，**已是最后一页则为 `null`**）
- 赛事/投注：`cursor` 是记录 `id`（整数）；自定义数据：`cursor` 是 `key`（字符串）

### 错误格式
```json
{ "error": "描述信息" }
```
常见状态码：`400` 参数错误 · `401` 未鉴权 · `403` 权限不足 · `404` 不存在 · `500` 服务端错误

---

## 2. 赛事 Matches

### 字段
| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | int | 服务端生成 |
| `ext_id` | string? | **开发者自定义赛事 ID**，租户内唯一；用于幂等 upsert |
| `league` / `season` | string? | 联赛 / 赛季 |
| `home_team` / `away_team` | string? | 主 / 客队 |
| `kickoff_at` | int? | 开赛时间（epoch 秒） |
| `home_score` / `away_score` | int? | 比分 |
| `status` | string | `scheduled`(默认) / `live` / `finished` / `cancelled` |
| `source` / `notes` / `raw` | string? | 来源 / 备注 / 原始 JSON |

### 列表（分页）
```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "https://<WORKER>/api/matches?limit=50&cursor=123"
# → { "matches": [ {...}, ... ], "next_cursor": 99 }
```

### 新建/更新（按 ext_id 幂等）
提交时若 `ext_id` 已存在则更新，否则新建：
```bash
curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  "https://<WORKER>/api/matches" \
  -d '{
    "ext_id": "epl-2026-ars-che",
    "league": "EPL", "season": "2026",
    "home_team": "Arsenal", "away_team": "Chelsea",
    "kickoff_at": 1785400000, "status": "scheduled"
  }'
# → 201 { "id": 1 }
```

### 查询 / 更新 / 删除单条
```bash
curl -H "Authorization: Bearer <TOKEN>" "https://<WORKER>/api/matches/1"
curl -X PUT -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  "https://<WORKER>/api/matches/1" -d '{"home_score":2,"away_score":1,"status":"finished"}'
curl -X DELETE -H "Authorization: Bearer <TOKEN>" "https://<WORKER>/api/matches/1"
```

---

## 3. 投注 Bets（核心）

### 字段
| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | int | 服务端生成 |
| `match_id` | int? | 关联赛事 id |
| `account_id` | int? | 关联账号 id |
| `ticket_id` | string? | 平台注单号 |
| `bookmaker` | string? | 庄家：`hkjc` / `ps3838` / `hupu` 等 |
| `market` | string? | 市场：`1x2` / `handicap` / `over_under` / `corner` 等 |
| `bet_side` | string? | 方向：`home`/`away`/`draw`/`over`/`under` 等 |
| `line` | float? | 盘口（让球数 / 大小球线） |
| `odds` | float? | 十进制赔率 |
| `stake` | float | **下注金额（必填，>0）** |
| `currency` | string | 默认 `CNY` |
| `result` | string | `pending`(默认) / `win` / `loss` / `void` / `half_win` / `half_loss` |
| `payout` / `profit` | float? | 返还 / 净盈亏（结算后自动算 profit = payout − stake） |
| `placed_at` | int? | 下注时间（epoch 秒） |
| `settled_at` | int? | 结算时间（结算时自动写） |
| `hedge_group_id` | int? | 对冲组 id |
| `notes` / `raw` | string? | 备注 / 原始 JSON |

### 列表（分页 + 筛选）
```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "https://<WORKER>/api/bets?bookmaker=hkjc&result=pending&limit=50&cursor=200"
# → { "bets": [ {...}, ... ], "next_cursor": 150 }
```
可选筛选：`bookmaker` `market` `result` `match_id` `hedge_group_id`。

### 新建投注
```bash
curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  "https://<WORKER>/api/bets" \
  -d '{
    "match_id": 1,
    "bookmaker": "hkjc", "market": "handicap", "bet_side": "home", "line": -0.5,
    "odds": 1.90, "stake": 1000, "placed_at": 1785399000,
    "notes": "阿森纳 -0.5"
  }'
# → 201 { "id": 5 }
```

### 结算（自动算盈亏）
```bash
curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  "https://<WORKER>/api/bets/5/settle" -d '{"result":"win","payout":1900}'
# → { "settled": true }   ; profit = 1900 - 1000 = 900
```

### 查询 / 更新 / 删除
```bash
curl -H "Authorization: Bearer <TOKEN>" "https://<WORKER>/api/bets/5"
curl -X PUT -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  "https://<WORKER>/api/bets/5" -d '{"hedge_group_id":1,"notes":"已配对对冲"}'
curl -X DELETE -H "Authorization: Bearer <TOKEN>" "https://<WORKER>/api/bets/5"
```

---

## 4. 统计 Stats（盈亏）

### 汇总
```bash
curl -H "Authorization: Bearer <TOKEN>" "https://<WORKER>/api/stats/summary"
# → {
#   "total_bets": 12, "settled_bets": 8, "pending_bets": 4,
#   "total_stake": 8000, "settled_stake": 5000, "total_profit": 1250
# }
```

### 按维度分组盈亏
```bash
curl -H "Authorization: Bearer <TOKEN>" "https://<WORKER>/api/stats/by?dimension=bookmaker"
# → { "dimension":"bookmaker", "rows":[ {"key":"hkjc","bets":5,"stake":3000,"profit":800}, ... ] }
```
`dimension` 可选 `bookmaker` / `market` / `result`。

---

## 5. 庄家账号 Accounts

```bash
# 列表
curl -H "Authorization: Bearer <TOKEN>" "https://<WORKER>/api/accounts"
# 新建
curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  "https://<WORKER>/api/accounts" -d '{"bookmaker":"ps3838","label":"主号","currency":"CNY","balance":20000}'
# → 201 { "id": 1 }
# 删除
curl -X DELETE -H "Authorization: Bearer <TOKEN>" "https://<WORKER>/api/accounts/1"
```

---

## 6. 对冲组 Hedges 与 赔率快照 Odds

### 对冲组
```bash
curl -H "Authorization: Bearer <TOKEN>" "https://<WORKER>/api/hedges"
curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  "https://<WORKER>/api/hedges" \
  -d '{"name":"ars-che 套利","strategy":"arbitrage","expected_profit":50,"total_stake":2000}'
# → 201 { "id": 1 }   ; 之后在 /api/bets 用 hedge_group_id 把多注关联到本组
```

### 赔率快照（赛前记录）
```bash
curl -H "Authorization: Bearer <TOKEN>" "https://<WORKER>/api/odds?match_id=1"
curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  "https://<WORKER>/api/odds" \
  -d '{"match_id":1,"bookmaker":"hkjc","market":"handicap","bet_side":"home","line":-0.5,"odds":1.90,"captured_at":1785398000}'
# → 201 { "id": 1 }
```

---

## 7. 附件 Attachments（R2 对象存储）

存放投注单截图、票据 PDF 等二进制附件。R2 key 按令牌命名空间隔离。

```bash
# 上传（原始字节）—— ?filename= &bet_id= &match_id= &kind= 可选
curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: image/png" \
  "https://<WORKER>/api/attachments?filename=slip-5.png&bet_id=5&kind=slip" \
  --data-binary @ticket.png
# → 201 { "id": 1, "r2_key": "<token>/attachments/...-slip-5.png", "size": 12345 }

# 列表（可按 bet_id 过滤）
curl -H "Authorization: Bearer <TOKEN>" "https://<WORKER>/api/attachments?bet_id=5"

# 下载（返回原始字节流）
curl -H "Authorization: Bearer <TOKEN>" "https://<WORKER>/api/attachments/1" -o slip.png

# 删除
curl -X DELETE -H "Authorization: Bearer <TOKEN>" "https://<WORKER>/api/attachments/1"
```

---

## 8. 自定义数据 Custom Data（`/api/data`）

通用接口：按 `Content-Type` 自动分流——**JSON 落 D1，二进制落 R2**，按 `key` 幂等。适合存放任意结构化数据或文件。

### 提交 / 覆盖（PUT 或 POST）
```bash
# 提交 JSON（→ D1）
curl -X PUT -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  "https://<WORKER>/api/data?key=reports/2026/ars-che" \
  -d '{"any":"json","you":[{"want":true}]}'
# → { "id":1, "key":"reports/2026/ars-che", "kind":"json", "size":35 }

# 提交二进制（→ R2）
curl -X PUT -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/pdf" \
  "https://<WORKER>/api/data?key=docs/manual.pdf" --data-binary @manual.pdf
# → { "id":2, "key":"docs/manual.pdf", "kind":"blob", "r2_key":"<token>/data/docs%2Fmanual.pdf", "size":10240 }
```
> 同一 `key` 再次提交即覆盖；JSON↔二进制切换时会自动清理旧 R2 对象。

### 读取
```bash
# 取单条（JSON 直返内容；二进制返回字节流）
curl -H "Authorization: Bearer <TOKEN>" "https://<WORKER>/api/data?key=reports/2026/ars-che"

# 列表（分页，按前缀过滤）
curl -H "Authorization: Bearer <TOKEN>" \
  "https://<WORKER>/api/data?prefix=reports/&limit=50&cursor=reports%2F2026%2Fa"
# → { "data":[{"id":1,"key":"...","kind":"json","content_type":"application/json","size":35,"updated_at":1785400000}, ...], "next_cursor":"reports/2026/b" }
```

### 删除
```bash
curl -X DELETE -H "Authorization: Bearer <TOKEN>" "https://<WORKER>/api/data?key=reports/2026/ars-che"
# → { "deleted": true }
```

### 批量（单批上限 100）

**批量写 JSON**：
```bash
curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  "https://<WORKER>/api/data/batch" \
  -d '{"items":[{"key":"m/a","data":{"x":1}},{"key":"m/b","data":{"x":2}}]}'
# → { "upserted": 2, "keys": ["m/a","m/b"] }
```

**批量取**：
```bash
curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  "https://<WORKER>/api/data/batch/get" -d '{"keys":["m/a","m/b"]}'
# → { "items":[ {"id":..,"key":"m/a","kind":"json","json":"{\"x\":1}",...}, ... ] }
```

**批量删**（自动清理对应 R2 对象）：
```bash
curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  "https://<WORKER>/api/data/batch/delete" -d '{"keys":["m/a","m/b"]}'
# → { "deleted": 2, "blobs_cleaned": 0 }
```

---

## 9. 快速开始

```bash
BASE=https://<WORKER>
TOK=<你的令牌>

# 1) 建赛事
MATCH=$(curl -s -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  "$BASE/api/matches" -d '{"ext_id":"epl-1","home_team":"Arsenal","away_team":"Chelsea","kickoff_at":1785400000}')
MID=$(echo "$MATCH" | grep -o '"id":[0-9]*' | grep -o '[0-9]*')

# 2) 下注
curl -s -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  "$BASE/api/bets" -d "{\"match_id\":$MID,\"bookmaker\":\"hkjc\",\"market\":\"handicap\",\"bet_side\":\"home\",\"line\":-0.5,\"odds\":1.9,\"stake\":1000}"

# 3) 结算 + 看盈亏
curl -s -H "Authorization: Bearer $TOK" "$BASE/api/stats/summary"
```

---

## 10. 端点速查

| 方法 | 路径 | scope | 说明 |
|---|---|---|---|
| GET | `/api/matches` | matches:read | 赛事列表（分页） |
| POST | `/api/matches` | matches:write | 新建/按 ext_id 更新 |
| GET/PUT/DELETE | `/api/matches/:id` | read/write | 单条 |
| GET | `/api/bets` | bets:read | 投注列表（分页+筛选） |
| POST | `/api/bets` | bets:write | 新建投注 |
| GET/PUT/DELETE | `/api/bets/:id` | read/write | 单条 |
| POST | `/api/bets/:id/settle` | bets:write | 结算（算盈亏） |
| GET | `/api/stats/summary` | bets:read | 盈亏汇总 |
| GET | `/api/stats/by?dimension=` | bets:read | 按维度分组盈亏 |
| GET/POST/DELETE | `/api/accounts[/:id]` | bets:read/write | 庄家账号 |
| GET/POST/DELETE | `/api/hedges[/:id]` | bets:read/write | 对冲组 |
| GET/POST | `/api/odds` | matches:read/write | 赔率快照 |
| GET/POST/GET/DELETE | `/api/attachments[/:id]` | bets:read/write | R2 附件 |
| GET/PUT/POST/DELETE | `/api/data` | data:read/write | 自定义数据（JSON↔R2） |
| POST | `/api/data/batch` | data:write | 批量写 JSON |
| POST | `/api/data/batch/get` | data:read | 批量取 |
| POST | `/api/data/batch/delete` | data:write | 批量删 |
