# 更新日志

[English](CHANGELOG.md)

Paris Tour 的重要变更记录于此。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

日期取自 git 提交的日历日。工作区中尚未发布的改动列在 **Unreleased**。

> **发版要求**：英文日志会根据提交记录自动生成；中文发布摘要需先写入本文件的 **Unreleased** 区域。缺少中文条目时，`npm run release:*` 会中止，避免把英文内容误写入中文版。

## [Unreleased]

### 新增

### 变更

### 修复

## [0.9.2] - 2026-08-24

### 修复

- 修复多人协同场景下切换语言导致天数错误扩容（如 6 天变 7 天且插入空白天）及云端双向覆盖导致中英文混杂的问题：
- 多语言翻译期间全程阻断云端自动保存（hold cloud saves），客户端语言切换不再覆盖云端基准行程；
- 移除对已生成行程的响应式自动扩缩容监听，消除天数波动带来的日程破坏；
- 协同水合期间同步解析行程起算日，避免日期闪跳；
- 修复 `resizeItineraryToLength` 扩容时的日程复制逻辑。


## [0.9.1] - 2026-08-24

### 修复

- 修复时间轴行程卡片中的交通与步行强度胶囊（如「很少走」、「短步行」、「公共交通」等历史中文持久化数据）在切换语言时未翻译为英文的问题。


## [0.9.0] - 2026-08-24

### 新增

- 引入多语言 0ms 秒切缓存机制（`localePrefetch` 与 `memoizePlaceDetailCopy`），在中英文切换时实现 0 延迟、0 网络请求与 0 骨架屏即时切换体验。
- 地点推荐（Add Place）全面接入流式实时涌现输出（Streaming Partial JSON），推荐卡片逐张流式渲染并带有 1:1 Progressive Shimmer 渐进尾部骨架屏。
- 地点推荐卡片展开详情页接入 1:1 照片画廊与元数据 Shimmer 骨架屏，后台拉取照片与详细信息期间不阻断用户阅读 AI 理由与添加行程。
- 日程修改（Day Timeline）文案拟定接入流式打字输出与加载骨架屏。

### 变更

- 大模型思考模式（Thinking）策略与耗时专项优化：
- 查词翻译助手与前置意图分类网关强制关闭思考，响应速度提升 80%+；
- 修改日程后的文案拟定关闭冗余推理，耗时从数秒大幅压缩至 300ms 级别；
- 保持各场景的智能前置路由判断架构。
- 全站大模型 Thinking / Generating 思考加载动效全面升级：
- 移除原有均衡器柱条（`|||||`），升级为极简星芒与 3 阶错峰动态流光省略号（Dynamic Dots）；
- 全局自动清洗输入文案末尾的静态省略号（`Thinking...` ➔ `Thinking` / `正在思考…` ➔ `正在思考`），视觉更清爽干净。
- 地点推荐弹窗分类胶囊去除冗余的括号与数量标记（如 `(4)`、`(...)`），视觉更紧凑极简。
- 地点推荐顶部说明文案提炼为单行排版，彻底避免移动端与窄屏掉字折行。
- 地点名称实时翻译状态全面统一为动态流光省略号。

### 修复

- 修复地点详情页「官方网站（Official Website）」胶囊按钮缺失外链图标的问题，补齐 `<ExternalLink />` 与悬浮微动效，与 Google Maps 地址按钮保持视觉对齐。
- 修复多语言切换与预加载过程中的异步竞态与重复请求。


## [0.8.1] - 2026-08-22

### 新增

- 新增用户昵称设置与跨设备云端同步，顶部行程切换胶囊及协作菜单优先展示所有者/协作者昵称。
- 头像上传支持交互式自由缩放与拖拽裁剪定位（`AvatarCropper`）。
- 分享协作弹窗（`ShareDialog`）接入 Supabase Realtime，支持实时同步协作者最新头像与昵称。
- 增加行程分享列表缓存机制，优化 JWT 负载与批量用户信息加载性能。

### 变更

- 登录页深色模式重构升级，采用精致磨砂玻璃质感与轻奢金色微光强调。
- 头像裁剪弹窗在明暗模式下增强视口边框、缩放滑块及操作按钮对比度与悬停态反馈。
- 协作弹窗内同伴昵称与邮箱改为单行自适应排版。
- 精简头像选择弹窗内的重复提示文本与冗余说明卡片。

