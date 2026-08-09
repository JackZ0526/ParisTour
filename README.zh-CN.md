# Paris Tour

[English](README.md) · [更新日志](CHANGELOG.zh-CN.md)

巴黎行程可视化规划器：邀请制登录、按账号云端存档与实时同步，支持按邮箱只读/可编辑共享。地图、时间线与 LLM 推荐一体，帮你把航班、酒店和每日去处排成可走的日程。

## 功能

- **邀请制账号**：白名单邮箱才能注册/登录；未登录无法使用主界面与付费 API
- **云端存档**：日期、航班、酒店、行程与 baseline 按账号保存；左下角 HUD 显示保存状态
- **实时同步**：同行程多端 / 协作者通过 Supabase Realtime 同步修改
- **共享**：主人可按邮箱分享（只读或可编辑）；邀请邮件含登录/注册深链
- **可编辑时间线（DayTimeline）**：拖拽排序、删除、恢复 baseline；按日浏览
- **AI 行程生成**：按航班、酒店与偏好生成多日行程；支持单日重排
- **TripChat**：自然语言改行程（加/换地点、调酒店、切日等）
- **地点添加**：LLM 推荐或 Google 搜索；地点详情、照片与评论
- **地图与导航**：Google Maps 展示当日路线；Directions；航班优先 TimeTable Lookup
- **酒店 / 航班**：酒店区位推荐与选择；航班模板与实时班次查询

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vite · React 19 · TypeScript · Tailwind CSS v4 |
| 地图 | Google Maps（`@react-google-maps/api`）；Leaflet 备用 |
| 后端 / 数据 | Supabase（Auth · Postgres · Realtime · RLS） |
| API 代理 | Vercel Serverless（`/api/*`）：OpenAI、Gemini、RapidAPI、分享邮件 |
| 邮件 | Resend（可选；未配置时可复制邀请链接） |

## 本地运行

