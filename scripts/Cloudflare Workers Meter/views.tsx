import { Chart, BarChart, Circle, DateLabel, HStack, Image, ProgressView, RoundedRectangle, Spacer, Text, VStack, ZStack } from "scripting"
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

// Widget-only visual tokens; the in-app palette and account pages stay unchanged.
export const widgetTheme = {
  background: {
    light: { gradient: [{ color: "#FFFFFF", location: 0 }, { color: "#F8FAFD", location: 0.7 }, { color: "#FFF7F1", location: 1 }], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } },
    dark: { gradient: [{ color: "#172233", location: 0 }, { color: "#0D131D", location: 0.65 }, { color: "#161B24", location: 1 }], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } },
  },
  primary: { light: "#152235", dark: "#F5F7FB" },
  secondary: { light: "#536278", dark: "#A5B3C7" },
  brand: { light: "#A5470C", dark: "#FFAF70" },
  accent: { light: "#A94A0B", dark: "#FFA45A" },
  warning: { light: "#885400", dark: "#FFD176" },
  critical: { light: "#B3223A", dark: "#FF8D9F" },
  track: { light: "#E6EAF0", dark: "#2A3546" },
  panel: { light: "#EDF1F6", dark: "#1B2635" },
  separator: { light: "#DDE4ED", dark: "#2A3546" },
  ring: {
    light: { gradient: [{ color: "#BD510E", location: 0 }, { color: "#E78532", location: 1 }], startPoint: { x: 0, y: 1 }, endPoint: { x: 1, y: 0 } },
    dark: { gradient: [{ color: "#F58229", location: 0 }, { color: "#FFC48F", location: 1 }], startPoint: { x: 0, y: 1 }, endPoint: { x: 1, y: 0 } },
  },
}
type DisplaySize = { width: number; height: number }
export function widgetLayout(family: string, displaySize?: DisplaySize, workerCount = 3) {
  const small = family === "systemSmall", large = family === "systemLarge"
  const width = displaySize && Number.isFinite(displaySize.width) && displaySize.width > 0 ? displaySize.width : small ? 158 : 338
  const height = displaySize && Number.isFinite(displaySize.height) && displaySize.height > 0 ? displaySize.height : large ? 354 : 158
  const inset = small || !large && height < 160 ? 12 : large && width >= 340 ? 16 : 14
  // Fixed visual sections reserve 204pt; a Worker row plus its gap reserves 22pt.
  const available = height - inset * 2 - 204
  const rankLimit = large ? Math.max(1, Math.min(4, Math.floor((available - 30) / 22))) : 3
  const rows = Math.max(1, Math.min(workerCount, rankLimit))
  return {
    inset, gap: small ? 3 : large ? 5 : 6, rankLimit,
    chartHeight: large ? Math.max(28, Math.min(112, available - rows * 22)) : 0,
    ringSize: small ? height < 155 ? 38 : 42 : large ? 64 : 36,
  }
}
export function widgetQuotaColor(account: AccountConfig, day?: DayData) {
  const level = quota(account, day?.requests ?? null).level
  return level === "critical" ? widgetTheme.critical : level === "warning" ? widgetTheme.warning : widgetTheme.accent
}
function planBadge(account: AccountConfig) {
  return account.plan === "paid" ? "PAID" : quota(account, null).limit === null ? "未确认" : account.plan === "custom" ? "阈值" : "FREE"
}
function BrandHeader({ account, small = false }: { account?: AccountConfig; small?: boolean }) {
  return <HStack spacing={4}>
    <Image systemName="cloud.fill" font={12} foregroundStyle={widgetTheme.brand} frame={{ width: 15, height: 13 }} />
    <Text font={8} fontWeight="bold" kerning={0.7} foregroundStyle={widgetTheme.brand}>CLOUDFLARE</Text>
    {account ? <Text font={small ? 7.5 : 9} foregroundStyle={widgetTheme.secondary} lineLimit={1} minScaleFactor={0.8} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "trailing" }}>{account.displayName}</Text> : <Spacer />}
    {account && !small ? <Text font={7} fontWeight="semibold" fontDesign="monospaced" foregroundStyle={widgetTheme.secondary} padding={{ horizontal: 4, vertical: 2 }} background={{ style: widgetTheme.panel, shape: { type: "rect", cornerRadius: 4 } }}>{planBadge(account)}</Text> : null}
  </HStack>
}
/** Native vector ring. No minimum arc or invented percent for missing/Paid data. */
export function QuotaRing({ account, day, size = 64 }: { account: AccountConfig; day?: DayData; size?: number }) {
  const q = quota(account, day?.requests ?? null)
  const ratio = q.ratio === null ? null : Math.max(0, Math.min(1, q.ratio))
  const line = size < 45 ? 3.5 : 5
  const diameter = size - line - 2
  const label = q.limit === null ? account.plan === "paid" ? "Paid" : "—" : percent(q.ratio)
  return <ZStack frame={{ width: size, height: size }}>
    <Circle stroke={{ shapeStyle: widgetTheme.track, strokeStyle: { lineWidth: line, ...(ratio === null ? { dash: [2, 3] } : {}) } }} frame={{ width: diameter, height: diameter }} />
    {ratio !== null && ratio > 0 ? <Circle
      trim={{ from: 0, to: ratio }}
      stroke={{ shapeStyle: q.level === "normal" ? widgetTheme.ring : widgetQuotaColor(account, day), strokeStyle: { lineWidth: line, lineCap: ratio < 0.02 ? "butt" : "round" } }}
      rotationEffect={-90} frame={{ width: diameter, height: diameter }}
    /> : null}
    <VStack spacing={1}>
      <Text font={size < 45 ? 8 : 13} fontWeight="semibold" fontDesign="rounded" lineLimit={1} minScaleFactor={0.65}>{label}</Text>
      <Text font={size < 45 ? 6 : 8} foregroundStyle={widgetTheme.secondary}>{q.limit === null ? "无日额度" : q.ratio === null ? "未取得" : "已用"}</Text>
    </VStack>
  </ZStack>
}
function remainingPercent(account: AccountConfig, day?: DayData): string {
  const q = quota(account, day?.requests ?? null)
  if (q.remaining === null || q.limit === null) return "—"
  const ratio = q.remaining / q.limit
  // 2/100,000 requests must not round the remaining percentage back to 100%.
  if (q.ratio !== null && q.ratio > 0 && ratio > 0.999) {
    const value = (ratio * 100).toFixed(3)
    return Number(value) >= 100 ? "<100%" : value + "%"
  }
  return percent(ratio)
}
function WidgetRemaining({ account, day }: { account: AccountConfig; day?: DayData }) {
  const q = quota(account, day?.requests ?? null)
  return <VStack alignment="leading" spacing={1} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}>
    <Text font={8} foregroundStyle={widgetTheme.secondary} lineLimit={1}>{q.limit !== null ? account.plan === "custom" ? "距日阈值 · 估算" : "估算剩余" : account.plan === "paid" ? "付费计划" : "日额度未确认"}</Text>
    <Text font={12} fontWeight="semibold" fontDesign="rounded" lineLimit={1} minScaleFactor={0.65}>{q.limit !== null ? formatNumber(q.remaining) : account.plan === "paid" ? "无免费日额度" : "仅统计用量"}</Text>
  </VStack>
}
export function WorkerBars({ workers, total, limit = 3, precise = false }: { workers: WorkerMetric[]; total: number | null; limit?: number; precise?: boolean }) {
  return <VStack alignment="leading" spacing={3} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}>
    {workers.length ? workers.slice(0, limit).map(worker => {
      const share = total !== null && total > 0 ? Math.max(0, Math.min(1, worker.requests / total)) : null
      return <VStack key={worker.name} alignment="leading" spacing={3}>
        <HStack spacing={5}>
          <Text font={10.5} lineLimit={1} minScaleFactor={0.85} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}>{worker.name || "未命名 Worker"}</Text>
          <Text font={10} fontWeight="semibold" fontDesign="monospaced" monospacedDigit lineLimit={1}>{precise ? formatNumber(worker.requests) : compactNumber(worker.requests)}</Text>
        </HStack>
        {share === null ? <RoundedRectangle cornerRadius={2} fill={widgetTheme.track} frame={{ height: 3 }} /> : <ProgressView value={share} total={1} progressViewStyle="linear" tint={widgetTheme.accent} frame={{ height: 3 }} />}
      </VStack>
    }) : <Text font={9} foregroundStyle={widgetTheme.secondary} lineLimit={2}>暂无 Worker 调用记录</Text>}
  </VStack>
}
export function WidgetFooter({ day, failure, missing = 0, showTime = false, level = "unknown" }: { day?: DayData; failure?: Failure; missing?: number; showTime?: boolean; level?: string }) {
  const status = failureLabel(failure) || (!day || day.requests === null ? "暂无数据" : day.dateUTC !== utcDate() ? "跨日待更新" : day.warnings.length ? "统计有缺口" : level === "critical" ? "额度 ≥95%" : level === "warning" ? "额度 ≥80%" : level === "normal" ? "额度充足 · 估算" : "Analytics 估算")
  const tone = failure || level === "warning" ? widgetTheme.warning : level === "critical" ? widgetTheme.critical : widgetTheme.secondary
  return <HStack spacing={3}>
    <Circle fill={tone} frame={{ width: 3, height: 3 }} />
    <Text font={8.5} foregroundStyle={tone} lineLimit={1} minScaleFactor={0.75}>{status}{missing ? ` · 缺 ${missing} 天` : ""}</Text>
    <Spacer />
    <Text font={8.5} foregroundStyle={widgetTheme.secondary} lineLimit={1} minScaleFactor={0.75}>{day ? (showTime ? `UTC ${day.fetchedAt.slice(11, 16)} · ` : "") + cacheAge(day.fetchedAt) : "请打开 App"}</Text>
  </HStack>
}
/** Seven real UTC days. Missing values have no bar; zero never gets a fake minimum height. */
export function TrendBars({ dates, days, height = 38 }: { dates: string[]; days: DayData[]; height?: number }) {
  const maximum = Math.max(1, ...days.filter(day => dates.includes(day.dateUTC)).map(day => day.requests ?? 0))
  const plotHeight = Math.max(1, height - 13)
  return <HStack alignment="bottom" spacing={5}>
    {dates.map(date => {
      const value = days.find(day => day.dateUTC === date)?.requests ?? null
      return <VStack key={date} spacing={3} frame={{ minWidth: 0, maxWidth: "infinity" }}>
        <VStack spacing={3} frame={{ height, alignment: "bottom" }}>
          <Text font={7} foregroundStyle={widgetTheme.secondary} lineLimit={1} minScaleFactor={0.8}>{value === null ? "—" : compactNumber(value)}</Text>
          {value !== null && value > 0 ? <RoundedRectangle cornerRadius={3} fill={date === utcDate() ? widgetTheme.ring : widgetTheme.accent} frame={{ width: 13, height: plotHeight * value / maximum }} /> : null}
        </VStack>
        <Text font={7} foregroundStyle={widgetTheme.secondary} lineLimit={1}>{date.slice(5).replace("-", "/")}</Text>
      </VStack>
    })}
  </HStack>
}
function WidgetHealth({ account, day }: { account: AccountConfig; day?: DayData }) {
  const q = quota(account, day?.requests ?? null)
  const errorRate = day?.errors != null && day.requests !== null ? fraction(day.errors, day.requests) : "—"
  return <HStack spacing={5}>
    <HStack spacing={4} padding={5} background={{ style: widgetTheme.panel, shape: { type: "rect", cornerRadius: 7 } }} frame={{ maxWidth: "infinity" }}>
      <Text font={8} foregroundStyle={widgetTheme.secondary}>错误</Text><Spacer />
      <Text font={10} fontWeight="semibold" monospacedDigit>{formatNumber(day?.errors)}</Text>
    </HStack>
    <HStack spacing={4} padding={5} background={{ style: widgetTheme.panel, shape: { type: "rect", cornerRadius: 7 } }} frame={{ maxWidth: "infinity" }}>
      <Text font={8} foregroundStyle={widgetTheme.secondary}>错误率</Text><Spacer />
      <Text font={10} fontWeight="semibold" monospacedDigit>{errorRate}</Text>
    </HStack>
    <HStack spacing={3} padding={5} background={{ style: widgetTheme.panel, shape: { type: "rect", cornerRadius: 7 } }} frame={{ maxWidth: "infinity" }}>
      {q.limit !== null ? <Text font={8} foregroundStyle={widgetTheme.secondary}>重置</Text> : null}
      {q.limit !== null ? <DateLabel date={nextReset()} style="timer" font={8} fontDesign="monospaced" /> : <Text font={9} foregroundStyle={widgetTheme.secondary}>{planBadge(account)}</Text>}
    </HStack>
  </HStack>
}
export function WidgetView({ view, family, dates, history, displaySize }: { view: MonitorView; family: string; dates: string[]; history: DayData[]; displaySize?: DisplaySize }) {
  const account = view.account, day = displayedDay(view), failure = view.failures[0]
  const workers = rankWorkers(day ? [day] : []), q = quota(account, day?.requests ?? null)
  const small = family === "systemSmall", large = family === "systemLarge"
  const layout = widgetLayout(family, displaySize, workers.length)
  const missing = dates.filter(date => !history.some(item => item.dateUTC === date && item.requests !== null)).length
  const knownHistory = history.filter(item => dates.includes(item.dateUTC) && item.requests !== null)
  const peak = knownHistory.length ? Math.max(...knownHistory.map(item => item.requests as number)) : null
  return <VStack spacing={0} widgetBackground={widgetTheme.background} foregroundStyle={widgetTheme.primary} frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}>
    <VStack alignment="leading" spacing={layout.gap} padding={layout.inset} frame={{ minWidth: 0, maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}>
      <BrandHeader account={account} small={small} />
      {small ? <VStack alignment="leading" spacing={3}>
        <Text font={9} foregroundStyle={widgetTheme.secondary} lineLimit={1} minScaleFactor={0.75}>{dayTitle(day).replace("今日调用", "今日请求")}</Text>
        <Text font={28} fontWeight="bold" fontDesign="rounded" monospacedDigit lineLimit={1} minScaleFactor={0.5}>{formatNumber(day?.requests)}</Text>
        <HStack spacing={9}>
          <QuotaRing account={account} day={day} size={layout.ringSize} />
          <VStack alignment="leading" spacing={2} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}>
            <Text font={8} foregroundStyle={widgetTheme.secondary}>{q.limit !== null ? "估算剩余" : account.plan === "paid" ? "付费计划" : "额度未确认"}</Text>
            <Text font={14} fontWeight="semibold" fontDesign="rounded" lineLimit={1} minScaleFactor={0.6}>{q.limit !== null ? remainingPercent(account, day) : "—"}</Text>
          </VStack>
        </HStack>
      </VStack> : large ? <HStack spacing={12}>
        <VStack alignment="leading" spacing={2} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}>
          <Text font={9} foregroundStyle={widgetTheme.secondary}>{dayTitle(day).replace("今日调用", "今日请求")}</Text>
          <Text font={30} fontWeight="bold" fontDesign="rounded" monospacedDigit lineLimit={1} minScaleFactor={0.5}>{formatNumber(day?.requests)}</Text>
          <HStack spacing={5}>
            <Text font={9} foregroundStyle={widgetTheme.secondary}>{q.limit !== null ? account.plan === "custom" ? "距阈值" : "估算剩余" : "套餐"}</Text>
            <Text font={12} fontWeight="semibold" fontDesign="rounded" lineLimit={1} minScaleFactor={0.65}>{q.limit !== null ? formatNumber(q.remaining) : account.plan === "paid" ? "付费 · 无免费日额度" : "未确认"}</Text>
          </HStack>
          {q.limit !== null ? <Text font={8} foregroundStyle={widgetTheme.secondary}>{account.plan === "custom" ? "日阈值 " : "Free 日额度 "}{formatNumber(q.limit)} · UTC</Text> : null}
        </VStack>
        <QuotaRing account={account} day={day} size={layout.ringSize} />
      </HStack> : <HStack alignment="top" spacing={12}>
        <VStack alignment="leading" spacing={2} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}>
          <Text font={9} foregroundStyle={widgetTheme.secondary} lineLimit={1}>{dayTitle(day).replace("今日调用", "今日请求")}</Text>
          <Text font={28} fontWeight="bold" fontDesign="rounded" monospacedDigit lineLimit={1} minScaleFactor={0.5}>{formatNumber(day?.requests)}</Text>
          <HStack spacing={7}>
            <QuotaRing account={account} day={day} size={layout.ringSize} />
            <WidgetRemaining account={account} day={day} />
          </HStack>
        </VStack>
        <VStack alignment="leading" spacing={5} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}>
          <Text font={8} fontWeight="semibold" kerning={0.6} foregroundStyle={widgetTheme.secondary}>{day && day.dateUTC !== utcDate() ? "缓存日 Top 3" : "今日 TOP 3"}</Text>
          <WorkerBars workers={workers} total={day?.requests ?? null} />
        </VStack>
      </HStack>}
      {large ? <WidgetHealth account={account} day={day} /> : null}
      {large ? <VStack alignment="leading" spacing={4} padding={7} background={{ style: widgetTheme.panel, shape: { type: "rect", cornerRadius: 9 } }}>
        <HStack>
          <Text font={9} fontWeight="semibold" foregroundStyle={widgetTheme.secondary}>近 7 个 UTC 日 · 趋势</Text>
          <Spacer />
          <Text font={8} foregroundStyle={widgetTheme.secondary}>峰值 {compactNumber(peak)}</Text>
        </HStack>
        <TrendBars dates={dates} days={history} height={layout.chartHeight} />
      </VStack> : null}
      {large ? <VStack alignment="leading" spacing={4}>
        <HStack>
          <Text font={9} fontWeight="semibold" foregroundStyle={widgetTheme.secondary}>{day && day.dateUTC !== utcDate() ? "缓存日" : "今日"} Worker 排名</Text>
          <Spacer />
          <Text font={8} foregroundStyle={widgetTheme.secondary}>{workers.length > layout.rankLimit ? `Top ${layout.rankLimit} / ${workers.length}` : `${workers.length} 项`}</Text>
        </HStack>
        <WorkerBars workers={workers} total={day?.requests ?? null} limit={layout.rankLimit} precise />
      </VStack> : null}
      <WidgetFooter day={day} failure={failure} level={q.level} showTime={large} missing={large ? missing : 0} />
    </VStack>
  </VStack>
}
export function SetupWidget({ message }: { message: string }) {
  return <VStack spacing={0} widgetBackground={widgetTheme.background} foregroundStyle={widgetTheme.primary} frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}>
    <VStack alignment="leading" spacing={8} padding={12} frame={{ minWidth: 0, maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}>
      <BrandHeader small />
      <Text font={14} fontWeight="semibold">Workers 额度监控</Text>
      <Text font={10} foregroundStyle={widgetTheme.secondary} lineLimit={3} minScaleFactor={0.8}>{message}</Text>
      <Spacer frame={{ minHeight: 0 }} />
      <Text font={10} foregroundStyle={widgetTheme.brand}>打开脚本设置账号</Text>
    </VStack>
  </VStack>
}