### 修复

- 修复头像裁剪与重置后的云端保存同步链路，采用 profile 健壮 upsert 机制确保多端即时更新。
- 修复批量加载同伴 profile 时的 RLS 策略与查询效率。
- 修复协作者权限切换导致成员列表及相邻移除按钮闪烁的问题，并保持邀请按钮在发送过程中的宽度稳定。
- 将下拉关闭手势限制为移动端底部抽屉专用，桌面端弹窗不再响应拖拽。
- 将 Supabase 行程初始化移出认证事件回调，并在创建主行程前验证当前用户，避免登录死锁及误判产生的 RLS 错误。
- 修复地点详情页 Google 地图地址胶囊及操作按钮在深色模式下的 hover 对比度与高亮样式。
- 完善发版脚本，要求发版时必须包含双语更新日志。


## [0.8.0] - 2026-08-21

### 中文摘要

#### 新增

- 新增完整的「午夜巴黎」深色模式，覆盖导航、行程、地图、航班、酒店、聊天、个人中心、登录及各类弹窗。
- 外观主题支持浅色、深色与跟随系统；默认改为跟随系统，并可将登录账号的主题偏好同步到云端。
- API 调用计数器支持拖动至屏幕左右两侧，记忆停靠位置并自适应展开方向。
- 新增个人头像定制、AI 偏好标签池与自然语言偏好提取流程。
- 升级行程助手的模型选择、深度思考设置、建议标签和消息气泡交互。
- 时间选择器改为 iOS 闹钟式无限循环滚轮，并加入桌面滚轮步进与移动端惯性吸附。
- 移动端横向标签与日期轨道新增按滚动位置渐入的边缘模糊提示。

#### 变更

- 统一浅色与深色模式的流光毛玻璃层级、微高光、边框和阴影，增强卡片及子面板的立体感。
- 重构个人中心桌面布局、AI 偏好编辑区、备份与协作分享弹窗，使信息层级和操作路径更清晰。
- 优化 API 调用明细面板、主题选择器、行程概览与日期轨道的间距、圆角和视觉平衡。
- 统一聊天模型面板、时间选择器、标签胶囊和分段滑块的弹性动效与触控反馈。
- 优化行程与酒店编辑流程、详情弹窗、空状态和移动端长按拖动体验。

#### 修复

- 修复深色模式下多处乳白背景、文字对比度不足、边框过亮及品牌图标辨识度低的问题。
- 修复移动端日期轨道初始位置过左、吸附原点偏移，以及左侧渐变在未滚动时错误显示的问题。
- 修复聊天模型面板的高度抖动、遮罩闪烁、滚动穿透与移动端 Safari 测量异常。
- 修复时间选择器展开跳动、滚轮偏移、文字不居中、层级遮挡及取消后状态未复位的问题。
- 修复 AI 偏好标签动画回弹、布局抖动、表情清理和提取结果不稳定的问题。
- 修复账号头像缓存导致的重复渲染、云端同步回声、备份快照和协作邀请弹窗的若干问题。

<details>
<summary>English commit details / 英文提交明细</summary>

> 以下为与英文版一致的逐提交明细，保留用于技术检索。

### 新增

