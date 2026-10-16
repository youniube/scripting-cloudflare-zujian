# API 核对与实现记录

核对日期：2026-10-14 / 2026-10-15 / 2026-10-16。这里记录开发依据与仍需通过当前 App、真实账号确认的边界，不把文档阅读当作真机执行。

## 1.2.0 Workers AI

- 沿用官方 `POST https://api.cloudflare.com/client/v4/graphql` 和 `Account → Account Analytics → Read`；不调用推理接口，不要求模型运行、部署或编辑权限。权限依据：[官方 Analytics Token 教程](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/)。
- AI 使用 `aiInferenceAdaptiveGroups`。Cloudflare 官方的 [GraphQL 参考示例](https://github.com/cloudflare/skills/blob/main/skills/cloudflare/references/graphql-api/patterns.md)包含模型维度、`count` 和输入/输出 Tokens；完整字段、账号开放范围与限制应以 [Introspection](https://developers.cloudflare.com/analytics/graphql-api/features/discovery/introspection/) 和 [Settings](https://developers.cloudflare.com/analytics/graphql-api/features/discovery/settings/) 为准。
- 首次 App AI 加载从 Query → Viewer → Account 的实际类型发现数据集，检查 `datetime_geq`、`datetime_lt`、`modelId_gt`、`modelId_ASC`、`count`、`dimensions.modelId`。未满足边界或完整分页条件则明确停止 AI 查询，Workers 功能独立可用。
- `sum.totalNeurons`、`sum.totalInputTokens`、`sum.totalOutputTokens` 均在实际 Schema 与 `availableFields` 双重确认后才请求。没有 Neurons 时保持未知，不按 Token 或静态模型价格换算。错误数量仅在实际过滤器提供 `errorCode_neq` 时读取 `errorCode != 0` 的独立聚合。
- 按 UTC 自然日、半开区间查独立账户汇总和按模型游标分页的全部明细；每页不追加模型/时间/错误维度到汇总查询。分段时只加可加指标，保留 Neurons 小数，不再次乘采样率。空组保留未知，分组与账户差异显示估算提示。
- [Workers AI 官方定价](https://developers.cloudflare.com/workers-ai/platform/pricing/)列出 Free/Paid 每日 10,000 Neurons、UTC 零点重置。界面表述为“免费量参考剩余”，不作为账单、实时余额或付费账号的硬上限。AI Gateway 预付费和独立计费模型可能不同，项目不声称总 Neurons 必然全部抵扣日免费量。
- Widget 模式由本地参数 `ai` / `ai:账号标识` 决定。`Widget.preview` 的 `parameters.options/default` 用法按本地官方完整 Widget API 文档核对，选项值为 JSON 序列化字符串；入口支持解码。现有空参数与原有账号参数保留 Workers 行为。
- 没有真实账号 Token，因此没有在开发端执行 AI 数据查询或获得该账号的在线 Schema。开发已实现运行时验证与安全降级，自动检查使用明确的模拟响应；用户需在手机首次进入 Workers AI 后在线确认实际开放能力。

## Scripting 原生接口

| 能力 | 本项目使用方式 | 官方依据 |
| --- | --- | --- |
| 项目入口 | `script.json`、`index.tsx`、`widget.tsx`，其他文件是普通模块 | [Quick Start](https://scriptingapp.github.io/guide/Quick%20Start)、[官方项目结构](https://github.com/scriptingapp/scripting-app-development/blob/main/references/project-and-lifecycle.md) |
| UI | 从 `scripting` 导入 SwiftUI 风格 `Text`、`HStack`、`VStack`、`List`、`Section`、`Picker` 等 | [官方指南](https://scriptingapp.github.io/guide/Quick%20Start) |
| 展示与退出 | `Navigation.present({ element })`，关闭后 `Script.exit()`；编辑页使用 `Navigation.useDismiss()` | [Present a simple view](https://scriptingapp.github.io/guide/Views/Present%20views/Present%20a%20simple%20view/index) |
| 网络 | 官方导出的 `fetch`，JSON POST、`timeout` 秒数、取消重定向 | [fetch](https://scriptingapp.github.io/guide/Utilities/Request/fetch)；官方文档归档 `http_server/index.tsx` 明确展示 `fetch` 导入 |
| 普通存储 | 全局 `Storage.get<T>` / `set` / `remove` / `keys`，默认私有域，检查 `set` 返回值 | [Storage](https://scriptingapp.github.io/guide/Utilities/Storage) |
| Token | 全局 `Keychain` 命名空间，`synchronizable: false`、`first_unlock_this_device`，检查写入返回值 | [Keychain](https://scriptingapp.github.io/guide/Device%20Capabilities/Keychain) |
| Widget 参数 | `Widget.parameter`，本地标识/Account ID/唯一名称；Token 不进参数 | [Widget API](https://scriptingapp.github.io/guide/Widget/Widget%20API) |
| Widget 尺寸 | `systemSmall`、`systemMedium`、`systemLarge`；趋势高度参考 `displaySize.height` | [Widget API](https://scriptingapp.github.io/guide/Widget/Widget%20API) |
| 刷新 | `Widget.present(element, { policy: "after", date })` 和 App 内 `Widget.reloadAll()` | [Widget API](https://scriptingapp.github.io/guide/Widget/Widget%20API) |
| 倒计时 | `DateLabel` 的 `date` + `style: "timer"`，目标为下一次 UTC 00:00 | [Time-based label views](https://scriptingapp.github.io/guide/Views/Time-based%20label%20views) |
| 深浅色 | `foregroundStyle`、形状填充、`widgetBackground`、`tint` 使用 `{ light, dark }` | [DynamicShapeStyle](https://scriptingapp.github.io/guide/Types/DynamicShapeStyle)、[tint](https://scriptingapp.github.io/guide/View%20Modifiers/tint) |
| 趋势 | App 的 `Chart` + `BarChart`；Widget 使用原生圆角矩形柱状图 | [BarChart](https://scriptingapp.github.io/guide/Views/Charts/BarChart/index) |
| 复制非敏感参数 | 全局 `Pasteboard.setString` | [Pasteboard](https://scriptingapp.github.io/guide/Device%20Capabilities/Pasteboard) |

文档中有两处表述不一致，按具体 API 与执行规则实现：

1. Widget 快速入门的简表出现 `small/medium/large`，详细 Widget API 使用 `systemSmall/systemMedium/systemLarge`。本项目采用后者。
2. 快速入门说明 `Widget.present` 后上下文销毁，另一页末尾同时提到退出。Widget 所有数据与缓存都在 `present` 之前处理，不依赖调用之后的语句；App 页面关闭后显式退出。

文档归档来自官方仓库的 App Store 文档 ZIP，原始文件在本地开发目录的 `docs/vendor/` 中保留，不随 GitHub 仓库上传。离线声明 `tools/documented-api.d.ts` 只是针对使用接口的文档合约。当前 iPhone App 同步的完整声明应通过官方 CLI 取得，再由 `tools/check-device-types.mjs` 检查。

## Cloudflare 查询语义

端点固定为 `https://api.cloudflare.com/client/v4/graphql`，使用 `Authorization: Bearer`，只有 Account Analytics Read 权限，无 REST 部署接口。

| 内容 | 确认与处理 |
| --- | --- |
| 数据集 | [官方 Workers 示例](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/) 中的 `workersInvocationsAdaptive` |
| 聚合 | [数据集命名说明](https://developers.cloudflare.com/analytics/graphql-api/features/data-sets/) 明确将此节点列为聚合命名规则的例外；未选维度得到账户聚合，只选 `scriptName` 得到 Worker 分组 |
| 指标 | 官方示例的 `sum.requests`、`sum.errors`、`dimensions.scriptName`、`quantiles.cpuTimeP50/cpuTimeP99` |
| 采样 | [官方采样说明](https://developers.cloudflare.com/analytics/graphql-api/sampling/)：返回量已做估算，不再乘采样系数 |
| 分页 | [官方分页说明](https://developers.cloudflare.com/analytics/graphql-api/features/pagination/)：不用 cursor，而是 `limit` + `orderBy` + filter；按唯一分组键 `scriptName` 递增读取 |
| 过滤与排序验证 | 首次连接用 Introspection 查真实输入类型与枚举，必要字段为 `datetime_geq`、`datetime_lt`、`scriptName_gt`、`scriptName_ASC`；未提供时停止完整统计，不伪造可用能力 |
| 账号能力 | [Settings node](https://developers.cloudflare.com/analytics/graphql-api/features/discovery/settings/)：`enabled`、`availableFields`、`maxPageSize`、`maxDuration`、`notOlderThan` |
| 时间边界 | 每日严格 `[start, end)`；不复制示例的包含式 `datetime_leq` 作为日边界，也不选择 datetime/status 导致大量分组 |
| CPU | 先确认字段开放与 Schema 单位，未明确单位时保留原单位；日/段 P50/P99 不作错误合并 |
| 延迟 | [Workers 指标文档](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/) 说明最近数分钟可因聚合延迟产生落差，不固定猜一个“延迟完成时间” |
| 额度与计费 | [Workers 价格](https://developers.cloudflare.com/workers/platform/pricing/) 与 [账户限制](https://developers.cloudflare.com/workers/platform/limits/#account-plan-limits)：Free 100,000 / UTC 日；Paid 不套 Free 额度。Service Binding、Pages Functions 等口径差异持续标为估算 |

GraphQL 查询使用 JSON 编码后的内联字符串值，避免猜测教程间不一致的 scalar 名称。所有响应包含 errors 时整次查询拒绝，不把 GraphQL partial data 更新为成功数据。

最小权限无法可靠获得付费套餐、Cloudflare 账号的规范名称或无调用记录的部署清单。采用用户配置的名称和确认套餐，明细只列 Analytics 实际返回的 Worker；不为额外元数据申请编辑权限。

## 可见限制

1.1.2 的刷新按钮直接执行当前时段查询；`Button.action` 与 `buttonStyle="borderless"` 按官方 [Button 样式](https://scriptingapp.github.io/guide/View%20Modifiers/buttonStyle) 核对。App 和 Widget 继续使用同一套请求与缓存；服务只增加本轮缓存/冷却/占用状态和前台缺失日期的补取调度，不修改 GraphQL 字段或统计口径。品牌单行按 [Text View Modifiers](https://scriptingapp.github.io/guide/View%20Modifiers/Text%20View%20Modifiers) 及 `frame` 文档实现；这些原生交互和排版仍需真机复验。

1.1.1 针对用户截图中未呈现的历史分段选择器，改用带 `title="统计时段"`、`pickerStyle="menu"` 的官方 Picker 模式。`value` / `onChanged` 与四个 `Text.tag` 保留，按官方 [Picker 样式说明](https://scriptingapp.github.io/guide/View%20Modifiers/pickerStyle) 和文档归档 `views/controls/picker/index.tsx` 的 List 示例核对。仅修改入口 UI，历史补取和缓存逻辑保留；原生控件仍需真机复验。

1.1.0 的 Widget 升级按用户指定的 [官方开发 Skill](https://github.com/ScriptingApp/scripting-app-development/blob/main/SKILL.md) 读取 Widget 与验证说明，并核对 Shapes 中的 `ShapeProps` / `StrokeStyle` 类型块、`Circle.trim`、`ZStack`、`rotationEffect`、动态渐变、`Image.systemName`、`monospacedDigit` 与 `kerning`。具体来源与真机核验步骤见 [UI-DESIGN.md](UI-DESIGN.md)。没有新增请求、认证方式或数据权限，完整手机 `.d.ts` 检查仍需连接 App。

1.0.2 的布局及配色额外核对了 [padding](https://scriptingapp.github.io/guide/View%20Modifiers/padding)、[frame](https://scriptingapp.github.io/guide/View%20Modifiers/frame)、[DynamicShapeStyle](https://scriptingapp.github.io/guide/Types/DynamicShapeStyle) 和 [widgetBackground](https://scriptingapp.github.io/guide/View%20Modifiers/widgetBackground)。动态颜色由原生环境选择 `light` / `dark`，没有使用设备当前主题的单次快照，也没有通过 `preferredColorScheme` 固定外观。`Widget.displaySize` 的点数语义以 Widget API 为准。

- 没有真实 Token，当前运行没有完成在线账号数据验证；首次手机配置时会在线验证 Schema 与账号能力。
- 没有连接 iPhone，完整官方声明、Keychain Widget 访问、原生控件、尺寸布局和刷新策略需要真机确认。
- iOS 着色模式可能统一颜色，80%/95% 另有文字阈值。Widget 内无 hooks 状态、无图片、无浏览器 DOM。
- 官方 `Storage` 后台持久化且没有 CAS；跨进程占用记录是尽力抑制请求，不宣称原子锁。
- 本版没有后台本地通知；不把 Notification API 的存在等同于稳定后台采集保证。
