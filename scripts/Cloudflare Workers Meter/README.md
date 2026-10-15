# Cloudflare Workers 额度监控 — Scripting for iOS

这是一个使用 **Scripting for iOS、TypeScript / TSX 和原生 SwiftUI 风格组件** 的完整脚本项目。运行后可以在 iPhone 桌面查看 Workers 调用估算、免费日额度的估算剩余、Worker 排名和 UTC 日趋势，并在脚本内管理多个账号。

**数据来自 Cloudflare 官方 GraphQL Analytics。这里显示的是调用估算与额度推算，不是官方实时计费余额。** 项目不会部署 Worker、Pages 或云端服务；iPhone 配置完成后直接向 Cloudflare API 发起只读请求。没有配置时不显示演示数据。

## iPhone 远程安装

**[点击安装到 Scripting](https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fraw.githubusercontent.com%2Fyouniube%2Fscripting-cloudflare-zujian%2Fmain%2Freleases%2Fcloudflare-workers-meter.zip%22%5D)**

用 iPhone 的 Safari 打开上面的链接，在官方分享页点击“在 Scripting 中打开”并确认导入。安装后运行脚本，添加 Cloudflare 只读账号，再添加中号 Scripting 桌面小组件。手机无需下载整个 GitHub 仓库或运行桌面命令。

当前版本 **1.1.0 · Premium Dashboard** 采用 Cloudflare 橙色、深蓝黑渐变、原生额度环与 Worker 流量条；浅色主题跟随系统自动适配。小号突出请求数和剩余百分比，中号采用左右分区，大号增加错误统计与七日趋势。原有 API、认证、缓存、UTC 统计和账号管理逻辑保留。更新原脚本可避免创建新的凭据作用域。

## 视觉设计与预览