- reveal left fades after scrolling
- sync preference to user profile
- default to system preference
- improve dark mode depth and contrast
- add spring sliding jelly animation to appearance theme selector in ProfileTab
- complete midnight paris styling across navigation, dialogs, calendar, and cards
- establish Midnight Paris dark mode infrastructure, theme store, and appearance selector
- layout Row 1 side-by-side (Identity & Trip Mgmt) and Row 2 resident AI preferences on desktop
- streamline avatar modal to photo-only and align with ParisTour design system
- implement personalized avatar customization system
- theme model status capsule with provider brand colors
- position model capsule beside assistant title in header
- transform header subtitle metadata into 3D glass capsules
- upgrade user/assistant chat bubbles and error banner with 3D obsidian/frosted glass styling
- lock background scrolling and interactions when LlmModelPicker is open
- add full-screen frosted glass backdrop blur overlay to LlmModelPicker
- upgrade PillSwitch with Framer Motion spring dynamics, jelly squash-and-stretch, and tactile feedback
- replace redundant brand subtitles with practical model capability descriptions
- upgrade ModelOption and ModelGroup with 3D frosted glass capsule rows and high-contrast typography
- make thinking container smoothly grow upwards anchored to its bottom edge
- upgrade inner containers in LlmModelPicker with 3D frosted glass relief and French alabaster cream base
- upgrade LLM Model & Thinking Popover UI to match 3D liquid frosted glass system
- apply strict semantic category tone mapping to suggestion pills
- upgrade TripChatPanel UI to match global 3D liquid frosted glass design system
- make API request meter draggable to left/right edges with local caching and adaptive expansion
- upgrade logout button to 3D frosted glass French Rosé capsule
- remove brown border outlines and replace with pure white frosted glass borders
- unify expanded state with identical 3D frosted glass stereoscopic depth and warm copper accents
- strengthen 3D frosted glass stereoscopic depth and warm copper elevation in collapsed state
- upgrade collapsed state with 3D frosted glass depth and subtle warm tint
- add discrete 1-notch mouse wheel stepping on desktop and magnetic inertia snapping on mobile
- replace 点/分 with central colon between dual 3D glass numeric capsules
- frame only numbers in dual 3D frosted glass capsules with static 点 and 分 outside
- split time selector into dual 3D frosted glass capsules and eliminate blur halo
- pin static 点 and 分 labels inside central selection lens
- make TimeWheelColumn an infinite circular looping wheel
- upgrade TimePicker to iOS Alarm-style dual scrolling wheel with 3D frosted glass anchor
- make TimePicker top bar a persistent in-place morphing anchor
- align expanded TimePicker time display with collapsed anchor on the left
- synchronize AI preferences preview card with unified tag pool system
- add silky-smooth cubic-bezier layout transition for downward extension
- add shrink-fade exit and smooth layout refill to candidate pool
- add decision modal after AI preference extraction
- simplify tag interaction to one-tap add and one-tap remove without plus/cross icons
- refactor recommendation preferences with interactive tag pool and AI NLP tag extraction
- upgrade BackupDialog with French editorial luxury styling
- upgrade ShareDialog with framer-motion sliding pill animation and luxury French editorial UI
- optimize Profile tab with French luxury editorial UI, live sync green dot, and trip metrics
- upgrade auth verification & trip loading screens to French Editorial aesthetic
- add interactive comparison switcher for DayTabButton styles
- upgrade incomplete itinerary empty state to French Editorial readiness card
- upgrade shared trip switcher to French Editorial liquid glass capsule
- implement interactive-triggered squash & stretch across all segmented sliders
- unify velocity squash & stretch physics across all segmented sliders
- add fluid velocity squash & stretch deformation to segmented sliders
- add spring layoutId sliding pill animation to login/register segment
- redesign hotel detail modal decision footer
- implement mobile long-press drag and smooth touch scrolling
- polish hotel picker and custom accommodation styling
- unify hotel booking section
- disable Supabase cloud sync on localhost to save bandwidth
- add universal ConfirmDialog, revamp logistics tab & polish date picker

### 变更

