# `src/config/`

集中存放**可观测/可调**的运行配置：模型列表、storage key、provider switch、env 默认值。
跟 `services/` 区别是这里不写业务逻辑——只声明 "运行起来需要知道的常量"。

## 当前文件

- `llmModels.ts` — LLM picker、storage keys、`isLlmConfigured` 开关、env → model id 的解析。
  仍被 `services/llm.ts` re-export 以保持向后兼容，stage 2 完成后下游 import 改直引这里。

## 未来要加的

- `maps.ts` — Google Maps API key、referrer 白名单提示、embed URL 模板（替代 `services/googleMapsKey.ts` 里的零散函数）。
- `supabase.ts` — Supabase URL/anon key 解析（从 `lib/supabase.ts` 抽出来）。
- `env.ts` — 一站式 `getEnv(name)` helper + zod-style 校验（避免 `import.meta.env.X` 散落）。

## 不要放这里

- 业务规则（"巴黎 16 区距离限制"）→ 归 `services/`。
- 组件 / hooks → 归 `components/`、`hooks/`。
- 跨 feature 共享的纯函数 → 归 `utils/`。
