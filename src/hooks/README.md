# `src/hooks/`

**自定义 React hooks**。当前 2 个文件，App.tsx 90KB 里还有大量内联 `useEffect` / `useCallback` 业务逻辑。

## 现状

- `useDayNav.ts` — 行程导航（已抽出）
- `useOpenAIModel.ts` — LLM model picker 状态

## stage 2 / 3 计划

App.tsx 里的业务逻辑（包括但不限于）：
- trip 状态机（dates / flights / hotel / days 之间的协调）
- cloud sync 协调
- day regenerate / restore 流程
- copy refresh / day copy 流程

应该抽到对应的 `features/<x>/hooks/use*.ts`，让 App.tsx 只剩 composition。
