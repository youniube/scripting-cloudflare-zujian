import { Chart, BarChart, DateLabel, HStack, ProgressView, RoundedRectangle, Spacer, Text, VStack } from "scripting"
import { AccountConfig, cacheAge, compactNumber, DayData, Failure, formatNumber, fraction, MonitorView, nextReset, percent, planLabel, quota, rankWorkers, utcDate, WorkerMetric } from "./core"

export const palette = {
  background: { light: "#F8FAFD", dark: "#121820" },
  primary: { light: "#152335", dark: "#F2F6FC" },
  secondary: { light: "#536277", dark: "#A6B5CA" },
  accent: { light: "#1263C4", dark: "#79B8FF" },
  warning: { light: "#935700", dark: "#FFD074" },
  critical: { light: "#BC2337", dark: "#FF94A3" },
  track: { light: "#DEE5EF", dark: "#2B3748" },
  separator: { light: "#D8E0EB", dark: "#2A3647" },
}
type DisplaySize = { width: number; height: number }
/** displaySize 使用点数；只选择密度，不给根视图强制设置整屏宽高。 */
export function widgetLayout(family: string, displaySize?: DisplaySize, workerCount = 3) {
  const small = family === "systemSmall"
  const large = family === "systemLarge"
  const width = displaySize?.width && Number.isFinite(displaySize.width) && displaySize.width > 0 ? displaySize.width : small ? 158 : 338
  const height = displaySize?.height && Number.isFinite(displaySize.height) && displaySize.height > 0 ? displaySize.height : large ? 354 : 158
  const inset = small ? 12 : large && width >= 340 ? 16 : 14
  // 为摘要、标题、页脚和间距保守预留 200pt，排名每行预算 19pt。
  const available = height - inset * 2 - 200
  const rankLimit = large ? Math.max(1, Math.min(5, Math.floor((available - 40) / 19))) : 3
  const rows = Math.max(1, Math.min(workerCount, rankLimit))
  const chartHeight = large ? Math.max(28, Math.min(128, available - rows * 19)) : 0
  return { inset, gap: small ? 4 : large ? 6 : 5, rankLimit, chartHeight }
}
export function quotaColor(account: AccountConfig, day?: DayData) {
  const level = quota(account, day?.requests ?? null).level
  return level === "critical" ? palette.critical : level === "warning" ? palette.warning : palette.accent
}
export function failureLabel(failure?: Failure): string {
  if (!failure) return ""
  return ({ network: "网络异常", auth: "Token 无效/不可读", permission: "权限不足", rateLimit: "API 限流", schema: "API 待验证", retention: "历史超出保留期", incomplete: "查询未完成", api: "API 异常", storage: "存储异常", configuration: "配置待完成" })[failure.kind]
}
export function displayedDay(view: MonitorView): DayData | undefined {
  return view.days.find(day => day.dateUTC === utcDate()) ?? view.previousDay
}
function dayTitle(day?: DayData): string {
  return !day || day.dateUTC === utcDate() ? "今日调用 · 估算" : `${day.dateUTC.slice(5)} 旧缓存 · 估算`
}
export function QuotaProgress({ account, day }: { account: AccountConfig; day?: DayData }) {
  const q = quota(account, day?.requests ?? null)
  return q.ratio === null
    ? <RoundedRectangle cornerRadius={3} fill={palette.track} frame={{ height: 5 }} />
    : <ProgressView value={Math.min(1, q.ratio)} total={1} progressViewStyle="linear" tint={quotaColor(account, day)} />
}
export function CompactQuota({ account, day, small = false, medium = false }: { account: AccountConfig; day?: DayData; small?: boolean; medium?: boolean }) {
  const q = quota(account, day?.requests ?? null)
  const hasQuota = q.limit !== null
  const isCustom = account.plan === "custom"
  return <VStack alignment="leading" spacing={medium ? 3 : small ? 4 : 6} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}>
    <Text font={small || medium ? 9 : 10} foregroundStyle={palette.secondary} lineLimit={1} minScaleFactor={0.8}>{dayTitle(day)}</Text>
    <HStack alignment="firstTextBaseline" spacing={3}>
      <Text font={medium ? 26 : small ? 28 : 30} fontWeight="bold" fontDesign="rounded" minScaleFactor={0.6} lineLimit={1}>{formatNumber(day?.requests)}</Text>
      <Spacer />
      {hasQuota ? <Text font={9} fontWeight="semibold" foregroundStyle={quotaColor(account, day)} lineLimit={1}>{percent(q.ratio)}</Text> : null}
    </HStack>
    <QuotaProgress account={account} day={day} />
    {hasQuota ? <HStack spacing={4}>
      <Text font={small || medium ? 9 : 10} foregroundStyle={palette.secondary} lineLimit={1}>{isCustom ? "距阈值" : "估算剩余"}</Text>
      <Spacer />
      <Text font={small || medium ? 11 : 12} fontWeight="semibold" fontDesign="rounded" lineLimit={1} minScaleFactor={0.7}>{formatNumber(q.remaining)}</Text>
    </HStack> : <Text font={9} foregroundStyle={palette.secondary} lineLimit={1} minScaleFactor={0.8}>{account.plan === "paid" ? "付费 · 无免费日额度" : "日额度未确认"}</Text>}
    {!small && hasQuota ? <Text font={medium ? 8 : 10} foregroundStyle={palette.secondary} lineLimit={1}>{isCustom ? "日阈值 " : "日额度 "}{formatNumber(q.limit)} · UTC</Text> : null}
  </VStack>
}
export function WorkerRank({ workers, total, limit = 3, compact = false }: { workers: WorkerMetric[]; total: number | null; limit?: number; compact?: boolean }) {
  return <VStack alignment="leading" spacing={compact ? 3 : 9} frame={{ maxWidth: "infinity", alignment: "leading" }}>
    {workers.length === 0 ? <Text font={10} foregroundStyle={palette.secondary} lineLimit={2}>暂无 Worker 调用记录</Text> : workers.slice(0, limit).map((worker, index) =>
      <HStack key={worker.name} spacing={5} frame={compact ? { height: 16 } : undefined}>
        <Text font={10} foregroundStyle={palette.secondary}>{index + 1}</Text>
        <Text font={compact ? 10 : 12} lineLimit={1} minScaleFactor={0.85} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}>{worker.name || "未命名 Worker"}</Text>
        <VStack alignment="trailing" spacing={1}>
          <Text font={11} fontWeight="semibold" fontDesign="rounded" lineLimit={1} minScaleFactor={0.8}>{compactNumber(worker.requests)}</Text>
          {!compact ? <Text font={9} foregroundStyle={palette.secondary}>{fraction(worker.requests, total)}</Text> : null}
        </VStack>
      </HStack>
    )}
  </VStack>
}
export function WidgetFooter({ day, failure, missing = 0, showTime = false, level = "unknown" }: { day?: DayData; failure?: Failure; missing?: number; showTime?: boolean; level?: string }) {
  const threshold = level === "critical" ? "额度 ≥95%" : level === "warning" ? "额度 ≥80%" : "Analytics 估算"
  const status = failureLabel(failure) || (!day || day.requests === null ? "暂无数据" : day.dateUTC !== utcDate() ? "跨日待更新" : day.warnings.length ? "统计有缺口" : threshold)
  return <HStack spacing={3}>
    <Text font={9} foregroundStyle={failure ? palette.warning : palette.secondary} lineLimit={1} minScaleFactor={0.7}>{status}{missing ? ` · 缺 ${missing} 天` : ""}</Text>
    <Spacer />
    <Text font={9} foregroundStyle={palette.secondary} lineLimit={1} minScaleFactor={0.7}>{day ? (showTime ? `UTC ${day.fetchedAt.slice(11, 16)} 更新 · ` : "") + cacheAge(day.fetchedAt) : "请打开 App"}</Text>
  </HStack>
}
function LargeWidgetQuota({ account, day }: { account: AccountConfig; day?: DayData }) {
  const q = quota(account, day?.requests ?? null)
  return <VStack alignment="leading" spacing={5}>
    <HStack alignment="top" spacing={14}>
      <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <Text font={9} foregroundStyle={palette.secondary} lineLimit={1}>{dayTitle(day)}</Text>
        <Text font={28} fontDesign="rounded" fontWeight="bold" lineLimit={1} minScaleFactor={0.6}>{formatNumber(day?.requests)}</Text>
      </VStack>
      {q.limit !== null ? <VStack alignment="trailing" spacing={3} frame={{ maxWidth: "infinity", alignment: "trailing" }}>
        <Text font={9} foregroundStyle={palette.secondary}>{account.plan === "custom" ? "距日阈值" : "估算剩余"}</Text>
        <Text font={22} fontDesign="rounded" fontWeight="semibold" lineLimit={1} minScaleFactor={0.6}>{formatNumber(q.remaining)}</Text>
      </VStack> : <Text font={10} foregroundStyle={palette.secondary} lineLimit={2}>{planLabel(account)}</Text>}
    </HStack>
    <HStack spacing={8}>
      <QuotaProgress account={account} day={day} />
      {q.limit !== null ? <Text font={10} fontWeight="semibold" foregroundStyle={quotaColor(account, day)} lineLimit={1}>{percent(q.ratio)}</Text> : null}
    </HStack>
    {q.limit !== null ? <HStack>
      <Text font={9} foregroundStyle={palette.secondary} lineLimit={1} minScaleFactor={0.8}>{account.plan === "custom" ? "日阈值 " : "Free 日额度 "}{formatNumber(q.limit)}</Text>
      <Spacer />
      <Text font={9} foregroundStyle={palette.secondary} lineLimit={1}>UTC 重置</Text>
      <DateLabel date={nextReset()} style="timer" font={9} fontDesign="monospaced" foregroundStyle={palette.secondary} />
    </HStack> : <Text font={9} foregroundStyle={palette.secondary}>{account.plan === "paid" ? "付费 · 无免费日额度" : "日额度未确认"}</Text>}
  </VStack>
}

