# Paris Tour

秋季巴黎 **7 日**行程可视化网页：温哥华往返、每日高分咖啡馆开场、推荐/自定义酒店联动地图起点，餐厅与景点可在页内查看 Google 地点详情与导航。

## 功能

- **7 日行程**：Day 1 抵达 / Day 2–4 市区（西侧经典、右岸、左岸）/ Day 5 迪士尼 / Day 6 枫丹白露自驾 / Day 7 返程
- **刻意避开**卢浮宫与凡尔赛；**包含**香榭丽舍与凯旋门
- **酒店选择**：Marais / Opéra / Saint-Germain 等推荐酒店；自定义地址经 Nominatim 地理编码后更新地图起点
- **可编辑行程**：拖拽排序、删除、AI 推荐/Google 搜索添加地点（最顺路 / 加到最后）
- **实时导航**：Google Directions 路线图；站间显示步行/地铁/公交与时长；今日步行距离汇总
- **航班**：Air France 去程 AF375 / 返程 AF374；可自定义航班号（AviationStack）

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开终端提示的本地地址（通常为 `http://localhost:5173/`）。

### 环境变量（`.env`，已 gitignore）

```env
# 服务端密钥（不要加 VITE_ 前缀）
RAPIDAPI_KEY=
OPENAI_API_KEY=
# GEMINI_API_KEY=

# 浏览器可用（Maps 必须在前端加载；请在 Google Cloud 限制 HTTP referrer）
VITE_GOOGLE_MAPS_API_KEY=
# VITE_OPENAI_MODEL=gpt-5.6-luna
```

Google Cloud 建议启用：**Maps JavaScript API**、**Places API (New)**、**Directions API**（或 Routes API），并为 Maps Key 限制 `http://127.0.0.1:5173/*` 与生产域名。

## 修改数据

| 文件 | 内容 |
|------|------|
| `src/data/itinerary.ts` | 每日时间线与从各酒店区位出发的地铁提示 |
| `src/data/places.ts` | 地点介绍、坐标、图片 |
| `src/data/hotels.ts` | 酒店区位映射（推荐由大模型首次生成） |
| `src/data/flights.ts` | 推荐航班模板 |

行程编辑结果会自动保存在浏览器 `localStorage`（`paris-tour-itinerary-v1`）。

## 技术栈

Vite · React · TypeScript · Tailwind CSS v4 · Google Maps（`@react-google-maps/api`）· Nominatim · AviationStack · 可选 OpenAI/Gemini

## 说明

- 不做真实订票/订房与账号登录
- 航班与营业信息会变动，请以出行当日为准
- 自驾日请确认 Crit’Air 与租车保险
