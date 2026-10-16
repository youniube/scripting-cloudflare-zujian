import { Button, Circle, DateLabel, HStack, Picker, ProgressView, RoundedRectangle, Section, Spacer, Text, useEffect, useState, VStack, Widget, ZStack } from "scripting"
import { AIDay, AIModel, aiQuota, formatNeurons, rankAIModels } from "./ai"
import { AccountConfig, cacheAge, DayData, failureFrom, formatNumber, fraction, nextReset, percent, Period, quota, rankWorkers, totalRequests, utcDate } from "./core"
import { cachedFusion, FusionView, loadFusion } from "./fusion"
import { BrandHeader, DailyChart, displayedDay, failureLabel, palette, QuotaRing, widgetTheme, WorkerDetail } from "./views"

const aiColor = { light: "#3F5F9B", dark: "#A3BBED" }
const aiFill = { light: "#6783BD", dark: "#809BD1" }
const panel = { style: widgetTheme.panel, shape: { type: "rect" as const, cornerRadius: 8 } }
function tone(level: string, ai = false) { return level === "critical" ? widgetTheme.critical : level === "warning" ? widgetTheme.warning : ai ? aiFill : widgetTheme.accent }
function aiDay(view: FusionView) { return view.ai.days.find(day => day.dateUTC === utcDate()) ?? view.ai.previousDay }
function dayLabel(day?: { dateUTC: string }, ai = false) { return day && day.dateUTC !== utcDate() ? `${day.dateUTC.slice(5)} 缓存 · ${ai ? "Neurons" : "请求"}` : ai ? "WORKERS AI · NEURONS" : "今日请求 · 估算" }
function aiCoverage(view: FusionView) { return view.ai.days.filter(day => day.neurons !== null).length }