/** Widget 用原生形状绘制轻量柱状图；未知日期留空并标记 —。 */
export function TrendBars({ dates, days, height = 38 }: { dates: string[]; days: DayData[]; height?: number }) {
  const maximum = Math.max(1, ...days.map(day => day.requests ?? 0))
  const plotHeight = Math.max(1, height - 14)
  return <HStack alignment="bottom" spacing={5}>
    {dates.map(date => {
      const day = days.find(item => item.dateUTC === date)
      const value = day?.requests ?? null
      return <VStack key={date} spacing={3} frame={{ maxWidth: "infinity" }}>
        <VStack spacing={3} frame={{ height, alignment: "bottom" }}>
          <Text font={8} foregroundStyle={palette.secondary} lineLimit={1}>{value === null ? "—" : compactNumber(value)}</Text>
          {value !== null ? <RoundedRectangle cornerRadius={3} fill={palette.accent} frame={{ width: 14, height: Math.max(1, plotHeight * value / maximum) }} /> : null}
        </VStack>
        <Text font={8} foregroundStyle={palette.secondary} lineLimit={1}>{date.slice(5).replace("-", "/")}</Text>
      </VStack>
    })}
  </HStack>
}
export function DailyChart({ dates, days }: { dates: string[]; days: DayData[] }) {
  const domain = dates.map(date => date.slice(5))
  const marks = days.filter(day => day.requests !== null).map(day => ({ label: day.dateUTC.slice(5), value: day.requests as number }))
  return <Chart frame={{ height: 160 }} chartLegend="hidden" chartXScale={domain} chartYAxis="automatic">
    <BarChart marks={marks} foregroundStyle={palette.accent} />
  </Chart>
}
export function WorkerDetail({ worker, total }: { worker: WorkerMetric; total: number | null }) {
  return <VStack alignment="leading" spacing={5} padding={{ vertical: 4 }}>
    <HStack>
      <Text font="headline" lineLimit={2}>{worker.name || "未命名 Worker"}</Text>
      <Spacer />
      <Text font="headline" fontDesign="rounded">{formatNumber(worker.requests)}</Text>
    </HStack>
    <Text font="caption" foregroundStyle={palette.secondary}>占比 {fraction(worker.requests, total)} · 错误 {formatNumber(worker.errors)} · 错误率 {fraction(worker.errors, worker.requests)}</Text>
    {worker.cpuP50 !== undefined || worker.cpuP99 !== undefined ?
      <Text font="caption" foregroundStyle={palette.secondary}>CPU P50 {worker.cpuP50?.toFixed(2) ?? "—"} / P99 {worker.cpuP99?.toFixed(2) ?? "—"} {worker.cpuUnit ?? "API 原始单位"}</Text> : null}
  </VStack>
}
export function FullQuota({ account, day }: { account: AccountConfig; day?: DayData }) {
  const q = quota(account, day?.requests ?? null)
  return <VStack alignment="leading" spacing={9}>
    <Text font="caption" foregroundStyle={palette.secondary}>{planLabel(account)}</Text>
    <CompactQuota account={account} day={day} />
    {q.limit !== null ? <HStack>
      <Text font="caption" foregroundStyle={palette.secondary}>下次 UTC 重置</Text>
      <Spacer />
      <DateLabel date={nextReset()} style="timer" font="caption" fontDesign="monospaced" />
    </HStack> : <Text font="caption" foregroundStyle={palette.secondary}>付费或未确认套餐不推算免费日余额。</Text>}
    {day ? <Text font="caption" foregroundStyle={palette.secondary}>统计 UTC {day.dateUTC} · 成功更新 {new Date(day.fetchedAt).toLocaleString()} · 缓存 {cacheAge(day.fetchedAt)}</Text> : null}
  </VStack>
}
export function WidgetView({ view, family, dates, history, displaySize }: { view: MonitorView; family: string; dates: string[]; history: DayData[]; displaySize?: DisplaySize }) {
  const day = displayedDay(view)
  const account = view.account
  const failure = view.failures[0]
  const workers = rankWorkers(day ? [day] : [])
  const large = family === "systemLarge"
  const small = family === "systemSmall"
  const q = quota(account, day?.requests ?? null)
  const layout = widgetLayout(family, displaySize, workers.length)
  return <VStack spacing={0} widgetBackground={palette.background} foregroundStyle={palette.primary} frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}>
  <VStack alignment="leading" spacing={layout.gap} padding={layout.inset}>
    <HStack spacing={4}>
      <Text font={12} fontWeight="semibold" lineLimit={1} minScaleFactor={0.8} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}>{account.displayName}</Text>
      <Spacer />
      {!small ? <Text font={9} foregroundStyle={palette.secondary}>Workers</Text> : null}
    </HStack>
    {small ? <CompactQuota account={account} day={day} small /> : large ? <LargeWidgetQuota account={account} day={day} /> : <HStack alignment="top" spacing={12}>
      <CompactQuota account={account} day={day} medium />
      <VStack alignment="leading" spacing={5} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}>
        <Text font={10} foregroundStyle={palette.secondary}>{day && day.dateUTC !== utcDate() ? "缓存日 Top 3" : "今日 Top 3"}</Text>
        <WorkerRank workers={workers} total={day?.requests ?? null} compact />
      </VStack>
    </HStack>}
    {large ? <VStack alignment="leading" spacing={6}>
      <RoundedRectangle cornerRadius={0} fill={palette.separator} frame={{ height: 1 }} />
      <HStack>
        <Text font={10} foregroundStyle={palette.secondary}>{day?.dateUTC === utcDate() ? "今日" : "缓存日"} Worker 排名</Text>
        <Spacer />
        <Text font={9} foregroundStyle={palette.secondary}>{workers.length > layout.rankLimit ? `Top ${layout.rankLimit} / ${workers.length}` : `${workers.length} 项`}</Text>
      </HStack>
      <WorkerRank workers={workers} total={day?.requests ?? null} compact limit={layout.rankLimit} />
      <RoundedRectangle cornerRadius={0} fill={palette.separator} frame={{ height: 1 }} />
      <HStack>
        <Text font={10} foregroundStyle={palette.secondary}>近 7 个 UTC 日 · 趋势</Text>
        <Spacer />
        <Text font={9} foregroundStyle={palette.secondary}>峰值 {compactNumber(history.length ? Math.max(...history.map(item => item.requests ?? 0)) : null)}</Text>
      </HStack>
      <TrendBars dates={dates} days={history} height={layout.chartHeight} />
    </VStack> : null}
    <Spacer frame={{ minHeight: 0 }} />
    <WidgetFooter day={day} failure={failure} level={q.level} showTime={large} missing={large ? dates.filter(date => !history.some(item => item.dateUTC === date && item.requests !== null)).length : 0} />
  </VStack>
  </VStack>
}
export function SetupWidget({ message }: { message: string }) {
  return <VStack spacing={0} widgetBackground={palette.background} foregroundStyle={palette.primary} frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}>
    <VStack alignment="leading" spacing={8} padding={14}>
      <Text font={13} fontWeight="semibold" lineLimit={1}>Workers 额度监控</Text>
      <Text font={11} foregroundStyle={palette.secondary} lineLimit={4} minScaleFactor={0.85}>{message}</Text>
      <Spacer frame={{ minHeight: 0 }} />
      <Text font={11} foregroundStyle={palette.accent}>打开脚本设置账号</Text>
    </VStack>
  </VStack>
}
