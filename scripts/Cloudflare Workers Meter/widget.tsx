import { Widget } from "scripting"
import { failureFrom, MonitorError, periodDates } from "./core"
import { cachedView, loadMonitor, suggestedReload } from "./service"
import { resolveWidgetAccount } from "./storage"
import { SetupWidget, WidgetView } from "./views"

async function run() {
  try {
    const account = resolveWidgetAccount(Widget.parameter)
    if (!account) {
      Widget.present(<SetupWidget message="请先运行脚本，添加 Cloudflare 只读账号并完成首次刷新。" />, { policy: "after", date: suggestedReload() })
      return
    }
    if (!["systemSmall", "systemMedium", "systemLarge"].includes(Widget.family)) {
      throw new MonitorError("configuration", "本项目支持桌面小号、中号、大号 Widget。请选择这三种尺寸。")
    }
    const period = Widget.family === "systemLarge" ? "7d" : "today"
    const view = await loadMonitor(account, period, { widget: true })
    const today = cachedView(account, "today")
    // 大号 Widget 的历史错误同样在底部显示；今日始终使用独立日期缓存。
    today.failures = view.failures
    const dates = periodDates("7d")
    const chartHeight = Math.max(24, Math.min(40, Widget.displaySize.height * 0.095))
    Widget.present(<WidgetView view={today} family={Widget.family} dates={dates} history={view.days} chartHeight={chartHeight} />, {
      policy: "after", date: suggestedReload(Date.now(), view.failures[0]),
    })
    // Widget.present 会销毁执行上下文，数据/缓存必须在它之前处理。
  } catch (error) {
    const failure = failureFrom(error)
    Widget.present(<SetupWidget message={failure.message} />, { policy: "after", date: suggestedReload(Date.now(), failure) })
  }
}
void run()
