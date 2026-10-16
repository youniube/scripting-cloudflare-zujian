/** 融合展示适配层：复用两个独立监控服务，不合并计量单位或改写它们的缓存。 */
import { AIView, cachedAIView, loadAI } from "./ai"
import { AccountConfig, failureFrom, MonitorView, Period, periodDates } from "./core"
import { cachedView, LoadOptions, loadMonitor, suggestedReload } from "./service"
import { isCurrentAccount } from "./storage"

export interface FusionView {
  account: AccountConfig
  period: Period
  expectedDates: string[]
  workers: MonitorView
  ai: AIView
}
export function cachedFusion(account: AccountConfig, period: Period, now = Date.now()): FusionView {
  return { account, period, expectedDates: periodDates(period, now), workers: cachedView(account, period, now), ai: cachedAIView(account, period, now) }
}
interface FusionOptions extends LoadOptions {
  cancelled?: () => boolean
  onUpdate?: (view: FusionView) => void
  onProductProgress?: (product: "Workers" | "Workers AI", completed: number, total: number) => void
}
export async function loadFusion(account: AccountConfig, period: Period, options: FusionOptions = {}): Promise<FusionView> {
  const now = options.now ?? Date.now()
  let result = cachedFusion(account, period, now)
  // Widget 优先更新两项今日摘要；多日明细由 App 的 7/30 天查询写入相同缓存。
  // 两个原服务使用同一个账号锁，必须依次执行，不能 Promise.all。
  const queryPeriod = options.widget ? "today" : period
  const publish = () => options.onUpdate?.(result)
  try {
    const workers = await loadMonitor(account, queryPeriod, { ...options, onProgress: (done, total) => {
      result = { ...result, workers: cachedView(account, period, now) }
      options.onProductProgress?.("Workers", done, total); publish()
    } })
    result = { ...result, workers: queryPeriod === period ? workers : { ...cachedView(account, period, now), failures: workers.failures, refreshState: workers.refreshState, fromCache: workers.fromCache } }
  } catch (error) { result = { ...result, workers: { ...cachedView(account, period, now), failures: [failureFrom(error)] } } }
  publish()
  // 编辑/删除账号后，不再开始第二项旧账号查询。
  if (options.cancelled?.() || !isCurrentAccount(account)) return result
  try {
    const ai = await loadAI(account, queryPeriod, { ...options, onProgress: (done, total) => {
      result = { ...result, ai: cachedAIView(account, period, now) }
      options.onProductProgress?.("Workers AI", done, total); publish()
    } })
    result = { ...result, ai: queryPeriod === period ? ai : { ...cachedAIView(account, period, now), failures: ai.failures, refreshState: ai.refreshState, fromCache: ai.fromCache } }
  } catch (error) { result = { ...result, ai: { ...cachedAIView(account, period, now), failures: [failureFrom(error)] } } }
  publish()
  return result
}
export function fusionReload(view: FusionView, now = Date.now()): Date {
  return new Date(Math.max(suggestedReload(now).getTime(), ...[...view.workers.failures, ...view.ai.failures].map(failure => suggestedReload(now, failure).getTime())))
}
