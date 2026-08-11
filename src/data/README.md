# `src/data/`

**静态 / 初始数据** + 一些强相关的解析 helper。

## 角色

- `flights.ts` — 推荐的航班模板（AF375 / AF374），纯数据。
- `places.ts` — 内置的咖啡/餐厅/景点目录 + `getPlace()` / `listCatalogPlaces()`。
- `itinerary.ts` — 默认 7 天行程模板（"恢复默认"用），含 `metroHints` 内部表。
- `hotels.ts` — `PENDING_HOTEL` 占位 + **巴黎区域解析逻辑**（`inferParisAreaLabel`、`hotelAreaKeyFromLabel` 等）。**逻辑为主**，不是纯数据。

## 跨边界警告

`hotels.ts` 里的 `inferParisAreaLabel` / `normalizeHotelAreaLabel` / `hotelAreaKeyFromLabel` / `arrondissementFromCoords` 实际是 **hotel 业务逻辑**，被 `services/hotelCache.ts`、`components/HotelPicker.tsx` 等多处引用。Stage 2 / 3 计划：

- 把 `hotels.ts` 拆成：
  - `constants/hotels.ts`（`PENDING_HOTEL` 静态值）
  - `services/hotelArea.ts`（`infer*` / `normalize*` 逻辑）
- `places.ts`、`itinerary.ts`、`flights.ts` 大部分内容保持现状（纯数据），但 stage 2 考虑放到 `constants/` 目录统一命名。

## 不要放这里

- LLM prompt / model 配置 → `config/`。
- 远端 API 调用（`flightLookup`、`googlePlaceDetails`）→ `services/`。
- UI 组件 → `components/`。
