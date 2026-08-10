# 更新日志

[English](CHANGELOG.md)

Paris Tour 的重要变更记录于此。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

日期取自 git 提交的日历日。工作区中尚未发布的改动列在 **Unreleased**。

> **自动化说明**：`npm run release:*` 会按提交生成英文条目，并写入本文件对应版本（中文二级标题 + 英文条目）。中文细则可在发版后手工润色；勿依赖外部翻译 API。

## [Unreleased]

### 新增

### 变更

### 修复

## [0.5.0] - 2026-08-10

本版本重点提升 AI 推荐的可靠性和可控性：引入 Google 真实候选、可编辑推荐偏好、分批加载，以及更稳健的云端与部署逻辑。

### 新增

- 地点、酒店和完整行程推荐先取得 Google 已验证候选，模型只负责筛选、排序与编排，并增加结构化提示词契约和 JSON 修复校验。
- 新增可编辑、可云端同步的推荐偏好；开始时间、咖啡馆、餐饮、迪士尼、地标与步行强度均作为可让步倾向，不再强制改写行程。
- 添加地点时优先加载当前类别的 4 个推荐，再在后台补齐其他类别；“换一批”只刷新当前类别。

### 修复

- 在推荐、行程、详情和酒店流程中持续保存 Google Place ID，刷新后仍能定位同一实体。
- 修复行程实时同步后短暂出现空白页面的问题。
- 对齐 DeepSeek 手动与自动思考强度的实际 API 参数映射。
- 推荐数量不足时自动补齐，同时避免重复返回已有地点。
- 修复 Vercel 代理环境中 DeepSeek 偶发空响应的问题。
- 行程起算日改为读取结构化航班时间，不再由模型猜测抵达日期。
## [0.4.0] - 2026-08-10

> 大型功能版本（约 3900 LOC）：服务端备份、地点双语命名、地点详情与图库体验。

### 新增

- 服务端行程备份（`trip_backups`）：每次完整保存后保留最近 5 份快照，并提供恢复 UI（`BackupDialog`）
- 地点双语命名：优先 Google 中文名，LLM 翻译 + 角标，支持流式更新
- Google 价位文案与地标类地点评论详情增强
- 图库体验：滑动浏览、缩略图同步、隐藏滚动条
- 共用关闭按钮组件与顶栏图标操作打磨

### 变更

- 强化行程云端持久化、Google 地点详情拉取与行程助手工作流

### 迁移

- 执行 `supabase/schema.sql` 中的 `trip_backups` 段（表 + RLS）。生产项目 `zyfcpitiyrpfzvmyyxxu` 已应用。

## [0.3.1] - 2026-08-10

### 变更

- Use icons for close and regenerate chrome buttons.
- Persist LLM-generated content in the trip cloud snapshot.
- Simplify mobile trip-assistant and model FABs to icon-only circles.
- Make trip chat answer live facts and contextual detail views, and stop place recommendations from surfacing raw JSON parse errors.
- Avoid remounting the app when Supabase re-emits SIGNED_IN on tab focus.

### 修复

- 大模型生成的地点/酒店点评、每日推荐、评论翻译、目的地芯片写入行程云端快照：跨设备复用，仅在用户点「重新生成」或换一批时再调用模型


## [0.3.0] - 2026-08-09

### 新增

- DeepSeek 作为一等 LLM 后端（`/api/deepseek`），支持 V4 Flash / Pro 与 thinking / reasoning-effort
- 全局 LLM 模型选择器（DeepSeek + OpenAI GPT-5.6），接入 TripChat 等相关流程
- 模型选择器使用的 DeepSeek / OpenAI 品牌资源
- `DEEPSEEK_API_KEY`、可选 `DEEPSEEK_BASE_URL` 与模型覆盖相关的环境变量与文档

### 变更

- 未显式设置模型环境变量时，默认 LLM 优先 DeepSeek
- 扩展 TripChat / 行程 LLM 工具与多厂商调用下的加载 HUD
- Vite / Vercel 代理增加 DeepSeek 路径（与 OpenAI 并列）


## [0.2.0] - 2026-07-30

邀请制云端产品：账号、同步、分享、移动端布局，以及在 0.1.0 规划器核心之上的体验打磨。

### 新增

- 邀请制登录（邮箱白名单）、按账号云端行程存档，以及邮件分享（只读或可编辑）
- 云端保存状态 UI；后改为游戏风左下角 HUD，并跳过未变更快照
- 通过 Supabase Realtime 的行程实时同步，并收敛静默同步与回声写入
- 助手推荐加/换地点前需确认再应用
- 白名单本地/预发测试账号（`test` / `test`）及 `npm run seed:test-user`
- 中英双语 README 与交叉链接
- 手机端布局适配

### 变更

- Google 加地点流程：共用地点叙述；LLM「思考中」统一为游戏风 HUD
- 时间线进入/删除动画、聊天过渡、路段 / 酒店拖拽打磨
- 收紧行程 LLM 的咖啡馆规则
- 重写 README，覆盖当前功能、技术栈与本地设置

### 修复

- 移除不支持的 Vite `resolve.extensionAlias`，修复 Vercel 构建失败
- 恢复快照时的实时同步；停止同步回声写入
- 首站较近时酒店 → 首站路线
- 移除未使用的 AviationStack Vite 代理
- 加固 Google Maps 本地配置说明（引荐来源 / 密钥）

## [0.1.0] - 2026-07-27

在初始秋季行程脚手架（2026-07-24）之后的第一版完整行程规划形态。

### 新增

- 可交互规划器：航班、酒店、日时间线、地图与 LLM 辅助行程
- 实时航班班次查询与更智能的地图 / 时间线体验
- Vercel 生产部署配置与 serverless `/api/*` 代理
- API 密钥留在服务端，不随浏览器下发

### 变更

- 由静态 7 日秋季行程演示演进为可编辑的巴黎行程规划器

## 链接

在正式打上 git tag 之前，对比范围使用提交 SHA。

- [Unreleased]: https://github.com/JackZ0526/ParisTour/compare/v0.5.0...HEAD
- [0.5.0]: https://github.com/JackZ0526/ParisTour/compare/v0.4.0...v0.5.0
- [0.4.0]: https://github.com/JackZ0526/ParisTour/compare/v0.3.1...v0.4.0
- [0.3.1]: https://github.com/JackZ0526/ParisTour/compare/v0.3.0...v0.3.1
- [0.3.0]: https://github.com/JackZ0526/ParisTour/releases/tag/v0.3.0
- [0.2.0]: https://github.com/JackZ0526/ParisTour/compare/e48cfb8...620c6a8
- [0.1.0]: https://github.com/JackZ0526/ParisTour/compare/36ed361...e48cfb8
