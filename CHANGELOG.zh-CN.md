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

## [0.7.0] - 2026-08-20

### 新增

- align global UI with unified liquid frosted glass design and polish navigation flow
- lift chat bubble and model picker above bottom nav, and widen navigation bar
- implement liquid flowing gradient border with realistic refractive light decay
- refine border to ultra-fine hairline precision while preserving specular reflection
- add realistic specular reflection highlights and prism sheen to navigation bar
- enhance navigation bar white border and luminous glass rim highlight
- open hotel details overlay in-place without navigating away from itinerary tab
- unify global design system with light frosted glass cards, soft diffused shadows, and cohesive pill shapes
- balance desktop header layout with quick tools and interactive user capsule
- implement Profile Tab consolidating account, trip management, preferences, and reset actions
- sync bottom nav and top segments slider animation with timeline/map dynamic stretch-and-squish spring physics
- refine bottom nav to high-transparency semi-transparent frosted glass
- update bottom nav and top segments to clean bright light frosted glass style
- clean minimalist frosted glass for bottom nav and top segments
- match iOS Liquid Glass reference with translucent tinted pill and quick action capsule
- upgrade bottom nav to iOS 26 floating liquid glass style
- implement Proposal 1 with native bottom navigation bar and multi-tab architecture
- unify PlacePhotoGallery across AddPlaceDialog and GooglePlacePage with identical photo priority, drag gestures, and animations
- upgrade PlaceGallery with iOS native drag gestures, slide transitions, and thumbnail auto-centering
- fine-tune ApiRequestMeter expanded height to 438px for tight bottom padding
- eliminate scrollbar in ApiRequestMeter and expand full details cleanly
- complete comprehensive animation enhancements across timeline, map, hotel, flight, and system widgets
- upgrade top-right mobile menu to two-stage morphing animation
- synchronize status bar theme-color dynamically with modal backdrop
- enable black-translucent status bar to sync backdrop seamlessly in safe-area
- display X close button on desktop while retaining pull-down handle on mobile
- add top pull-down handle indicator, remove X buttons, and match status bar backdrop color
- synchronize modal backdrop opacity dynamically with sheet drag & dismissal animation
- implement velocity-inherited spring physics for inertia-driven bottom sheet dismissal
- add full-surface pull-down-to-dismiss drag gesture to all bottom sheets
- iOS-style sliding pill via shared layoutId
- same staged two-stage morph as chat panel
- staged two-stage morph (width first, then height)
- container transform FAB↔panel with iOS-style spring + tap squish
- morph from button to popover via shared layoutId
- add enter/exit animation to model picker popover
- add enter/exit animation + outside-click close
- lock to portrait + disable pinch zoom in standalone mode
- 锁定 PWA 模式为竖屏，并禁用双指捏合缩放（iOS / Android 安装后的 app）。Android 由系统直接拒绝旋转；iOS 不遵守 manifest 的 `orientation`，所以加了一层柔和的全屏遮罩，提示用户把手机转回来，同时把背后内容模糊并冻结。

### 变更

- upgrade FAB and model picker to luminous frosted glass with specular highlight
- clean(ui): remove redundant logistics and preferences buttons from itinerary summary strip
- remove deprecated VITE_GOOGLE_MAPS_API_KEY from env and documentation
- extract unified BottomSheet shell component to standardize modals
- standardize backdrop fade animation and pointer-events layering across all bottom sheets
- add fluid ink blob animation with stretch physics to day tab switcher
- add velocity stretch and squash deformation to mobile sliding pill
- unfold date range picker popover from trigger box
- hide mobile timeline/map toggle tabs on desktop side-by-side view
- fade in chip text after closing animation settles
- center model picker chip content on desktop
- drop debug data attributes
- debug(llm-picker): expose model/label via data-debug attributes
- drop the modal, make it a popover anchored to the trigger
- share Checkbox component, apply to preferences dialog
- switch TripChatPanel enter/exit to AnimatePresence (sheet-bottom)
- phase-2 — switch CloudSave toast + ApiRequest details panel to AnimatePresence
- phase-1 — switch 7 sheet/dialog to AnimatePresence
- phase-0 foundation
- exp(animations): pilot Framer Motion on place sheet + LLM slider
- polish(place-detail): mirror exit duration with entrance (420ms) so open/close read as one motion
- polish(place-detail): use same easeOutQuint for open and close so exit reads as a visible retraction
- polish(place-detail): keep exit mirror shape but clamp y-handles to [0,1] (no overshoot on exit)
- polish(place-detail): make exit curve the mathematical time-reverse of the entrance curve
- polish(place-detail): use clean ease-in curve so exit velocity keeps accelerating to end
- polish(place-detail): mirror sheet exit easing (slow start, accelerating away) to oppose entrance
- record PWA portrait lock + zoom fix in Unreleased
- note iOS form reset layer fix in Unreleased
- iOS 表单元素的 reset 规则下放到 `@layer base`，让 Tailwind 的 `rounded-xl` 等工具类重新对 `<input>` / `<textarea>` / `<select>` 生效，表单字段跟着整体圆润设计走，不再被强制为方角。

