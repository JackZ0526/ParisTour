# Paris Tour

巴黎行程可视化网页：邀请制登录、按账号云端存档，支持按邮箱只读/可编辑共享。

## 功能

- **邀请制账号**：白名单邮箱才能注册/登录；未登录无法使用主界面与付费 API
- **云端存档**：日期、航班、酒店、行程编辑与 baseline 按账号保存；登录后自动加载
- **共享**：行程主人可按邮箱分享，权限为只读或可编辑；发送邀请时邮件含登录/注册深链
- **可编辑行程**：拖拽排序、删除、AI 推荐/Google 搜索添加地点
- **实时导航**：Google Directions；航班优先 TimeTable Lookup

## 本地运行

1. 在 [Supabase](https://supabase.com) 新建项目
2. SQL Editor 执行 [`supabase/schema.sql`](supabase/schema.sql)
3. 把你的邮箱写入白名单：

```sql
insert into public.allowlist_emails (email) values ('you@example.com');
```

4. Authentication → Providers → Email 开启邮箱密码（可按需关闭「Confirm email」以便本地立刻登录）
5. 复制 Project URL 与 anon key 到 `.env`：

```bash
npm install
cp .env.example .env
# 填入 VITE_SUPABASE_*、SUPABASE_*、OPENAI_API_KEY、RAPIDAPI_KEY、VITE_GOOGLE_MAPS_API_KEY
# 分享邀请邮件（可选）：RESEND_API_KEY、RESEND_FROM_EMAIL
npm run dev
```

浏览器打开 `http://127.0.0.1:5173/`。

### 环境变量（`.env`，已 gitignore）

```env
# 服务端密钥（不要加 VITE_ 前缀）
RAPIDAPI_KEY=
OPENAI_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=Paris Tour <onboarding@resend.dev>
# PUBLIC_APP_URL=https://paristour.vercel.app

# 浏览器
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GOOGLE_MAPS_API_KEY=
```

Google Cloud 建议启用：**Maps JavaScript API**、**Places API (New)**、**Directions API**。浏览器 Key 的 HTTP 引荐来源请同时加入：

- `http://127.0.0.1:5173/*`
- `http://localhost:5173/*`（Cursor / 部分浏览器会用 localhost）
- `https://paristour.vercel.app/*`

本地若出现 `RefererNotAllowedMapError`，就是缺了上面某一条。

Vercel 部署时同步上述变量；付费 `/api/*` 会校验 Supabase JWT + 白名单。未配置 `RESEND_API_KEY` 时分享仍可用，界面会提示手动复制邀请链接。

## 修改数据

| 文件 | 内容 |
|------|------|
| `src/data/itinerary.ts` | 每日时间线与从各酒店区位出发的地铁提示 |
| `src/data/places.ts` | 地点介绍、坐标、图片 |
| `src/data/hotels.ts` | 酒店区位映射（推荐由大模型首次生成） |
| `src/data/flights.ts` | 推荐航班模板 |
| `supabase/schema.sql` | 账号、行程存档、共享与 RLS |

行程会写入浏览器 `localStorage` 作缓存，并 debounce 同步到 Supabase `trips.snapshot`。

## 技术栈

Vite · React · TypeScript · Tailwind CSS v4 · Supabase（Auth + Postgres）· Google Maps · Nominatim · RapidAPI · OpenAI/Gemini（经服务端代理）· Resend（分享邀请邮件）

## 说明

- 不做真实订票/订房
- 航班与营业信息会变动，请以出行当日为准
- 自驾日请确认 Crit’Air 与租车保险
- 邀请新用户：分享邮箱会自动入白名单；也可手动 `insert into allowlist_emails`