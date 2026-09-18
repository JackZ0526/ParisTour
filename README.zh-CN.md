# Paris Tour

[项目案例与截图](https://www.jackzhang.ca/paris-tour) · [English](README.md) · [更新日志](CHANGELOG.zh-CN.md)

将共享行程、地图与旅行助手整合在同一个工作空间的个人旅行规划应用。项目起点是一个实际需求：和同行的人一起安排巴黎旅行，让每天的计划更容易理解、调整和共享。

线上应用采用邀请制；[公开项目案例](https://www.jackzhang.ca/paris-tour)无需登录即可查看。

![Paris Tour 每日行程与路线地图](https://raw.githubusercontent.com/JackZ0526/jackzhang-portfolio/main/public/assets/paris-tour/itinerary.webp)

## 我的贡献

我独立负责产品方向、交互与视觉设计、测试和迭代，使用 Cursor 和 Codex 完成代码实现。我的工作包括明确预期体验、在浏览器中检查结果、发现问题并推动修改。

- 多次调整桌面端与移动端布局、导航，以及行程、地图和聊天之间的关系。
- 反复检查动效、面板过渡和明暗主题的视觉表现。
- 测试多人编辑，推动解决更新缺失、旧数据覆盖和界面行为不一致的问题。
- 推进加载反馈、聊天持久化与应用更新体验的改进。

## 迭代记录

近期工作包括重新加载后恢复聊天草稿、处理旧标签页冲突、明确提示应用更新，以及将部分界面拆分加载。

[优化记录](docs/optimization-2026-09-18.md)与[验证记录](docs/verification-2026-09-18.md)说明了修改内容及测试范围。构建文件大小的变化不等于真实页面加载时间的同比改善。

<details>
<summary>旅行助手界面</summary>

![行程旁的旅行助手](https://raw.githubusercontent.com/JackZ0526/jackzhang-portfolio/main/public/assets/paris-tour/assistant.webp)

</details>

截图来自作品集中的真实界面记录；当前应用可能已在截图之后继续调整。

## 功能

- **邀请制账号**：白名单邮箱才能注册/登录；未登录无法使用主界面与付费 API
- **云端存档**：日期、航班、酒店、行程与 baseline 按账号保存；左下角 HUD 显示保存状态
- **实时同步**：同行程多端 / 协作者通过 Supabase Realtime 同步修改
- **共享**：主人可按邮箱分享（只读或可编辑）；邀请邮件含登录/注册深链
- **可编辑时间线（DayTimeline）**：拖拽排序、删除、恢复 baseline；按日浏览
- **AI 行程生成**：按航班、酒店与偏好生成多日行程；支持单日重排
- **TripChat**：自然语言改行程（加/换地点、调酒店、切日等）
- **地点添加**：LLM 推荐或 Google 搜索；地点详情、照片与评论
- **地图与导航**：MapLibre + OpenStreetMap 展示当日地图；openrouteservice 生成道路连线；Google Maps 免密钥导航链接
- **酒店 / 航班**：酒店区位推荐与选择；航班模板与实时班次查询

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vite · React 19 · TypeScript · Tailwind CSS v4 |
| 地图 | MapLibre GL JS + OpenStreetMap；openrouteservice 道路几何 |
| 后端 / 数据 | Supabase（Auth · Postgres · Realtime · RLS） |
| API 代理 | Vercel Serverless（`/api/*`）：模型服务、地点、航班、道路路线和共享 |
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
OPENROUTESERVICE_API_KEY=  # 行程地图道路几何（仅服务端）
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
# VITE_DEEPSEEK_MODEL=deepseek-flash  # DeepSeek V4.1 Flash（原生多模态）
# VITE_OPENAI_MODEL=gpt-5.6-luna     # 覆盖为 OpenAI 模型
# VITE_LLM_ENABLED=true              # false 可隐藏 LLM 能力
```

地图使用 MapLibre GL 与 OpenStreetMap；道路路线使用服务端变量 `OPENROUTESERVICE_API_KEY`。地点查询经过 `/api/google-places`；`.env.example` 说明了默认的 RapidAPI 方式及可选的官方 Google Places 方式（`GOOGLE_PLACES_PROVIDER=official`、`GOOGLE_PLACES_API_KEY`）。请按实际选择配置；地点服务与道路路线服务的错误需要分别排查。

Vercel 部署时同步上述变量；付费 `/api/*` 会校验 Supabase JWT + 白名单。未配置 `RESEND_API_KEY` 时分享仍可用，界面会提示手动复制邀请链接。

聊天意图路由和通用模型预处理通过服务端 `/api/jev` 调用 Vercel AI Gateway 的 `typesafe-ai/jev`（AI SDK 7 evaluation API）。Vercel 部署使用 OIDC，无需 TypeSafe key。本地可用 `vercel env pull` 刷新 `VERCEL_OIDC_TOKEN`，注意保留本地自定义配置；也可设置不带 `VITE_` 前缀的 `AI_GATEWAY_API_KEY`。Jev 不可用或意图／联网判断置信度不足时，保留原 LLM 路由和规则兜底。模型列表只提供 DeepSeek V4.1 Flash 与 GPT-5.6 luna，两者都直接接收图片。

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 本地开发（Vite） |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 预览生产构建 |
| `npm run lint` | Oxlint 与图标策略检查 |
| `npm test` | Vitest 回归测试 |
| `npm run check:prompts` | 提示词契约检查 |
| `npm run release:patch` | patch 升版、更新日志、提交并打 `v*` 标签（不推送） |
| `npm run release:minor` | minor 升版（同上） |
| `npm run release:major` | major 升版（同上） |

## 发版

详见[发版流程](docs/releases.zh-CN.md)与[更新日志](CHANGELOG.zh-CN.md)。

## 项目结构

```text
src/
  features/    行程、地图、聊天、酒店、航班、地点与云同步
  shared/      共享界面、工具与模型服务
  hooks/       应用级 hooks
  config/      共享配置
  __tests__/   回归测试
api/           服务端代理与共享接口
supabase/      数据库结构、迁移与数据库检查
docs/          优化与验证记录
```

行程编辑使用 `src/features/cloud-sync/v2/` 中的 V2 操作日志、本地待上传队列与版本补齐机制。其他旅行数据保留 snapshot 路径。聊天历史和草稿按账号与行程保存在当前设备；它与云端行程共享是两套不同的机制。

## 说明

- 不做真实订票 / 订房
- 航班与营业信息会变动，请以出行当日为准
- 自驾日请确认 Crit’Air 与租车保险
- 邀请新用户：分享邮箱会自动入白名单；也可手动 `insert into allowlist_emails`