### 修复

- remove radial gradient artifact from share dialog header to fix color seam
- polish tab state and trip metadata UI
- silence flight card mount expand animation on initial load and keep luminous frosted glass fab
- eliminate unwanted mount bounce on day tabs and timeline/map switcher when switching pages
- eliminate hotel animation replay on tab switch, fix button overlap, and anchor chat morph to button
- enable clicking hotel stop on timeline and summary strip to view hotel details
- unify RecommendationPreferencesButton style with matching frosted white circle
- eliminate thumbnail gray flicker and unmount underlying shimmer after image load
- ensure place detail preview modal layers above AddPlaceDialog with overlayZIndex 2200
- remove erroneous safe area padding from GooglePlacePage bottom sheet header
- adjust top safe area padding to balanced 78px clearance
- increase top padding to 95px to fully clear iOS 90px status bar blur scrim
- adjust top safe area padding and make itinerary day tabs flow statically
- align webmanifest theme and background colors with app light theme
- ensure dragY resets to 0 whenever bottom sheet opens
- use layered motion architecture to eliminate overscroll bounce while preserving 420ms slide-up animation
- restore bottom sheet slide-up entrance animation by decoupling Framer Motion drag from style overrides
- eliminate backdrop exit delay, restore synchronous AnimatePresence coordination, and clean status bar styling
- remove abrupt meta theme-color flip to ensure smooth hardware-accelerated status bar blend
- reset sheet y on open, extend backdrop to status bar area, and sync theme-color
- dynamically transform backdrop backgroundColor to avoid Framer Motion opacity property collision
- use non-passive native touch listener to reliably prevent browser rubberband overscroll
- implement directional touch arbiter to eliminate content overscroll rubberband on sheet pull
- eliminate page jumping and repeated fade-up animations on dialog close
- fix TypeScript easing tuple type in DateRangePicker
- initialize useMediaQuery synchronously to eliminate initial expansion flash
- replace grid-rows 0fr with AnimatePresence to fix mobile layout bug
- fix mobile popover initial height and prevent animation scrollbars
- claim clients on new SW so cache fixes reach installed PWAs
- separate backdrop fade from sheet slide
- remove paper tint, anchor pill stacking
- reset panelEntered via timer to prevent stuck overflow:hidden
- hold overflow:hidden through every height retarget; clamp panel width to viewport
- suppress scrollbar during opening morph
- stack above chat button on mobile
- align FAB and panel position, dial back spring
- move AnimatePresence inside the portal so the enter animation actually runs
- restore native checkbox visibility
- revert fill bar to CSS for frame-perfect drag tracking
- replace fake-portrait rotation with 'rotate back' overlay
- drive portrait lock via JS class toggle (Tailwind v4 Lightning CSS rejects display-mode media queries)
- move iOS form reset into @layer base so Tailwind rounded utilities win


## [0.6.0] - 2026-08-17

本版本为大改版：补齐 PWA / 启动页 / 移动端体验，并把代码按 features/ 结构拆分重构，配套大量稳定性与性能修复。

### 新增