- soften mobile left edge fades
- mirror summary rail edge fade
- mirror day rail edge fade
- strengthen selector card depth
- add 3D micro-crystalline frosted glass and specular highlights to Theme Selector
- align API request meter rail and details panel with French Editorial micro-glass design
- restore popup modal dialog for AI preference settings across desktop and mobile
- layout(preferences): align time and active pool on left, candidate pool top-right, and AI extractor bottom-right
- layout(preferences): restructure panel into 5:7 dual-column flow to provide seamless TimePicker expansion runway
- layout(profile): arrange 4 trip health stats in 2x2 grid in account card
- layout(profile): adjust desktop Row 1 cards to 2:1 ratio and stack action buttons vertically
- remove plus sign prefix from candidate tag pills
- arrange cards with top full-width banner and bottom 2-column grid on desktop
- hide close button on mobile in avatar modal, retain on desktop only
- remove bottom footer bar from avatar modal and enable responsive close button
- tint assistant response bubble with soft sage porcelain
- enhance disabled send button contrast and grey pill contour
- upgrade bottom input bar and send button to 3D obsidian crystal and frosted glass
- separate active pool and candidate deck into two distinct cards
- standardize clear pool button to exact DayTimeline 32px glass capsule
- unify preference pool and candidate deck into one frosted card
- upgrade clear pool button to ParisTour French glass micro-capsule
- harmonize card containers and section header typography with global UI tokens
- clean(preferences): remove Chinese text from clear pool button to keep minimal icon button
- clean(profile): remove redundant top-right '修改偏好' button from AI Preferences card header
- remove layout extension and refill animations for instantaneous native DOM updates
- eliminate layout overshoot with zero-overshoot deceleration curves
- inject ParisTour signature liquid frosted glass and streaming light shine into tag pills
- standardize tag pills to match Image 1 rich pastel design
- convert tag pills to refined micro-capsules (text-[10.5px], h-6)
- standardize extraction decision dialog to global ParisTour UI language
- reduce tag pill height and synchronize font size with section headers
- strictly unify tag pill design system and font size across active and candidate pools
- guarantee 100% pure text tags with complete emoji sanitization
- make active and candidate capsule tags 100% pixel-identical in size
- remove emoji prefixes and output clean text-only tags
- add French editorial pastel color palette for preference tag chips
- compress all preference tags to <=5 chars and strictly enforce character limit on LLM extraction
- strictly unify font size, pill height and chip dimensions across tag pools
- align backup card styling and icon-only restore button with global UI
- unify all modal backdrops with lightweight micro-blur glass aesthetics
- remove role indicator dot from mobile avatar for a clean aesthetic
- align LoginPage with French editorial liquid glassmorphism design system
- unify top header layout to match hotel picker styling
- remove count number from expand button text
- streamline top header and reposition refresh button to candidates section
- use CircleMinus icon for unselect button
- change unselect icon to minus (-) icon
- suppress self-save realtime echo and reduce database egress bandwidth
- make release workflow idempotent and embed bilingual notes

### 修复

