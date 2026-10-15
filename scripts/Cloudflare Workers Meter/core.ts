/** 纯 TypeScript 领域逻辑。不依赖 Node、DOM 或 iOS UI。 */
export const DAY_MS = 86_400_000
export const FREE_DAILY_LIMIT = 100_000
export const CACHE_VERSION = 1
export type Plan = "unknown" | "free" | "paid" | "custom"
export type Period = "today" | "yesterday" | "7d" | "30d"

export interface AccountConfig {
  id: string
  revision?: number
  accountId: string
  displayName: string
  plan: Plan
  dailyLimit?: number
  verificationNote?: string
  verifiedAt?: string
}
export interface Settings {
  version: 1
  accounts: AccountConfig[]
  selectedId: string | null
}
export interface WorkerMetric {
  name: string
  requests: number
  errors: number
  cpuP50?: number
  cpuP99?: number
  cpuUnit?: "µs" | "ms" | "ns" | "API 原始单位"
}
export interface DayData {
  version: 1
  dateUTC: string
  queriedFrom: string
  queriedTo: string
  fetchedAt: string
  requests: number | null
  errors: number | null
  workers: WorkerMetric[]
  warnings: string[]
}
export interface Capabilities {
  checkedAt: string
  maxPageSize: number
  maxDuration: number
  notOlderThan: number
  cpu: boolean
  cpuUnit: WorkerMetric["cpuUnit"]
  excludePreview: boolean
}
export type FailureKind = "network" | "auth" | "permission" | "rateLimit" | "schema" | "retention" | "incomplete" | "api" | "storage" | "configuration"
export interface Failure {
  kind: FailureKind
  message: string
  occurredAt: string
  retryAt?: string
}
export class MonitorError extends Error {
  readonly kind: FailureKind
  readonly retryAt?: string
  constructor(kind: FailureKind, message: string, retryAt?: string) {
    super(message)
    this.name = "MonitorError"
    this.kind = kind
    this.retryAt = retryAt
  }
}
export interface MonitorView {
  account: AccountConfig
  period: Period
  expectedDates: string[]
  days: DayData[]
  missingDates: string[]
  failures: Failure[]
  fromCache: boolean
  previousDay?: DayData
  /** 本轮未请求网络的原因，不写入日期缓存。 */
  refreshState?: { kind: "fresh" | "busy" } | { kind: "cooldown"; retryAt: string }
}

export function utcDate(now: Date | number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10)
}
export function utcStart(dateUTC: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateUTC)) throw new MonitorError("configuration", "UTC 日期格式错误。")
  const value = Date.parse(dateUTC + "T00:00:00.000Z")
  if (!Number.isFinite(value) || utcDate(value) !== dateUTC) throw new MonitorError("configuration", "UTC 日期无效。")
  return value
}
export function nextReset(now = Date.now()): Date {
  return new Date(utcStart(utcDate(now)) + DAY_MS)
}
/** 最近 N 个 UTC 自然日包含今日；昨日单独返回。 */
export function periodDates(period: Period, now = Date.now()): string[] {
  const today = utcStart(utcDate(now))
  if (period === "yesterday") return [utcDate(today - DAY_MS)]
  const count = period === "7d" ? 7 : period === "30d" ? 30 : 1
  return Array.from({ length: count }, (_, i) => utcDate(today - (count - 1 - i) * DAY_MS))
}
export function quota(account: AccountConfig, used: number | null) {
  const limit = account.plan === "free" && account.verifiedAt ? FREE_DAILY_LIMIT
    : account.plan === "custom" && account.verifiedAt ? account.dailyLimit ?? null : null
  if (limit === null || used === null) return { limit, remaining: null, ratio: null, level: "unknown" as const }
  const ratio = used / limit
  return {
    limit, remaining: Math.max(0, limit - used), ratio,
    level: ratio >= 0.95 ? "critical" as const : ratio >= 0.8 ? "warning" as const : "normal" as const,
  }
}
export function planLabel(account: AccountConfig): string {
  if (account.plan === "paid") return "Workers Paid · 用户设置"
  if (account.plan === "free" && account.verifiedAt) return "Workers Free · 用户已确认"
  if (account.plan === "custom" && account.verifiedAt) return "自定义 UTC 日阈值 · 用户已确认"
  return "套餐未确认"
}
export function validateAccount(account: AccountConfig): void {
  if (!/^[a-f0-9]{32}$/i.test(account.accountId)) throw new MonitorError("configuration", "Account ID 应为 32 位十六进制字符，请勿填写 Zone ID。")
  if (!account.displayName.trim()) throw new MonitorError("configuration", "请填写账号显示名称。")
  if (!["unknown", "free", "paid", "custom"].includes(account.plan)) throw new MonitorError("configuration", "套餐配置无效。")
  if (account.plan === "free" || account.plan === "custom") {
    if (!account.verifiedAt || !account.verificationNote?.trim()) throw new MonitorError("configuration", "请先在 Cloudflare 控制台确认套餐或日阈值，并填写确认来源。")
  }
  if (account.plan === "custom" && (!Number.isSafeInteger(account.dailyLimit) || (account.dailyLimit ?? 0) <= 0)) {
    throw new MonitorError("configuration", "自定义日阈值必须是正整数。")
  }
}
export function rankWorkers(days: DayData[]): WorkerMetric[] {
  if (days.length === 1) return [...days[0].workers].sort(byRequests)
  const metrics = new Map<string, WorkerMetric>()
  for (const day of days) {
    for (const worker of day.workers) {
      const current = metrics.get(worker.name) ?? { name: worker.name, requests: 0, errors: 0 }
      current.requests += worker.requests
      current.errors += worker.errors
      // 分位数不可跨天相加或加权平均。多日排名只聚合可加指标。
      metrics.set(worker.name, current)
    }
  }
  return [...metrics.values()].sort(byRequests)
}
export function byRequests(a: WorkerMetric, b: WorkerMetric): number {
  return b.requests - a.requests || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
}
export function totalRequests(days: DayData[]): number | null {
  const available = days.filter(day => day.requests !== null)
  return available.length ? available.reduce((sum, day) => sum + (day.requests ?? 0), 0) : null
}
export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  const parts = Math.round(value).toString().split(".")
  return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}
export function compactNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M"
  if (value >= 10_000) return (value / 1_000).toFixed(1) + "k"
  return formatNumber(value)
}
export function percent(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return "—"
  const value = ratio * 100
  // 少量真实调用不能因为保留一位小数而变成 0.0%。
  if (value > 0 && value < 0.1) return value < 0.001 ? "<0.001%" : value.toFixed(3) + "%"
  return value.toFixed(1) + "%"
}
export function fraction(numerator: number, denominator: number | null): string {
  return denominator === null || denominator <= 0 ? "—" : percent(numerator / denominator)
}
export function cacheAge(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000))
  return minutes < 1 ? "刚刚" : minutes < 60 ? `${minutes} 分钟前` : minutes < 1440 ? `${Math.floor(minutes / 60)} 小时前` : `${Math.floor(minutes / 1440)} 天前`
}
export function failureFrom(error: unknown, now = Date.now()): Failure {
  const known = error instanceof MonitorError ? error : new MonitorError("api", "更新失败，请重试。")
  // 不保存原始 Response、GraphQL 错误或原生异常，避免凭据进入日志和缓存。
  return { kind: known.kind, message: known.message, occurredAt: new Date(now).toISOString(), retryAt: known.retryAt }
}
