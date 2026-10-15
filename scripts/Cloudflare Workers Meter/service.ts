import { CloudflareClient, discoverCapabilities, fetchDay } from "./api"
import { AccountConfig, DAY_MS, DayData, Failure, failureFrom, MonitorError, MonitorView, Period, periodDates, utcDate, utcStart } from "./core"
import { acquireLease, clearFailure, latestDay, markAttempt, readAttempt, readCapabilities, readDay, readFailure, readToken, releaseLease, writeCapabilities, writeDay, writeFailure } from "./storage"

const inFlight = new Map<string, Promise<MonitorView>>()
export interface LoadOptions {
  force?: boolean
  widget?: boolean
  verify?: boolean
  now?: number
  onProgress?: (completed: number, total: number) => void
}
function isFresh(day: DayData | undefined, now: number): boolean {
  if (!day) return false
  const age = now - Date.parse(day.fetchedAt)
  if (age < 0) return false
  const recentDay = utcStart(day.dateUTC) >= utcStart(utcDate(now)) - DAY_MS
  // 今日/昨日继续补收延迟数据；较早自然日每 24 小时重新查询。
  return age < (recentDay ? 10 * 60_000 : DAY_MS)
}
export function cachedView(account: AccountConfig, period: Period, now = Date.now()): MonitorView {
  const expectedDates = periodDates(period, now)
  const days = expectedDates.map(date => readDay(account.id, date)).filter((day): day is DayData => !!day)
  const failure = readFailure(account.id)
  return {
    account, period, expectedDates, days, missingDates: expectedDates.filter(date => !days.some(day => day.dateUTC === date)),
    failures: failure ? [failure] : [], fromCache: true,
    previousDay: period === "today" && !days.length ? latestDay(account.id) : undefined,
  }
}
/** 同一 JS 上下文按账号串行。不同尺寸共享日期缓存与最近尝试时间。 */
export async function loadMonitor(account: AccountConfig, period: Period = "today", options: LoadOptions = {}): Promise<MonitorView> {
  const running = inFlight.get(account.id)
  if (running) {
    await running
    return loadMonitor(account, period, { ...options, force: false, verify: false })
  }
  const promise = performLoad(account, period, options)
  inFlight.set(account.id, promise)
  try { return await promise } finally { if (inFlight.get(account.id) === promise) inFlight.delete(account.id) }
}
async function performLoad(account: AccountConfig, period: Period, options: LoadOptions): Promise<MonitorView> {
  const now = options.now ?? Date.now()
  const initial = cachedView(account, period, now)
  let needs = initial.expectedDates.filter(date => options.force || !isFresh(readDay(account.id, date), now))
  if (!needs.length && !options.verify) return { ...initial, refreshState: { kind: "fresh" } }
  const oldFailure = readFailure(account.id)
  if (oldFailure?.retryAt && Date.parse(oldFailure.retryAt) > now) {
    return { ...initial, refreshState: { kind: "cooldown", retryAt: oldFailure.retryAt } }
  }
  const lastAttempt = readAttempt(account.id)
  const minimumGap = options.widget ? 10 * 60_000 : options.force || options.verify ? 60_000 : 2 * 60_000
  const applyGap = options.widget || options.force || options.verify || !!oldFailure || initial.missingDates.length === 0
  if (applyGap && now - lastAttempt >= 0 && now - lastAttempt < minimumGap) {
    // 前台可补取从未取得的日期，不因刚刷新今日而阻塞历史；失败/限流与 Widget 仍遵守间隔。
    const missing = !options.widget && !options.verify && !oldFailure ? needs.filter(date => !readDay(account.id, date)) : []
    if (!missing.length) return { ...initial, refreshState: { kind: "cooldown", retryAt: new Date(lastAttempt + minimumGap).toISOString() } }
    needs = missing
  }
  const lease = acquireLease(account.id, options.widget ? 25_000 : 150_000, now)
  if (!lease) return { ...initial, refreshState: { kind: "busy" } }
  const failures: Failure[] = []
  let refreshed = false
  try {
    markAttempt(account.id, now)
    const token = readToken(account.id)
    const client = new CloudflareClient(account.accountId, token, Date.now() + (options.widget ? 18_000 : 120_000), options.widget ? 12 : 90)
    let capabilities = readCapabilities(account.id)
    if (!capabilities || options.verify || (!options.widget && now - Date.parse(capabilities.checkedAt) > 7 * DAY_MS)) {
      if (options.widget) throw new MonitorError("configuration", "请先打开 App 刷新并验证 API 字段，再使用 Widget。")
      capabilities = await discoverCapabilities(client)
      writeCapabilities(account, capabilities)
    }
    // 先查询今日，以便长历史加载的中途也已有核心额度缓存。
    const ordered = [...needs].sort().reverse()
    for (let i = 0; i < ordered.length; i++) {
      const date = ordered[i]
      try {
        const day = await fetchDay(client, capabilities, date, now)
        writeDay(account, day)
        refreshed = true
      } catch (error) {
        const failure = failureFrom(error)
        failures.push(failure)
        if (failure.kind !== "retention") break
      }
      options.onProgress?.(i + 1, ordered.length)
    }
    if (!failures.length) clearFailure(account.id)
    else writeFailure(account, failures[0])
  } catch (error) {
    const failure = failureFrom(error)
    failures.push(failure)
    try { writeFailure(account, failure) } catch { /* 保留内存错误提示，不能因为缓存失败丢失界面。 */ }
  } finally {
    releaseLease(account.id, lease)
  }
  const result = cachedView(account, period, now)
  return { ...result, failures, fromCache: !refreshed }
}

export function suggestedReload(now = Date.now(), failure?: Failure): Date {
  const reset = utcStart(utcDate(now)) + DAY_MS + 60_000
  // 午夜后请求一轮新日期；这个时间只向 WidgetKit 建议，系统可延后执行。
  const normal = Math.min(now + 30 * 60_000, reset)
  const retry = failure?.retryAt ? Date.parse(failure.retryAt) : 0
  return new Date(Math.max(normal, Number.isFinite(retry) ? retry : 0))
}
