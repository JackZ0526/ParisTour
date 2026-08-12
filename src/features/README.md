# `src/features/`

**业务功能模块**。每个 feature 是一个完整、自洽的领域：
- 自带 `components/`、`services/`、`hooks/`、`constants/`、`types.ts`、`index.ts`
- **依赖方向**：`features/<x>` 可以依赖 `shared/`，但**不能横向依赖** `features/<y>`（除非通过 `shared/` 桥接）

## 当前 features

| Feature | 范围 | 主要组件 |
|---------|------|----------|
| `auth/` | 登录、登出、Supabase session | `AuthGate`, `LoginPage`, `AuthProvider` |
| `cloud-sync/` | 跨端同步 + 备份 + 分享 | `CloudSaveIndicator`, `BackupDialog`, `ShareDialog` |
| `destination/` | 目的地下拉选择 | `DestinationPanel` |
| `flight/` | 航班查询 + 缓存 | `FlightPanel` |
| `hotel/` | 酒店推荐 + 缓存 + 区域解析 | `HotelPicker` |
| `itinerary/` | 多日行程生成 + 时间线 | `DayTimeline`, `TripDatesPanel`, `useDayNav` |
| `place/` | 地点详情 + 点评 + 翻译 | `AddPlaceDialog`, `PlacePanel`, `PlaceDetailsPage` |
| `map/` | OpenStreetMap、开放路线与公共交通集成 | `TripMap`, `navigation` |
| `chat/` | 行程助手对话 + LLM model picker | `TripChatPanel`, `LlmModelPicker`, `InlineMarkdown` |

## 跨 feature 复用

通过 `../shared/` 共享：
- `shared/services/llm/` — LLM 调用、prompt、artifact
- `map/services/` — OpenStreetMap、地点检索与开放路线工具
- `shared/services/translate.ts` — 翻译（chat + place name 翻译共用）
- `shared/services/supabase/` — Supabase client
- `shared/components/` — 通用 UI 组件
- `shared/utils/` — 纯函数工具
- `shared/types/` — 跨 feature 共享类型

## 加新 feature 的步骤

1. `mkdir -p src/features/<new>/{components,services,hooks,constants}`
2. 加 `types.ts`（feature 内 interface）
3. 加 `index.ts`（barrel export，对外只暴露必要 API）
4. 写 service → hook → component，每层有单元测试
5. 接入 App.tsx（用 import 限定在 App 那一层）