先研究了四个指定开源仓库的截图及相关实现，构思 A 科技仪表盘、B Apple 极简、C GitHub 数据统计三套方案，最终实现 A + C 融合。[设计研究与原生核验步骤](https://github.com/youniube/scripting-cloudflare-zujian/blob/main/docs/UI-DESIGN.md)。

- [A / B / C 设计方案对比](https://raw.githubusercontent.com/youniube/scripting-cloudflare-zujian/main/docs/widget-designs.png)
- [三尺寸浅深色布局参考](https://raw.githubusercontent.com/youniube/scripting-cloudflare-zujian/main/docs/widget-preview.png)
- [小尺寸 / 长名称 / 95% 告警参考](https://raw.githubusercontent.com/youniube/scripting-cloudflare-zujian/main/docs/widget-preview-stress.png)
- [两次请求 / 历史缺失参考](https://raw.githubusercontent.com/youniube/scripting-cloudflare-zujian/main/docs/widget-preview-low.png)

**这些是带模拟数据的桌面 HTML 设计稿和 TSX 视图树近似排版，不是 Scripting 原生预览或 iPhone 截图。** 实际 Widget 使用 `Circle`、`ZStack`、`ProgressView`、`RoundedRectangle` 等原生组件，安装包不包含设计稿或模拟数据。真机预览使用脚本内“小号 / 中号 / 大号”按钮，然后添加到桌面检查。

如果安装页没有自动打开 App，可以复制以下远程 ZIP 地址，粘贴到 Scripting 的远程导入入口或 [官方链接生成页](https://www.scripting.fun/import_scripts/)：

```text
https://raw.githubusercontent.com/youniube/scripting-cloudflare-zujian/main/releases/cloudflare-workers-meter.zip
```

也提供 [从 GitHub 项目目录导入](https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fgithub.com%2Fyouniube%2Fscripting-cloudflare-zujian%2Ftree%2Fmain%2Fscripts%2FCloudflare%2520Workers%2520Meter%22%5D)。仓库地址：[youniube/scripting-cloudflare-zujian](https://github.com/youniube/scripting-cloudflare-zujian)。包内只含脚本源码与教程，Cloudflare Account ID、API Token 和统计缓存需要在本机配置。

`script.json` 已设置 `remoteResource.url`，指向固定安装包地址；没有配置自动更新间隔。以后可以从同一个入口导入新版，保留原脚本并选择更新，避免创建另一个凭据作用域。原生导入和更新行为仍需在 iPhone 上确认。详细手机步骤见 [远程安装教程](https://github.com/youniube/scripting-cloudflare-zujian/blob/main/docs/INSTALL.md)。

## 交付目录

```text
workers-meter-3ded5d9e/
├── scripts/
│   └── Cloudflare Workers Meter/    ← 需要导入 Scripting 的完整项目目录
│       ├── script.json
│       ├── index.tsx                # App 页面、账号配置、刷新与历史
│       ├── widget.tsx               # 桌面 Widget 入口
│       ├── core.ts                  # UTC、额度、类型、排名与格式化
│       ├── api.ts                   # Schema 验证、GraphQL、完整分页
│       ├── storage.ts               # 私有配置/缓存、Keychain 凭据
│       ├── service.ts               # 缓存、请求合并、防抖、刷新建议
│       ├── views.tsx                # 原生界面组件与趋势图
│       └── README.md                # 本教程副本
├── dist/
│   ├── Cloudflare Workers Meter.zip # 仅项目文件的 ZIP
│   └── SHA256SUMS.txt               # 导入包校验值
├── docs/                           # 官方资料、设计核对与验证报告
├── releases/                       # GitHub 固定下载地址使用的安装包与校验文件
├── tests/                          # 桌面逻辑测试；不会导入 iPhone
├── tools/                          # 打包、合约类型检查、真机声明检查
├── package.json                    # 只用于桌面开发；只有 TypeScript 开发依赖
└── tsconfig.json
```

`script.json` 的名称与项目目录一致。Scripting 的 App 入口是 `index.tsx`，Widget 入口是 `widget.tsx`。不要把 `tests`、`node_modules`、`tools` 或整个开发目录当成 iPhone 脚本导入。

## 1. 创建 Cloudflare 只读 API Token

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，选择需要监控的账号。
2. 打开该账号的 **API Tokens** 页面，创建 **Custom Token**。也可以使用个人资料中的 API Tokens 创建被限制到该账号的用户 Token。
3. 填写一个便于识别的名称，例如 `iPhone Workers Analytics Read`。
4. 只添加以下权限：

   | 范围 | 权限 | 级别 |
   | --- | --- | --- |
   | Account | Account Analytics | Read |

5. 在账号资源范围中仅包含要监控的账号。项目不查询 Zone，不需要增加 Zone 编辑权限，也不需要 Workers Scripts 编辑、部署、计费管理或账号管理权限。
6. 确认摘要后创建 Token，并在 iPhone 的脚本设置页面粘贴。Token 通常只在创建时显示一次。

账号 Token 一般绑定当前账号；监控多个账号时，为每个账号配置对应 Token。也可以使用范围包含这些账号的只读用户 Token。

最小权限和 Bearer 认证方式依据 [Cloudflare 官方 Analytics Token 教程](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/)。项目通过实际 GraphQL 查询验证权限，而不是仅检查 Token 字符串格式。

**不要把 Token 放入源码、Widget Parameter、`script.json`、GitHub、截图或日志。** Token 在本项目中只进入 Scripting 的本机 Keychain，默认不做 iCloud 同步。重启 iPhone 后，需要先解锁一次，Widget 才能读取此类 Keychain 项。

## 2. 获取 Account ID 并确认套餐

1. 选择正确的 Cloudflare 账号。
2. 进入 **Workers & Pages** 的账号页面，找到控制台提供的 **Account ID** 复制入口；也可以从该账号控制台 URL 中识别账号 ID。
3. Account ID 是 32 位十六进制字符串。不要复制域名页面的 Zone ID，也不要把 Worker 域名填进去。
4. 查看 Workers 的套餐/订阅页面，确认当前为 Free、Paid，或合同约定的其他配置。

只读 Analytics 权限不能可靠读取计费套餐与官方账号名称，因此页面使用你填写的账号显示名称，并将套餐标明为“用户设置/用户已确认”。它不会擅自判断每个账号都是免费套餐。

套餐选项：

| 配置 | 项目行为 |
| --- | --- |
| 未确认 | 展示请求量与明细；日额度、剩余和百分比显示未知 |
| Workers Free | 填写确认来源并勾选确认后，使用 100,000 / UTC 日，UTC 00:00 重置 |
| Workers Paid | 展示调用量；不套用免费日额度，不推算免费日余额 |
| 自定义 UTC 日阈值 | 需要正整数、确认来源及确认勾选；显示为监控阈值，不称作官方免费额度 |

Free 的每日额度与 Paid 的计费周期不同，具体以 [Cloudflare Workers 价格说明](https://developers.cloudflare.com/workers/platform/pricing/) 和 [账户限制](https://developers.cloudflare.com/workers/platform/limits/#account-plan-limits) 为准。自定义模式只适用于你确认采用 UTC 自然日的阈值；月额度不能直接当成日额度填入。

## 3. 导入 Scripting

请使用 **Scripting**，并更新到当前 App Store 版本。本项目按 2026-10-15 查阅的官方文档实现。它不适用于 Scriptable。

推荐直接使用上面的“iPhone 远程安装”入口。本地 ZIP 和桌面同步是备选方式。

### 项目文件/ZIP 方式

1. 把 `dist/Cloudflare Workers Meter.zip` 传到 iPhone 的“文件”App。
2. 当前 Scripting 版本如果提供本地 ZIP 导入入口，选择这个 ZIP。ZIP 中只有一个 `Cloudflare Workers Meter` 项目目录及其源文件。
3. 如果版本只提供文件导入，先在“文件”App 解压 ZIP，再在 Scripting 创建名为 **Cloudflare Workers Meter** 的脚本项目，将该目录内的源文件添加到同一项目根目录。
4. 如果该版本的本地文件导入入口不可用，可按官方快速入门新建同名项目，再创建 `core.ts`、`api.ts`、`storage.ts`、`service.ts`、`views.tsx`、`widget.tsx`，将交付文件原样粘贴进去，并替换 `index.tsx`。所有文件都处于同一级目录，不需要安装 npm 包。
5. 检查项目根目录里同时存在 `index.tsx` 和 `widget.tsx`，运行 `index.tsx`。

Scripting 官方明确支持项目目录结构、`index.tsx` / `widget.tsx` 入口，以及通过 URL 导入 ZIP。不同 App 版本的本地导入菜单可能不同；**这里没有把 Windows 打包检查当成 iOS 导入实测**。本项目的源目录是主要交付物，ZIP 是便于传输的同一份目录。结构依据 [官方快速入门](https://scriptingapp.github.io/guide/Quick%20Start) 和 [Script API 的 ZIP 导入说明](https://scriptingapp.github.io/guide/Script/Script)。

### 可选：官方桌面同步方式

如需直接在 Windows 编辑并同步到 iPhone，可使用官方 `scripting-cli`。电脑和 iPhone 需要在同一局域网。

```powershell
Set-Location -LiteralPath 'F:\codex\workers-meter-3ded5d9e'
npx scripting-cli@1.5.0 start --editor=none --port=3000
```

在 Scripting 中连接该本地开发服务并选择项目。CLI 使用根目录的 `scripts/` 目录，并会同步当前 App 的 `.d.ts`。这是可选的开发工具；日常 Widget 运行不需要电脑、CLI 或任何额外服务器。使用方法依据 [官方开发仓库](https://github.com/scriptingapp/scripting-app-development) 与 [CLI 使用说明](https://github.com/thomfang/scripting-cli)。

## 4. 第一次配置与查询

1. 运行脚本，点击“添加账号”。
2. 填写显示名称、Account ID，在安全输入框粘贴只读 Token。
3. 选择套餐。免费或自定义模式需填写确认来源，并勾选确认；不能确认时选择“未确认”。
4. 点击“保存”。返回主界面后会自动开始首次查询。
5. 首次查询会通过 Cloudflare Introspection 验证字段、分页过滤器和排序枚举，再读取真实账号的数据集限制。支持的 CPU 字段和单位也在此时确认。
6. 查看今日用量、Worker 明细和更新时间。若显示权限、Token、Schema 或网络错误，先按页面提示修正。
7. 切换“7 天”或“30 天”可读取历史。首次读取按日逐步完成，先查询最新日期；已经取得的日期会保存，未完成的日期可之后继续读取。

App 的“手动刷新”会刷新所选时段；最短间隔为 1 分钟。“验证 API”会重新确认字段与权限。API 限流时即使手动刷新也会遵守服务器的 `Retry-After` 冷却时间。

## 5. 添加桌面小组件

1. 长按 iPhone 桌面空白处，进入编辑状态。
2. 添加 **Scripting** 小组件，优先选择 **中号**。
3. 长按新小组件，进入“编辑小组件”，选择脚本 **Cloudflare Workers Meter**。
4. **Parameter 留空**：跟随 App 当前选择的账号。
5. **固定账号**：在脚本“账号管理”里点击“复制 Widget 参数”，粘贴到 Parameter。也可以填写 Account ID 或唯一的显示名称。
6. 回到桌面检查结果。App 刷新完成、切换账号或保存配置时，会调用 `Widget.reloadAll()` 请求桌面更新。

| 尺寸 | 显示内容 |
| --- | --- |
| 小号 | Cloudflare 风格云标识、今日请求估算、大数字、原生额度环、估算剩余百分比、缓存状态 |
| 中号 | 左侧请求数 / 估算剩余次数 / 额度环；右侧 Top 3 Worker 与按账户总量计算的流量条；底部状态和更新时间 |
| 大号 | 请求 / 额度摘要、额度环、错误数与错误率、UTC 重置倒计时、近七日柱状趋势、Worker 排名、更新时间 |

三种尺寸都在独立内容区保留 12–16pt 内边距，根背景填满 Widget，顶部保留账号名称以区分多个账号。长名称在原生单行约束下缩放，必要时省略，完整名称可在 App 查看。大号按点数尺寸调整排名行数（最多 4 项）和图表高度，中号保持前 3 项。历史图给每个 UTC 日期显示标签，缺数据标为 `—`；真实零值不会画成正值柱。

额度环按真实使用率绘制，零请求不画进度弧；超额时环最多一圈，文字仍显示实际使用率。Paid / 未确认套餐不套免费日额度，环显示无日额度状态。小号剩余百分比避免把已使用的额度舍入成完整 `100%`；中大号剩余次数保留完整数字。

**深浅色自动适应**：预览的“主题”选择“跟随系统”，日常随 iOS 的浅色/深色外观切换。背景、正文、次级文字、分隔线和告警色均使用官方动态颜色绑定，不需要重新设置账号。iOS 桌面着色模式另受系统渲染规则控制。

大号可以查询近 7 日，也复用 App 历史缓存。若刚刷新过中号，短时间内会复用缓存并抑制额外请求，未取得的历史显示缺口；在 App 先打开一次“7 天”可立即填充历史缓存。

`Widget.family` 使用 `systemSmall`、`systemMedium`、`systemLarge`，以官方 Widget API 页为准。脚本不依赖 Widget 中的 hooks，也不在 `Widget.present()` 之后安排缓存写入。小组件预览只用于初步检查，桌面真实布局仍需核验，见 [官方 Widget 快速入门](https://scriptingapp.github.io/guide/Widget/Widget%20Quick%20Start) 和 [Widget API](https://scriptingapp.github.io/guide/Widget/Widget%20API)。

## 6. 统计口径与历史边界

- 每一天使用半开区间 `[UTC 00:00, 下一天 UTC 00:00)`；今日结束点为本次查询开始时间。上海时区的本地 00:00 不用于查询边界。
- 最近 7 / 30 天包含今日。昨日是前一个完整 UTC 自然日。
- `workersInvocationsAdaptive` 是按所选维度聚合的数据集。账户总量不选择 Worker/时间/状态维度；Worker 明细只按 `scriptName` 分组。
- 请求与错误用 `sum.requests`、`sum.errors`；不用 `count` 代替请求量，不把 `subrequests` 加进来，不重复放大采样结果。
- Worker 分页按 `scriptName_ASC` 排序，下一页使用 `scriptName_gt`。满页后继续读取直到尾页；重复页、排序异常或请求预算耗尽都标为未完成，不把截断数据写成完整统计。
- CPU 使用 API 支持时的 `cpuTimeP50` / `cpuTimeP99`。单位来自 Schema 描述；无法确认时保留“API 原始单位”。多日或多段 CPU 分位数不相加、不平均。
- 根据 `settings.workersInvocationsAdaptive` 读取 `maxPageSize`、`maxDuration`、`notOlderThan` 与 `availableFields`。查询过长时按限制拆段；历史不支持的日期明确显示未取得，不补零。
- API 支持 `isPreview` 过滤器时排除 Preview；不支持时提示可能包含预览调用。
- 空响应无法可靠区分“未调用”和“延迟尚未聚合”，显示未知/暂无记录。真实返回 `requests: 0` 时才按零计算。
- Analytics 可能延迟，也可能按采样估算。Service Binding 调用、Pages Functions 等计费口径会与调用指标有差异；账户汇总与明细也可能有采样差异。页面始终标为估算，且独立账户汇总优先用于额度推算。
- 最小 Analytics 权限只能发现选定时段有统计的 Worker。没有调用记录的已部署 Worker 无法据此可靠列出；本项目不为列部署清单额外申请权限。

相关依据：[Workers GraphQL 官方示例](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/)、[采样说明](https://developers.cloudflare.com/analytics/graphql-api/sampling/)、[分页](https://developers.cloudflare.com/analytics/graphql-api/features/pagination/)、[数据集限制](https://developers.cloudflare.com/analytics/graphql-api/features/discovery/settings/)、[Workers 指标与延迟](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/)。

## 7. 缓存、刷新与提醒

今日和昨日的正常缓存复用 10 分钟；较早历史复用 24 小时。每账号最多保存 40 个日缓存。Widget 额外请求通常至少间隔 10 分钟；App 普通失败重试间隔 2 分钟，手动操作至少间隔 1 分钟。

Widget 向系统建议约 30 分钟后再请求数据，并在临近 UTC 午夜时建议午夜后查询。这只使用官方 `Widget.present(..., { policy: "after", date })`；**WidgetKit 决定实际执行时机，不保证固定分钟级刷新**。

同一执行上下文按账号合并/串行请求；不同尺寸复用同一项目的私有缓存。跨 Widget 进程还使用尽力抑制的短期占用记录。Scripting `Storage` 没有文档化的原子 CAS，不能保证两个进程同时首次启动时绝对没有重复请求。

网络失败保留最近成功数据与原更新时间。跨 UTC 零点后，旧数据标为具体日期的“旧缓存”，不会改称今日余额。Token 无效、权限不足、API 限流、Schema 不兼容、历史超期和无数据分别提示。

正常彩色模式下，额度达到 **80%** 使用黄色，**95%** 使用红色。iOS 的桌面着色模式可能统一颜色；百分比和文字状态仍用于判断。深浅色使用 Scripting 文档化的动态样式。建议在默认彩色模式检查告警配色。

当前版本仅做界面提示。Scripting 有本地 `Notification` API，但本项目没有实现后台通知采集与发送，也不承诺 Widget 能按某个固定时刻运行通知。它无需通知权限。

## 8. 常见问题

| 状态 | 处理方式 |
| --- | --- |
| 首次运行空白页面 | 更新到 1.1.0，重新运行原脚本；未配置账号时应出现“开始监控”和“添加账号” |
| Widget 仍显示旧样式 | 更新原脚本到 1.1.0，在预览里点击“重新加载”；桌面由系统安排更新 |
| Token 无效/不可读 | 检查过期、撤销或粘贴错误；重启后先解锁；在 App 重新保存 Token |
| 权限不足 | 检查 `Account Analytics → Read`、正确 Account ID 与 Token 账号范围 |
| API 限流 | 等待页面显示的冷却时间，不连续点击刷新 |
| API 待验证 | 先运行 App，点击“验证 API”；不能验证必要分页字段时明确停止 |
| 网络异常 | 查看缓存日期，恢复网络后刷新 |
| 暂无数据 | 确认确有 Worker 调用并等待聚合；不要据此认为余额一定为 100,000 |
| 历史缺口 | 查看数据保留期/未完成提示；选择对应时段继续刷新 |
| Widget 参数不匹配 | 复制账号的本地标识；显示名称重复时不用名称匹配 |
| Widget 延迟更新 | 在 App 刷新并回到桌面；系统会决定时间，不要按固定分钟数判断故障 |
| Token 粘贴受限 | 在 iOS 设置允许 Scripting 从其他 App 粘贴；无需把 Token 写到源码 |

删除账号时会在 App 内确认，并清理该账号的配置、Token 和缓存。它不会删除 Cloudflare 账号、Worker 或撤销云端 Token。重新导入为另一个独立脚本时，Keychain 作用域不同，可能需要重新配置凭据。

## 9. 桌面检查与真机核验

在项目根目录执行：

```powershell
npm ci
npm run check
npm test
npm run package
```

桌面依赖只有 TypeScript。`check` 使用根据官方文档整理的最小 API 合约，不是 Scripting 完整声明；47 项自动化测试使用模拟响应，验证业务、缓存、首次启动、三尺寸结构、主题、额度环、流量条、错误统计和低用量精度。桌面参考数据只存在于 `tests/` 与 `tools/`，导入包不包含它们。

重新生成桌面 HTML 参考（无需新增依赖，不代表 iOS 渲染）：

```powershell
node tools/render-design-concepts.mjs
node tools/render-widget-previews.mjs
node tools/render-widget-previews.mjs --stress
node tools/render-widget-previews.mjs --low
```

连接官方 CLI 并得到本机 App 的 `dts/` 后，可做完整声明诊断：

```powershell
node tools/check-device-types.mjs
```

尚未完成的真机核验：ZIP/文件导入流程、当前 App 的完整类型声明、原生页面与输入控件、三个桌面尺寸的文字与空间、深浅色/着色模式、Keychain 在 App 与 Widget 间访问、真实 Cloudflare 账号和 CPU 字段、UTC 重置附近显示、系统实际刷新与离线回退。

**本次未提供真实 Cloudflare 凭据，也未连接 iPhone，因此没有声称已完成真实账号请求或 iOS 原生测试。** 详细检查结果见 `docs/VALIDATION.md`，API 依据见 `docs/API-NOTES.md`。