- 完整 PWA：Service Worker、安装提示、iOS 主屏体验与橡皮筋滚动修缮
- 启动页改为全幅 ParisTour 插画
- 更新应用图标
- 地点详情面板采用 iOS 风格的打开/关闭动画
- 地点图库：照片选择器与 Tripadvisor 照片测试覆盖
- 景点卡片展示 Tripadvisor 评论，并重排地点详情布局
- Tripadvisor 数据源切到 tripadvisor34 listing details
- 接入照片 provider、Google Places 切换开关与 API 用量计量
- 酒店 LLM 文案改为流式，并按 key 修补云端产物
- 酒店详情 UX 打磨：动效评分 + 流式顾问文案
- 酒店详情弹窗接入 Booking API 与更多 UX 细节
- 用更划算的酒店/地图流程替换旧的高成本实现，并丰富 Booking 酒店数据
- AI 回复质量提升、行程实时同步更稳

### 变更

- 移除右滑关闭手势，加固 iOS 上的 body 滚动锁，修复图库导航点击被吞的问题
- 移动端 UX 全面打磨：PWA、面板手势、图库左右滑动
- 地图路线按段缓存，编辑时不再丢失当前视口
- 行程地图迁移到新架构，并加固地点数据的本地缓存
- 地点详情的回退文案与行程 UI 进一步打磨
- 精简 Google Places 计费字段
- 行程生成走 Responses API + 多日并行 + 缓存，提速明显
- TripChat 步骤 UI 与行程加载的骨架屏改进
- 新增 stage 3 维护脚本
- 调优 LLM transport / provider 配额
- 接入 no-void-type pre-commit 检查
- 接入 vitest 设置与行程关键单测
- 重构一：把 LLM 配置统一收口到 `src/config/`
- 重构二（stage 2.x）：按 features/ 重新组织代码——auth → cloud-sync → destination → flight → hotel → itinerary → place → map → chat + LLM（`features/chat/`、`shared/services/llm/`）
- 重构三：清理过时的分层目录，把跨特性共用模块上移
- 重构四（stage 3.x）：把 137 KB 的 `llm.ts` 拆成 9 个聚焦模块 + `business/` 子目录；87 KB 的 `TripChatPanel.tsx` 拆成 4 个辅助文件 + 69 KB 主文件
- 重构五（stage 4）：从 `App.tsx` 抽出 `useTripCore`、`useItineraryGeneration`，并把 App 助手/常量下沉到 `appHelpers.ts`
- 新增 `scripts/_check-imports.mjs` 导入一致性自检脚本

### 修复

- 主屏安装 PWA 时的安全区收紧
- 修正 `useItineraryGeneration` 中 `clampIsoDate` 的导入路径
- 移除 `App.tsx` 重复的 handler / state 声明
- 修复 `transport.ts:564` 的运行时 ReferenceError
- 对齐 `ItineraryStartResult` 与 `business/itinerary.ts` 的形状
- 重新导出 `DestinationSuggestion` 并修正 `business/itinerary` 类型路径
- 对齐时间选择器，并稳定相关 hook 依赖


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

- [Unreleased]: https://github.com/JackZ0526/ParisTour/compare/v0.7.0...HEAD
- [0.7.0]: https://github.com/JackZ0526/ParisTour/compare/v0.6.0...v0.7.0
- [0.6.0]: https://github.com/JackZ0526/ParisTour/compare/v0.5.0...v0.6.0
- [0.5.0]: https://github.com/JackZ0526/ParisTour/compare/v0.4.0...v0.5.0
- [0.4.0]: https://github.com/JackZ0526/ParisTour/compare/v0.3.1...v0.4.0
- [0.3.1]: https://github.com/JackZ0526/ParisTour/compare/v0.3.0...v0.3.1
- [0.3.0]: https://github.com/JackZ0526/ParisTour/releases/tag/v0.3.0
- [0.2.0]: https://github.com/JackZ0526/ParisTour/compare/e48cfb8...620c6a8
- [0.1.0]: https://github.com/JackZ0526/ParisTour/compare/36ed361...e48cfb8