- align mobile day rail inset
- respect day rail snap origin
- align day rail left fade
- limit edge fades to mobile
- balance vertical padding and capsule curvature symmetry on API meter rail
- harmonize API meter spacing
- balance API meter panel spacing
- resolve ShareDialog invite card, email input, role pills, and alerts dark styles
- resolve BackupDialog snapshot cards milky background and low contrast text
- polish AuthLoadingScreen central icon badge, smooth aura ring, and ambient glows
- resolve header TripSelectorCapsule milky chalky background with dark glass styling
- remove orange shadow glow halo from preference panel button
- polish ProfileTab stats cards, action buttons, preference tags, theme selector, and danger zone
- resolve API meter details panel milky subcards with deep obsidian dark glass grid
- invert OpenAI brand icon in dark mode for crisp visibility
- soften metadata capsule tints and unify text contrast across summary strip
- resolve hotel card murky olive background with deep obsidian dark glass base
- resolve chat Send button white-on-white text with glowing copper dark styling
- resolve LLM model picker and thinking settings popover milky background
- refine AddPlaceDialog tab switcher, category pills, and search inputs
- resolve stop card hover white flash with dark micro-glow hover styles
- resolve map header milky background and OpenStreetMap attribution badge
- resolve Add Place button and empty state milky backgrounds
- resolve Day 1 hero container milky card and low contrast summary text
- resolve itinerary day tab pills, route links, hero subcards, and summary bar contrast
- adapt footer disclaimer container and text to midnight theme
- soften harsh white border on nav segment capsule and active pill
- resolve flight subcard milky backgrounds, contrast issues on pills and booking badges
- cache useSyncExternalStore avatar snapshot to prevent infinite re-renders
- remove duplicate safe area bottom padding from floating chat panel
- reveal model picker after height collapse
- refine assistant transitions and overlay behavior
- refactor LlmModelPicker popover to true in-flow height auto layout
- prevent initial height overshoot on LlmModelPicker popover
- fix mobile Safari WebKit height measurement for LlmModelPicker popover
- refine model picker panel animations
- anchor root popover panel to bottom so model section stays stationary during height expansion
- eliminate two-stage push-down jitter when expanding thinking slider
- eliminate collapse animation hitch by moving padding and border into inner wrapper
- ensure robust reset and alignment to confirmed value upon cancel or reopen
- eliminate two-stage magnification jump by locking base font-size and using pure continuous GPU scaling
- eliminate open-time wheel spinning by removing scroll-smooth and positioning silently before paint
- unify TimePicker wheel typography with global Outfit sans font
- ensure high-contrast deep ink numbers by placing capsule background behind text
- ensure pixel-perfect vertical centering of wheel numbers in lens box
- guarantee 0px subpixel shift for TimePicker 10:00 text
- eliminate dark outline ring during TimePicker expansion
- resolve TimePicker popover z-index layering issue
- eliminate all rebound by using pure linear-easeOut slide and unscaled opacity exit
- enable mode=popLayout for instantaneous silky-smooth tag refill animations
- remove spring physics to let candidate deck naturally extend downward
- smooth preference pool container border resizing with layout=size
- stabilize dialog height to prevent vertical viewport shifts when toggling tags
- isolate tag entry animation so existing tags glide stably without springing
- optimize preference tag extraction prompt and enable clean fallback processing
- streamline snapshot cards into compact single-row layout
- eliminate hairline seam between bottom sheet and overscroll bleed skirt
- add mobile overscroll bleed skirt to prevent dark backdrop gap on pull up
- condense BackupDialog subtitle to fit neatly on a single line
- simplify email input placeholder to 'partner@example.com'
- remove header badge and redesign invite form layout for clean symmetry
- tighten spacing between danger card, version note, and footer
- unify natural page height and restore footer across all tabs
- update flight section hint from '请先选定左侧日期' to '请先选定旅行日期' for mobile responsiveness
- expand itinerary readiness card to fill full viewport height without bottom gap
- adjust mask-image fade width to 12px for crisp subtle edge transitions
- fit itinerary readiness empty state perfectly into single mobile screen
- adjust mask-image fade width to 20px for tighter horizontal scroll transitions
- apply soft linear-gradient mask fade to summary strip and day tabs scroll tracks
- eliminate mount-time layout thrashing and squash animation replay on tab switch
- synchronize initial itinerary start date resolution to eliminate 7-to-6 day jump
- adjust vertical spacing between Day Tabs and Mobile View Switcher
- implement circuit breaker and straight-line fallback to prevent repeated API calls
- resolve left shadow clipping and finalize French copper-amber gradient style
- eliminate backdrop flashing and transition jitter on mount/unmount
- eliminate semantic duplication, align baseline, and fix mobile avatar layout
- render TripSelectorCapsule popover as fixed floating overlay
- disable page scrolling and bounce on login screen
- eliminate initial in-place bounce by adopting pure layout spring physics across all sliders
- add onClick handler to candidate cards so clicking opens hotel details popup
- remove unused CircleMinus and X imports to fix tsc -b
- smooth flight card edit transitions

</details>


## [0.7.0] - 2026-08-20

### 新增

- **全局流光毛玻璃设计系统（Liquid Frosted Glass）**：
  - 统一建立 `glassCapsule.ts` 材质 Token 库，实现包括 `glassCardSurfaceClass`、`glassSageCardSurfaceClass`、`glassModalSurfaceClass`、`glassPopoverSurfaceClass` 与 `glassHandleSurfaceClass` 在内的流光毛玻璃质感。
  - 全面升级全站弹窗与底部抽屉（备份、分享、偏好设置、添加地点、地点/酒店详情页）。
  - 全面升级悬浮气泡选择器（日期、日期范围、时间选择器）。
  - 地点/酒店详情页（`GooglePlacePage`）全面对齐流光毛玻璃规范，包含多色系评分与信息胶囊、透光评论卡片及保留鼠尾草浅绿调的行程顾问点评卡片。
- **全新多 Tab 架构与原生浮动底部导航栏**：
  - 重构主界面为多 Tab 架构，底部采用 iOS 质感浮动半透毛玻璃导航栏（**出行 · 行程 · 我的**）。
  - 智能冷启动路由分流：首次打开/未配置行程时默认进入「出行」预订 Tab；已有行程时默认直接进入「行程」Tab。
  - 顶部导航滑块与底栏指示器支持同频弹性形变与阻尼惯性动效。
