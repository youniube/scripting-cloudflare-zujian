# Premium Cloudflare Analytics Dashboard · 1.1.0

本次升级只调整 Widget 视觉、相关类型合约、测试和交付资料。Cloudflare 请求、认证、账号配置、缓存和 UTC 统计保持既有实现。实际 Widget 是原生 TSX 视图，不通过图片或 HTML 承载。

## 已研究的开源设计

| 项目 | 实际查看的截图和源码 | 提取的设计思路 |
| --- | --- | --- |
| [pawello2222/WidgetExamples](https://github.com/pawello2222/WidgetExamples) | `.resources/Screenshots/EnvironmentWidget.png`、Countdown；`EnvironmentWidget+EntryView.swift`、`CountdownWidget+EntryView.swift` | 标题与内容分层、明确的留白、根据环境选择颜色、倒计时和状态提示。该项目是 WidgetKit 能力示例，不将它当作 Scripting API 依据。 |
| [Nicolasking007/Scriptable](https://github.com/Nicolasking007/Scriptable) | `images/main.png`、`images/cover.jpg`、`ONE-Friday/ONE-Friday.js` | 通过很少的大字形成主次对比，小号聚焦一个核心信息；参考其留白和字号差异。部分其他脚本为 `.Enc.js`，未解密或执行。 |
| [rushhiii/Scriptable-iOSWidgets](https://github.com/rushhiii/Scriptable-IOSWidgets) | GitHub Stats showcase、深色橙色热力图；`MyGitHubStats.js` 的布局、渐变和主题定义 | 等距数据图形、明确的底部统计、深色中克制的强调色、按尺寸改变信息密度。最终使用七个实际日期的柱状图，不仿造一整块不存在的贡献历史。 |
| [yaylinda/scriptable](https://github.com/yaylinda/scriptable) | `images/TerminalWidget.png`、AggregatedDailyLogs；`TerminalWidget.js`、`MultiDayCalendarWidget.js` | 开发者数据中的对齐与等宽数字、灰色元信息、浅层背景渐变。减少终端式多彩文本，保留橙色与告警色。 |

源截图、源码只作为研究资料留在本地 `docs/reference/premium-ui/`，不进入发布清单。没有复制这四个项目的 UI 源码，也没有引入 SwiftUI 工程代码、Scriptable `ListWidget` 或 `DrawContext`。

## 三套方案

- **A · 深色科技仪表盘**：深蓝黑渐变、Cloudflare 橙色额度环、大请求数、左右分区。
- **B · Apple 极简**：浅底、少量核心数字、大留白、独立的环形图。
- **C · GitHub 数据统计**：紧凑分区、等宽数字、状态提示、数据条和活动图节奏。

先生成 [A/B/C 对比稿](widget-designs.png)，再实现默认 **A + C 融合**。A 负责品牌和核心额度，C 提供 Worker 对齐及流量条；浅色配套采用 B 的留白和克制配色。三个独立方案是设计研究，不添加额外主题配置或三个并行运行时。

## 实现与数据语义

| 尺寸 | 结构 |
| --- | --- |
| 小号 | Cloudflare 风格云符号与字标、账号标识、今日请求大字、额度环、估算剩余百分比、简短状态 / 更新时间 |
| 中号 | 左侧大请求数、额度环、估算剩余次数；右侧最多三项 Worker 及流量条；底部状态和缓存时间 |
| 大号 | 额度摘要与大环、错误数 / 错误率 / UTC 重置、七日趋势、排名与流量条、成功更新时间 |

主数字使用原生圆角字形，排行数值使用等宽数字；字体、内边距、环尺寸与图表高度按 Widget 点数尺寸控制。背景、面板、正文、次级文字、品牌、警告和错误色均使用原生浅深色动态绑定。没有强制 `preferredColorScheme`，也没有把执行时读取的主题快照写入缓存。

- 环：`quota()` 的原始使用率直接驱动 `Circle.trim`。零和未知不画伪造的进度；超额只限制几何图形到一圈，文字仍显示真实比例。
- 剩余：沿用已有 `quota()` 输出。小号显示百分比，中大号显示完整次数；极低用量不会让已使用额度显示为完整 `100%`。
- Worker 条：使用 Worker 请求数 / 独立账号请求总量，不按 Top 3 重新归一化；分母未知时不绘制假比例。
- 历史：只按收到的七个 UTC 日期绘制。缺数据为 `—`，真实零值只显示零，不填正高度柱；缺失峰值保持未知。
- 错误：使用当天已缓存的 `errors`、`requests`，错误率沿用既有 `fraction()`；没有新增 API 请求。
- 套餐：Paid 和未确认状态不套用免费额度或画出虚假日余额。
- 品牌：标识是本机 SF Symbols 云符号与 Cloudflare 字样的组合，不下载远程图标，不宣称这是 Cloudflare 官方 App。

## 官方 API 依据与类型边界

按用户指定的 [官方 Skill](https://github.com/ScriptingApp/scripting-app-development/blob/main/SKILL.md) 阅读 Widget、验证规范及官方 `llms.txt`。核对了下列文档中的准确声明和示例：

- [Widget Quick Start](https://scriptingapp.github.io/zh/guide/Widget/Widget%20Quick%20Start) 与 [Widget API](https://scriptingapp.github.io/guide/Widget/Widget%20API)：尺寸、参数、生命周期、原生预览限制。
- [Shapes](https://scriptingapp.github.io/guide/Views/Shapes/index)：`ShapeProps.trim`、`stroke.shapeStyle`、`StrokeStyle.lineWidth` / `lineCap` / `dash`、`Circle`。
- [ZStack](https://scriptingapp.github.io/guide/Views/Layout/ZStack/index)、[rotationEffect](https://scriptingapp.github.io/guide/View%20Modifiers/rotationEffect)：叠放与从十二点方向绘制进度。
- [ShapeStyle](https://scriptingapp.github.io/guide/Types/ShapeStyle)、[DynamicShapeStyle](https://scriptingapp.github.io/guide/Types/DynamicShapeStyle)、[widgetBackground](https://scriptingapp.github.io/guide/View%20Modifiers/widgetBackground)：动态渐变、面板与填充。
- [Text View Modifiers](https://scriptingapp.github.io/guide/View%20Modifiers/Text%20View%20Modifiers)、[Image](https://scriptingapp.github.io/guide/Views/Image/index)：字号、字形、`monospacedDigit`、`kerning`、系统云符号。

Windows 没有连接 Scripting App；未取得完整手机同步 `.d.ts`。本地 `tools/documented-api.d.ts` 只扩展了文档明确列出的必要字段，不能当作完整官方 SDK 声明。获得手机声明后执行 `node tools/check-device-types.mjs` 做完整诊断。

## 可查看的桌面参考

- [A/B/C 对比](widget-designs.png) / [HTML](widget-designs.html)
- [三尺寸 × 浅深色](widget-preview.png) / [HTML](widget-preview.html)
- [小尺寸、长名称、95% 告警](widget-preview-stress.png) / [HTML](widget-preview-stress.html)
- [两次请求、六天缺失](widget-preview-low.png) / [HTML](widget-preview-low.html)

所有图均明确标注模拟数据。HTML 参考由实际 TSX 视图树映射到桌面浏览器排版，圆环比例、条长度、颜色与柱高度直接读取组件属性。它没有执行 SwiftUI 的字体和布局算法，**不是 Scripting 原生预览或 iPhone 截图**；图像与 HTML 不进入安装 ZIP。

生成方式：

```powershell
node tools/render-design-concepts.mjs
node tools/render-widget-previews.mjs
node tools/render-widget-previews.mjs --stress
node tools/render-widget-previews.mjs --low
```

输出 HTML 可直接用桌面浏览器打开。已使用本机 Edge 无界面模式查看参考图；没有安装额外前端框架或运行时依赖。

## 最短真机验证路径

1. 在原脚本上更新到 1.1.0，运行脚本，沿用本机账号并刷新一次。
2. 进入脚本的“Widget 预览”，先检查中号，再检查小号、大号，点击“重新加载”。
3. 在预览中分别检查浅色和深色，然后恢复“跟随系统”。确认主数字、环内百分比、右侧 Worker 名称与页脚没有重叠。
4. 将三种尺寸真正添加到 iPhone 桌面，切换 iOS 浅深色外观，核对 WidgetKit 的实际圆角、文字空间和更新行为。预览通过不等同于桌面通过。
5. 用短 / 长账号名及 Worker 名称、大请求数检查。任意长名称无法保证在固定小组件内完整展示；完整名称仍可在 App 查阅，核心数字优先保留。
6. 对照 App 同一缓存时间的请求数、剩余、错误数、UTC 日期。零、缺数据、Paid / 未确认状态需分别检查；不要把近七日缺口当成零。
7. 已有成功缓存时断网并重新加载，确认仍显示缓存与异常状态；重新联网后按原有策略刷新。

本次未增加权限、服务端、后台承诺或新的 Cloudflare 数据请求。