1. 在 [Supabase](https://supabase.com) 新建项目
2. SQL Editor 执行 [`supabase/schema.sql`](supabase/schema.sql)
3. 把你的邮箱写入白名单：

```sql
insert into public.allowlist_emails (email) values ('you@example.com');
```

4. Authentication → Providers → Email 开启邮箱密码（本地可关闭「Confirm email」以便立刻登录）
5. 复制 Project URL 与 anon key，配置环境变量后启动：

```bash
npm install
cp .env.example .env
# 填入下方变量
npm run dev
```

浏览器打开 `http://127.0.0.1:5173/`。

### 环境变量（`.env`，已 gitignore）

以 [`.env.example`](.env.example) 为准。**切勿提交密钥。**

```env
# --- 服务端（不要加 VITE_ 前缀）---
RAPIDAPI_KEY=              # 航班：TimeTable Lookup / AeroDataBox
DEEPSEEK_API_KEY=          # 默认优先的大模型（行程、聊天、推荐）
# DEEPSEEK_BASE_URL=       # 可选，默认 https://api.deepseek.com/v1
OPENAI_API_KEY=            # 可选，模型选择器中的 OpenAI 模型
# OPENAI_BASE_URL=         # 可选，默认 https://api.openai.com/v1
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY= # 无 Resend 时用 Auth 发邀请（可选）
RESEND_API_KEY=            # 分享邀请邮件（可选）
RESEND_FROM_EMAIL=Paris Tour <invites@yourdomain.com>
PUBLIC_APP_URL=https://paristour.vercel.app

# --- 浏览器（VITE_）---
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GOOGLE_MAPS_API_KEY=
# VITE_DEEPSEEK_MODEL=deepseek-v4-flash  # 默认 DeepSeek 模型（或 deepseek-v4-pro）
# VITE_OPENAI_MODEL=gpt-5.6-luna     # 覆盖为 OpenAI 模型
# VITE_LLM_ENABLED=true              # false 可隐藏 LLM 能力
```

Google Cloud 建议启用：**Maps JavaScript API**、**Places API (New)**、**Directions API**。HTTP 引荐来源请同时加入：

- `http://127.0.0.1:5173/*`
- `http://localhost:5173/*`
- `https://paristour.vercel.app/*`

本地若出现 `RefererNotAllowedMapError`，就是缺了上面某一条。

Vercel 部署时同步上述变量；付费 `/api/*` 会校验 Supabase JWT + 白名单。未配置 `RESEND_API_KEY` 时分享仍可用，界面会提示手动复制邀请链接。

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 本地开发（Vite） |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 预览生产构建 |
| `npm run lint` | oxlint |
| `npm run release:patch` | patch 升版、更新日志、提交并打 `v*` 标签（不推送） |
| `npm run release:minor` | minor 升版（同上） |
| `npm run release:major` | major 升版（同上） |

## 发版

版本历史见 [CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md) / [CHANGELOG.md](CHANGELOG.md)。

1. 功能提交先合入 `main`（推荐 Conventional Commits：`feat:`、`fix:` 等）。可选：在两份更新日志的 `## [Unreleased]` 下写草稿条目。
2. 若还没有 `v*` 标签，先打一次基线：

```bash
git tag -a v0.2.0 -m v0.2.0 620c6a8
git push origin v0.2.0
```

3. 本地切下一版（写更新日志与 `package.json`、提交、附注标签 — **不推送**）：

```bash
npm run release:patch   # 或 release:minor / release:major
# 仅预览：npm run release -- patch --dry-run
# 只改文件：npm run release -- patch --no-git
git push origin HEAD && git push origin vX.Y.Z
```

4. 推送 `v*` 后，[`.github/workflows/release.yml`](.github/workflows/release.yml) 会创建 GitHub Release，正文取自 `CHANGELOG.md` 对应版本小节。

**自动生成内容**

| 产物 | 来源 |
|------|------|
| `CHANGELOG.md` 版本节 | 上一 `v*` 标签以来的提交说明（`feat`→Added，`fix`→Fixed，其余→Changed）**加上** `Unreleased` 条目 |
| `CHANGELOG.zh-CN.md` 版本节 | 中文标题；若有中文 `Unreleased` 则用之，否则条目与英文相同（无翻译 API） |
| `package.json` `version` | 语义化版本递增 |
| git 标签 `vX.Y.Z` | 打在发版提交上的附注标签 |
| GitHub Release | Workflow 复制该版本的英文更新日志小节 |

## 项目结构（概览）

```
src/
  components/   # DayTimeline、TripMap、TripChat、CloudSave、酒店/航班等
  services/     # 云存档、LLM、Google、航班查询
  data/         # 行程模板、地点、酒店区位、航班模板
  auth/         # Supabase 登录态
api/            # Vercel 代理（OpenAI / RapidAPI / 分享邀请）
supabase/       # schema.sql（账号、存档、共享与 RLS）
```

| 文件 | 内容 |
|------|------|
| `src/data/itinerary.ts` | 每日时间线与地铁提示 |
| `src/data/places.ts` | 地点介绍、坐标、图片 |
| `src/data/hotels.ts` | 酒店区位映射 |
| `src/data/flights.ts` | 推荐航班模板 |
| `supabase/schema.sql` | 账号、行程存档、共享与 RLS |

行程会写入 `localStorage` 作缓存，并 debounce 同步到 Supabase `trips.snapshot`；协作者侧通过 Realtime 拉取更新。

## 截图

<!-- 可在此放入界面截图，例如： -->
<!-- ![主界面](docs/screenshot-main.png) -->

## 说明

- 不做真实订票 / 订房
- 航班与营业信息会变动，请以出行当日为准
- 自驾日请确认 Crit’Air 与租车保险
- 邀请新用户：分享邮箱会自动入白名单；也可手动 `insert into allowlist_emails`