- **全新「我的」个人中心（Profile Tab）**：
  - 统一整合当前登录账号状态、多行程创建与一键切换、云端备份与协作邀请、AI 行程偏好设置及数据重置管理。
  - 统一右上角快捷账号胶囊外观，与全局导航风格完全对齐。
- **全套 iOS 级物理动效与手势反馈**：
  - **Framer Motion 弹性形变（Stretch-and-squish）**：应用于日程切换 Tab、行程/地图分段控制器及导航滑块。
  - **双阶变形展开的行程助手（FAB）**：支持自底部悬浮按钮平滑向宽度与高度双向形变展开，并伴随按压挤压与触感回弹。
  - **全屏手势下拉关闭（Pull-down-to-dismiss）**：所有 BottomSheet 抽屉支持触控速度继承的惯性下拉关闭，并配合无级平滑透明度衰减。
  - **动态状态栏流光吸附**：PWA 模式下系统状态栏与遮罩层/弹窗颜色动态同步硬件加速混合。
- **iOS 原生相册画廊与细节体验**：
  - 地点画廊升级为原生滑动手势切换与缩略图自动居中，优化多图源加载优先级与流光预加载骨架。
  - 锁定 PWA 模式为竖屏，并禁用双指捏合缩放（iOS / Android 安装后的 app）。Android 由系统直接拒绝旋转；iOS 不遵守 manifest 的 `orientation`，增加柔和全屏遮罩提示。

### 变更

- 移除多余的行程概览栏内嵌物流与偏好入口，统一收敛至多 Tab 导航与个人中心。
- 提取统一的 `BottomSheet` 模态外壳组件，标准化全站所有弹层交互与触控手势。
- 优化 API 请求计费面板（`ApiRequestMeter`）与模型选择器气泡的高级流光毛玻璃与弹窗高度适配。
- iOS 表单元素的 reset 规则下放到 `@layer base`，让 Tailwind 的 `rounded-xl` 等工具类重新对 `<input>` / `<textarea>` / `<select>` 生效，表单字段跟着整体圆润设计走，不再被强制为方角。

### 修复

- 修复切换 Tab 时日期列表与地图切换指示块的意外挂载反弹。
- 修复行程列表点击酒店项目与概览栏时可原地打开详情弹窗，无需跳转 Tab。
- 修复地点详情画廊缩略图灰屏闪烁与占位流光卸载时机。
- 修复顶部安全区距离（Safe Area Insets），适配 iOS 90px 状态栏毛玻璃遮罩。
- 修复 BottomSheet 拖拽位移残留、多层手势冲突及浏览器默认弹性滚动的拦截问题。
- 修复对话助手悬浮按钮在部分机型上的初始展开闪烁与滚动条溢出问题。
- 修复分享弹窗顶部在暗色背景下的微弱径向渐变伪影。


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

- [Unreleased]: https://github.com/JackZ0526/ParisTour/compare/v0.9.2...HEAD
- [0.9.2]: https://github.com/JackZ0526/ParisTour/compare/v0.9.1...v0.9.2
- [0.9.1]: https://github.com/JackZ0526/ParisTour/compare/v0.9.0...v0.9.1
- [0.9.0]: https://github.com/JackZ0526/ParisTour/compare/v0.8.1...v0.9.0
- [0.8.1]: https://github.com/JackZ0526/ParisTour/compare/v0.8.0...v0.8.1
- [0.8.0]: https://github.com/JackZ0526/ParisTour/compare/v0.7.0...v0.8.0
- [0.7.0]: https://github.com/JackZ0526/ParisTour/compare/v0.6.0...v0.7.0
- [0.6.0]: https://github.com/JackZ0526/ParisTour/compare/v0.5.0...v0.6.0
- [0.5.0]: https://github.com/JackZ0526/ParisTour/compare/v0.4.0...v0.5.0
- [0.4.0]: https://github.com/JackZ0526/ParisTour/compare/v0.3.1...v0.4.0
- [0.3.1]: https://github.com/JackZ0526/ParisTour/compare/v0.3.0...v0.3.1
- [0.3.0]: https://github.com/JackZ0526/ParisTour/releases/tag/v0.3.0
- [0.2.0]: https://github.com/JackZ0526/ParisTour/compare/e48cfb8...620c6a8
- [0.1.0]: https://github.com/JackZ0526/ParisTour/compare/36ed361...e48cfb8
