# `src/utils/`

**纯函数 / 跨 feature 共享的小工具**。应该是叶子节点（不被 `services/` 反向依赖）。

## 现状分类

| 文件 | 性质 | 未来归属 |
|------|------|----------|
| `itineraryState.ts` | state 持久化 + 模板生成 | ⚠️ **stage 2 搬到 `services/itineraryState.ts`** |
| `dayOrigin.ts` | 常量 + 纯函数 | 保留 `utils/` |
| `flightTime.ts` | 纯函数 | 保留 `utils/` |
| `placeTitle.ts` | 纯函数 | 保留 `utils/` |
| `priceLevel.ts` | 纯函数 | 保留 `utils/` |
| `stopTimes.ts` | 纯函数 | 保留 `utils/` |

## 规则

- **可以被 components / services / hooks 依赖**。
- **不能依赖 services / hooks / components**。
- 不能有 side effect（不写 localStorage、不调 API）。
- 跨 feature 共享才放这里；只服务一个 feature 的工具 → 跟 feature 走（stage 2 之后）。