export function fusionLayout(family: string, size?: { width: number; height: number }) {
  const small = family === "systemSmall", large = family === "systemLarge"
  const width = size?.width ?? (small ? 158 : 338), height = size?.height ?? (large ? 354 : 158)
  const compact = height < (large ? 345 : 155), inset = large && !compact ? 14 : 12
  const content = Math.max(100, width - inset * 2), columnGap = large ? 14 : 12
  return { inset, content, compact, gap: large ? 5 : compact ? 2 : 3,
    columnGap, left: large ? (content - columnGap) / 2 : small ? content : Math.floor((content - columnGap) * 0.46),
    ring: small ? 36 : large ? 35 : 33, numberGap: small ? 10 : large ? 7 : 8,
    chartHeight: compact ? 40 : 46 }
}
function AIRing({ used, size }: { used: number | null | undefined; size: number }) {
  const q = aiQuota(used), ratio = q.ratio === null ? null : Math.min(1, Math.max(0, q.ratio)), diameter = size - 5.5
  return <ZStack frame={{ width: size, height: size }}>
    <Circle stroke={{ shapeStyle: widgetTheme.track, strokeStyle: { lineWidth: 3.5, ...(ratio === null ? { dash: [2, 3] } : {}) } }} frame={{ width: diameter, height: diameter }} />
    {ratio !== null && ratio > 0 ? <Circle trim={{ from: 0, to: ratio }} stroke={{ shapeStyle: tone(q.level, true), strokeStyle: { lineWidth: 3.5, lineCap: ratio < 0.02 ? "butt" : "round" } }} rotationEffect={-90} frame={{ width: diameter, height: diameter }} /> : null}
    <VStack spacing={1}>
      <Text font={8} fontWeight="semibold" lineLimit={1} minScaleFactor={0.5}>{percent(q.ratio)}</Text>
      <Text font={6} foregroundStyle={widgetTheme.secondary}>{ratio === null ? "未取得" : "参考量"}</Text>
    </VStack>
  </ZStack>
}
/** 数字只占自己的固定列；圆环和间距始终有保留宽度。缩放仅发生在数字列内部。 */
function MetricNumber({ value, width, ring, gap, ai = false, day, account }: { value: string; width: number; ring: number; gap: number; ai?: boolean; day?: DayData | AIDay; account: AccountConfig }) {
  const numberWidth = Math.max(30, width - ring - gap)
  return <HStack spacing={gap} frame={{ width, height: 36 }}>
    <Text font={28} fontWeight="bold" fontDesign="rounded" monospacedDigit lineLimit={1} minScaleFactor={0.4} frame={{ width: numberWidth, alignment: "leading" }}>{value}</Text>
    {ai ? <AIRing used={(day as AIDay | undefined)?.neurons} size={ring} /> : <QuotaRing account={account} day={day as DayData | undefined} size={ring} />}
  </HStack>
}
function WorkersRemaining({ account, day, width }: { account: AccountConfig; day?: DayData; width: number }) {
  const q = quota(account, day?.requests ?? null)
  return <HStack spacing={4} frame={{ width }}>
    <Text font={8} foregroundStyle={widgetTheme.secondary} lineLimit={1} minScaleFactor={0.7}>{q.limit === null ? "套餐" : account.plan === "custom" ? "距日阈值" : "估算剩余"}</Text>
    <Text font={10} fontWeight="semibold" fontDesign="rounded" monospacedDigit lineLimit={1} minScaleFactor={0.5} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "trailing" }}>{q.limit === null ? account.plan === "paid" ? "Paid · 无日额度" : "未确认" : formatNumber(q.remaining)}</Text>
  </HStack>
}
function AIStrip({ day, small, compact }: { day?: AIDay; small: boolean; compact: boolean }) {
  const q = aiQuota(day?.neurons)
  const label = day && day.dateUTC !== utcDate() ? `${day.dateUTC.slice(5)} AI 缓存` : small ? "AI · N" : "WORKERS AI"
  return <VStack alignment="leading" spacing={3} padding={{ horizontal: 6, vertical: compact ? 4 : 5 }} background={panel}>
    <HStack spacing={4}>
      <Text font={small ? 7 : 7.5} fontWeight="semibold" foregroundStyle={aiColor} lineLimit={1} minScaleFactor={0.75}>{label}</Text>
      <Text font={small ? 10 : 11} fontWeight="bold" fontDesign="rounded" monospacedDigit lineLimit={1} minScaleFactor={0.5} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}>{formatNeurons(day?.neurons)}{small ? "" : " N"}</Text>
      <Text font={7.5} foregroundStyle={widgetTheme.secondary} lineLimit={1}>{percent(q.ratio)}</Text>
      {!small ? <Text font={7.5} foregroundStyle={widgetTheme.secondary} lineLimit={1} minScaleFactor={0.65}>参考余 {formatNeurons(q.remaining)} N</Text> : null}
    </HStack>
    <ProgressView value={Math.min(1, Math.max(0, q.ratio ?? 0))} total={1} progressViewStyle="linear" tint={tone(q.level, true)} frame={{ height: 3 }} />
  </VStack>
}
function Rankings({ items, total, ai = false }: { items: { name: string; value: number | null }[]; total: number | null; ai?: boolean }) {
  return <VStack alignment="leading" spacing={3}>
    {items.length ? items.slice(0, 3).map(item => <VStack key={item.name} alignment="leading" spacing={1}>
      <HStack spacing={4}>
        <Text font={9.5} lineLimit={1} minScaleFactor={0.6} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}>{item.name.replace(/^@cf\//, "")}</Text>
        <Text font={9} fontWeight="semibold" monospacedDigit lineLimit={1} minScaleFactor={0.5}>{ai ? formatNeurons(item.value) : formatNumber(item.value)}</Text>
      </HStack>
      <ProgressView value={item.value !== null && total !== null && total > 0 ? Math.min(1, Math.max(0, item.value / total)) : 0} total={1} progressViewStyle="linear" tint={ai ? aiFill : widgetTheme.accent} frame={{ height: 2 }} />
    </VStack>) : <Text font={8} foregroundStyle={widgetTheme.secondary} lineLimit={2}>{ai ? "暂无模型记录" : "暂无 Worker 记录"}</Text>}
  </VStack>
}
function MiniTrend({ dates, values, height, ai = false }: { dates: string[]; values: (number | null)[]; height: number; ai?: boolean }) {
  const maximum = Math.max(1, ...values.map(value => value ?? 0))
  return <HStack alignment="bottom" spacing={3}>
    {dates.map((date, i) => <VStack key={date} spacing={3} frame={{ minWidth: 0, maxWidth: "infinity" }}>
      <VStack spacing={0} frame={{ height, alignment: "bottom" }}>
        {values[i] === null ? <Text font={7} foregroundStyle={widgetTheme.secondary}>—</Text> : values[i] > 0 ? <RoundedRectangle cornerRadius={2} fill={ai ? aiFill : widgetTheme.accent} frame={{ width: 8, height: height * (values[i] as number) / maximum }} /> : null}
      </VStack>
      <Text font={6.5} foregroundStyle={widgetTheme.secondary} lineLimit={1}>{date.slice(5).replace("-", "/")}</Text>
    </VStack>)}
  </HStack>
}
function Footer({ view, day, ai, large }: { view: FusionView; day?: DayData; ai?: AIDay; large: boolean }) {
  const wq = quota(view.account, day?.requests ?? null), aq = aiQuota(ai?.neurons)
  const wf = view.workers.failures[0], af = view.ai.failures[0]
  const critical = [wq.level, aq.level].includes("critical"), warning = [wq.level, aq.level].includes("warning")
  const old = [day, ai].some(item => item && item.dateUTC !== utcDate())
  const status = wf ? "W · " + failureLabel(wf) : af ? "AI · " + failureLabel(af) : old ? "跨日缓存 · 待更新" : !day || day.requests === null ? "Workers 未取得" : ai?.neurons == null ? "AI Neurons 未取得" : day.warnings.length || ai.warnings.length ? "统计有缺口 · 估算" : critical ? "用量 ≥95% · 估算" : warning ? "用量 ≥80% · 估算" : "双用量 · 估算"
  const color = wf || af || old ? widgetTheme.warning : critical ? widgetTheme.critical : warning ? widgetTheme.warning : widgetTheme.secondary
  const stamps = [day, ai].filter((item): item is DayData | AIDay => !!item).map(item => item.fetchedAt).sort()
  const stamp = stamps[0]
  return <HStack spacing={3}>
    <Circle fill={color} frame={{ width: 3, height: 3 }} />
    <Text font={7.5} foregroundStyle={color} lineLimit={1} minScaleFactor={0.65} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}>{status}</Text>
    <Text font={7.5} foregroundStyle={widgetTheme.secondary} lineLimit={1} minScaleFactor={0.65}>{stamp ? (large ? `UTC ${stamp.slice(11, 16)} · ` : "") + cacheAge(stamp) : "请打开 App"}</Text>
  </HStack>
}
export function FusionWidgetView({ view, today, family, displaySize }: { view: FusionView; today?: FusionView; family: string; displaySize?: { width: number; height: number } }) {
  const current = today ?? view, account = view.account, day = displayedDay(current.workers), ai = aiDay(current)
  const wq = quota(account, day?.requests ?? null), aq = aiQuota(ai?.neurons)
  const small = family === "systemSmall", large = family === "systemLarge", layout = fusionLayout(family, displaySize)
  const workers = rankWorkers(day ? [day] : []).map(item => ({ name: item.name, value: item.requests })), models = rankAIModels(ai ? [ai] : []).map(item => ({ name: item.name, value: item.neurons }))
  const remainingLabel = wq.limit === null ? account.plan === "paid" ? "Paid · 无免费日额度" : "套餐未确认 · 仅统计用量" : `${account.plan === "custom" ? "日阈值" : "Free 日额度"} ${formatNumber(wq.limit)}`
  return <VStack spacing={0} widgetBackground={widgetTheme.background} foregroundStyle={widgetTheme.primary} frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}>
    <VStack alignment="leading" spacing={layout.gap} padding={layout.inset} frame={{ minWidth: 0, maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}>
      <BrandHeader account={account} small={small} />
      <HStack alignment="top" spacing={layout.columnGap}>
        <VStack alignment="leading" spacing={2} frame={{ width: layout.left }}>
          <Text font={large ? 8 : 9} fontWeight={large ? "semibold" : "regular"} foregroundStyle={widgetTheme.secondary} lineLimit={1} minScaleFactor={0.8}>{large ? dayLabel(day).replace("今日请求 · 估算", "WORKERS · 今日请求") : dayLabel(day)}</Text>
          <MetricNumber value={formatNumber(day?.requests)} width={layout.left} ring={layout.ring} gap={layout.numberGap} account={account} day={day} />
          <WorkersRemaining account={account} day={day} width={layout.left} />
          {large ? <Text font={7} foregroundStyle={widgetTheme.secondary} lineLimit={1} minScaleFactor={0.7}>{remainingLabel}</Text> : null}
        </VStack>
        {large ? <VStack alignment="leading" spacing={2} frame={{ width: layout.left }}>
          <Text font={8} fontWeight="semibold" foregroundStyle={aiColor} lineLimit={1} minScaleFactor={0.8}>{dayLabel(ai, true)}</Text>
          <MetricNumber value={formatNeurons(ai?.neurons)} width={layout.left} ring={layout.ring} gap={layout.numberGap} account={account} day={ai} ai />
          <Text font={9} fontWeight="semibold" lineLimit={1} minScaleFactor={0.6}>参考剩余 {formatNeurons(aq.remaining)} N</Text>
          <Text font={7} foregroundStyle={widgetTheme.secondary} lineLimit={1}>日免费量参考 10,000 N</Text>
        </VStack> : !small ? <VStack alignment="leading" spacing={3} frame={{ width: layout.content - layout.left - layout.columnGap }}>
          <Text font={8} fontWeight="semibold" foregroundStyle={widgetTheme.secondary}>{day && day.dateUTC !== utcDate() ? "缓存日" : "今日"} WORKER · TOP 3</Text>
          <Rankings items={workers} total={day?.requests ?? null} />
        </VStack> : null}
      </HStack>
      {!large ? <AIStrip day={ai} small={small} compact={layout.compact} /> : null}
      {large ? <HStack spacing={5} padding={5} background={panel}>
        <Text font={7.5} foregroundStyle={widgetTheme.secondary} lineLimit={1} minScaleFactor={0.7}>Workers 错误 {formatNumber(day?.errors)}</Text>
        <Text font={7.5} foregroundStyle={widgetTheme.secondary} lineLimit={1} minScaleFactor={0.7}>错误率 {day?.errors == null || day.requests === null ? "—" : fraction(day.errors, day.requests)}</Text>
        <Spacer /><Text font={7} foregroundStyle={widgetTheme.secondary}>UTC 重置</Text><DateLabel date={nextReset()} style="timer" font={7} fontDesign="monospaced" />
      </HStack> : null}
      {large ? <VStack alignment="leading" spacing={5} padding={6} background={panel}>
        <HStack spacing={3}><Text font={8} fontWeight="semibold" foregroundStyle={widgetTheme.secondary}>近 7 个 UTC 日 · 独立刻度</Text><Spacer /><Text font={7} foregroundStyle={widgetTheme.secondary}>W {view.workers.days.filter(item => item.requests !== null).length}/7 · AI {aiCoverage(view)}/7</Text></HStack>
        <HStack alignment="top" spacing={12}>
          {[false, true].map(isAI => <VStack key={String(isAI)} alignment="leading" spacing={4} frame={{ minWidth: 0, maxWidth: "infinity" }}>
            <Text font={7} fontWeight="semibold" foregroundStyle={isAI ? aiColor : widgetTheme.brand}>{isAI ? "AI · Neurons" : "Workers · 请求"}</Text>
            <MiniTrend dates={view.expectedDates} values={view.expectedDates.map(date => isAI ? view.ai.days.find(item => item.dateUTC === date)?.neurons ?? null : view.workers.days.find(item => item.dateUTC === date)?.requests ?? null)} height={layout.chartHeight} ai={isAI} />
          </VStack>)}
        </HStack>
      </VStack> : null}
      {large ? <HStack alignment="top" spacing={layout.columnGap}>
        <VStack alignment="leading" spacing={4} frame={{ width: layout.left }}>
          <Text font={8} fontWeight="semibold" foregroundStyle={widgetTheme.secondary}>{day && day.dateUTC !== utcDate() ? "缓存日" : "今日"} WORKER · TOP 3</Text>
          <Rankings items={workers} total={day?.requests ?? null} />
        </VStack>
        <VStack alignment="leading" spacing={4} frame={{ width: layout.left }}>
          <Text font={8} fontWeight="semibold" foregroundStyle={aiColor}>{ai && ai.dateUTC !== utcDate() ? "缓存日" : "今日"} 模型 · NEURONS</Text>
          <Rankings items={models} total={ai?.neurons ?? null} ai />
        </VStack>
      </HStack> : null}
      <Spacer frame={{ minHeight: 0 }} />
      <Footer view={current} day={day} ai={ai} large={large} />
    </VStack>
  </VStack>
}

