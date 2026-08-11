# `src/shared/`

**跨 feature 共享的代码**。任何 `features/<x>/` 可以 import 这里，反之不行。

## 当前

- `components/` — 通用 UI 组件：`CloseIconButton`, `LoadingIndicator`, `GommagePetals`
- `services/` — 跨 feature 的服务：`llm/`, `maps/`, `supabase/`, `translate.ts`
- `hooks/` — 通用 hooks（暂无）
- `utils/` — 跨 feature 纯函数：`stopTimes`, `priceLevel`, `dayOrigin`
- `types/` — 跨 feature 共享类型
- `lib/` — 第三方 client 包装

## 规则

- 这里不放任何 feature 特定的业务逻辑
- 这里不放 React 组件（除了真正通用的 UI 原子）
- `features/<x>` 可以 import `shared/*`，但 `shared/*` 不能 import `features/*`
- `shared/*` 内部可以互相 import（但要避免循环）