function productStatus(view: FusionView["workers"] | FusionView["ai"]) {
  const state = view.refreshState
  return state?.kind === "cooldown" ? `冷却至 ${new Date(state.retryAt).toLocaleTimeString()}` : state?.kind === "busy" ? "已有查询，请稍后重试" : view.failures.length ? "刷新未完成，保留缓存" : view.fromCache ? "缓存有效" : "刷新完成"
}
export function FusionAnalytics({ account }: { account: AccountConfig }) {
  const [period, setPeriod] = useState<Period>("7d")
  const [view, setView] = useState<FusionView | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  async function refresh(force = false, verify = false, cancelled = () => false) {
    setBusy(true); setStatus("正在刷新 Workers + Workers AI…")
    try {
      const result = await loadFusion(account, period, { force, verify, cancelled,
        onUpdate: value => { if (!cancelled()) setView(value) },
        onProductProgress: (product, done, total) => { if (!cancelled()) setStatus(`正在刷新 ${product} · ${done} / ${total} 个 UTC 日`) },
      })
      if (cancelled()) return
      setView(result); setStatus(`Workers：${productStatus(result.workers)} · AI：${productStatus(result.ai)}`)
      if (!result.workers.fromCache || !result.ai.fromCache) Widget.reloadAll()
    } catch (error) { if (!cancelled()) setStatus(failureFrom(error).message) }
    finally { if (!cancelled()) setBusy(false) }
  }
  useEffect(() => {
    let cancelled = false
    setView(cachedFusion(account, period))
    void refresh(false, false, () => cancelled)
    return () => { cancelled = true }
  }, [account.id, account.revision, period])
  const current = view?.account.id === account.id && view.account.revision === account.revision && view.period === period ? view : cachedFusion(account, period)
  const today = cachedFusion(account, "today"), day = displayedDay(today.workers), ai = aiDay(today)
  const workers = rankWorkers(current.workers.days), models = rankAIModels(current.ai.days)
  const coveredW = current.workers.days.filter(item => item.requests !== null).length, coveredAI = aiCoverage(current)
  const wq = quota(account, day?.requests ?? null), aq = aiQuota(ai?.neurons)
  return <Section header={<Text>融合监控 · Workers + Workers AI</Text>} footer={<Text>两项独立计量。Analytics 为采样估算，可能延迟；Workers 额度依账号已确认套餐，AI 每日 10,000 Neurons 仅作免费量参考，UTC 00:00 重置。付费及独立计费模型可能继续计费，请以控制台为准。</Text>}>
    <Text font="caption" foregroundStyle={palette.secondary}>今日双用量 · UTC 自然日</Text>
    <HStack alignment="top" spacing={16}>
      <VStack alignment="leading" spacing={5} frame={{ minWidth: 0, maxWidth: "infinity" }}>
        <Text font="caption" foregroundStyle={palette.secondary}>{day && day.dateUTC !== utcDate() ? `${day.dateUTC.slice(5)} 缓存 · 请求` : "Workers · 今日请求"}</Text>
        <Text font={28} fontWeight="bold" fontDesign="rounded" lineLimit={1} minScaleFactor={0.5}>{formatNumber(day?.requests)}</Text>
        <ProgressView value={Math.min(1, wq.ratio ?? 0)} total={1} progressViewStyle="linear" tint={tone(wq.level)} />
        <Text font="caption">{wq.limit === null ? account.plan === "paid" ? "付费 · 无免费日额度" : "套餐未确认" : `估算剩余 ${formatNumber(wq.remaining)}`}</Text>
        <Text font="caption" foregroundStyle={palette.secondary}>{day ? `${day.dateUTC} · ${cacheAge(day.fetchedAt)}` : "未取得"}</Text>
      </VStack>
      <VStack alignment="leading" spacing={5} frame={{ minWidth: 0, maxWidth: "infinity" }}>
        <Text font="caption" foregroundStyle={aiColor}>{ai && ai.dateUTC !== utcDate() ? `${ai.dateUTC.slice(5)} AI 缓存 · Neurons` : "Workers AI · 今日 Neurons"}</Text>
        <Text font={28} fontWeight="bold" fontDesign="rounded" lineLimit={1} minScaleFactor={0.5}>{formatNeurons(ai?.neurons)}</Text>
        <ProgressView value={Math.min(1, aq.ratio ?? 0)} total={1} progressViewStyle="linear" tint={tone(aq.level, true)} />
        <Text font="caption">参考剩余 {formatNeurons(aq.remaining)} N</Text>
        <Text font="caption" foregroundStyle={palette.secondary}>{ai ? `${ai.dateUTC} · ${cacheAge(ai.fetchedAt)}` : "未取得"}</Text>
      </VStack>
    </HStack>
    {busy ? <ProgressView /> : null}
    <Text font="caption" foregroundStyle={palette.secondary}>{status || "手动刷新最短间隔 1 分钟；两项分别保留成功缓存。"}</Text>
    <HStack><Button title="刷新融合数据" systemImage="arrow.clockwise" buttonStyle="borderless" action={() => { if (!busy) return refresh(true) }} disabled={busy} /><Spacer /><Button title="验证两项 API" buttonStyle="borderless" action={() => { if (!busy) return refresh(false, true) }} disabled={busy} /></HStack>
    {[{ label: "Workers", data: current.workers }, { label: "Workers AI", data: current.ai }].flatMap(product => product.data.failures.map((failure, index) => <Text key={product.label + index} font="caption" foregroundStyle={palette.warning}>{product.label} · {failureLabel(failure)} · {failure.message}</Text>))}
    <Picker title="融合统计时段" value={period} pickerStyle="menu" onChanged={value => setPeriod(value as Period)} disabled={busy}>
      <Text tag="today">今日</Text><Text tag="yesterday">昨日</Text><Text tag="7d">7 天</Text><Text tag="30d">30 天</Text>
    </Picker>
    <Text font="headline">Workers · {coveredW ? formatNumber(totalRequests(current.workers.days)) : "—"} 请求</Text>
    <Text font="caption" foregroundStyle={palette.secondary}>已取得 {coveredW} / {current.expectedDates.length} 天 · 以下图表各用独立刻度</Text>
    {current.expectedDates.length > 1 ? <DailyChart dates={current.expectedDates} days={current.workers.days} /> : null}
    <Text font="headline">Workers AI · {coveredAI ? formatNeurons(current.ai.days.reduce((sum, item) => sum + (item.neurons ?? 0), 0)) : "—"} Neurons</Text>
    <Text font="caption" foregroundStyle={palette.secondary}>已取得 {coveredAI} / {current.expectedDates.length} 天 · 未取得日期不填零</Text>
    {current.expectedDates.length > 1 ? <DailyChart dates={current.expectedDates} days={current.ai.days.map(item => ({ ...item, requests: item.neurons, workers: [] }))} /> : null}
    {current.expectedDates.map(date => <HStack key={date}><Text font="caption">{date}</Text><Spacer /><Text font="caption" lineLimit={1} minScaleFactor={0.7}>W {formatNumber(current.workers.days.find(item => item.dateUTC === date)?.requests)} · AI {formatNeurons(current.ai.days.find(item => item.dateUTC === date)?.neurons)} N</Text></HStack>)}
    <Text font="headline">Worker 排名 · 所选时段</Text>
    {workers.length ? workers.map(worker => <WorkerDetail key={worker.name} worker={worker} total={totalRequests(current.workers.days)} />) : <Text font="caption" foregroundStyle={palette.secondary}>暂无 Worker 调用记录</Text>}
    <Text font="headline">AI 模型排名 · 所选时段 Neurons</Text>
    {models.length ? models.map((model: AIModel) => <VStack key={model.name} alignment="leading" spacing={4}><HStack><Text font="caption" lineLimit={2}>{model.name}</Text><Spacer /><Text font="caption" fontWeight="semibold">{formatNeurons(model.neurons)} N</Text></HStack><Text font="caption" foregroundStyle={palette.secondary}>推理 {formatNumber(model.requests)} · 输入 {formatNumber(model.inputTokens)} / 输出 {formatNumber(model.outputTokens)} Tokens</Text></VStack>) : <Text font="caption" foregroundStyle={palette.secondary}>暂无 AI 模型记录</Text>}
    {[...new Set([...current.workers.days, ...current.ai.days].flatMap(item => item.warnings))].map(warning => <Text key={warning} font="caption" foregroundStyle={palette.warning}>{warning}</Text>)}
    <Text font="caption" foregroundStyle={palette.secondary}>桌面融合版：Parameter 填 fusion；固定此账号用 fusion:{account.id}。小号、中号始终显示今日；大号使用两项近 7 日缓存。打开此页面可补齐历史，桌面每轮优先刷新今日。</Text>
  </Section>
}
