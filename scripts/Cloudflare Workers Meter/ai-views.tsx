import { BarChart, Button, Chart, Circle, DateLabel, HStack, Picker, ProgressView, Section, Spacer, Text, useEffect, useState, VStack, Widget, ZStack } from "scripting"
import { AI_DAILY_REFERENCE, AIDay, AIModel, AIView, aiQuota, cachedAIView, formatNeurons, loadAI, rankAIModels } from "./ai"
import { AccountConfig, cacheAge, failureFrom, formatNumber, fraction, nextReset, percent, Period, utcDate } from "./core"
import { BrandHeader, failureLabel, palette, TrendBars, widgetLayout, widgetTheme } from "./views"

const AI_NOTICE = "Analytics 采样估算可能延迟。10,000 Neurons 是每日免费量参考，UTC 00:00 重置；AI Gateway 预付费或独立计费模型可能采用不同口径。这里不是官方实时余额，付费计划超出免费量后可能继续计费。"
function tone(level: string) { return level === "critical" ? widgetTheme.critical : level === "warning" ? widgetTheme.warning : widgetTheme.accent }
function currentDay(view: AIView) { return view.days.find(day => day.dateUTC === utcDate()) ?? view.previousDay }
function title(day?: AIDay) { return day && day.dateUTC !== utcDate() ? `${day.dateUTC.slice(5)} 缓存 · Neurons` : "今日 Neurons · 估算" }
export function AIRing({ used, size }: { used: number | null | undefined; size: number }) {
  const q = aiQuota(used), ratio = q.ratio === null ? null : Math.min(1, Math.max(0, q.ratio))
  const line = size < 45 ? 3.5 : 5, diameter = size - line - 2
  return <ZStack frame={{ width: size, height: size }}>
    <Circle stroke={{ shapeStyle: widgetTheme.track, strokeStyle: { lineWidth: line, ...(ratio === null ? { dash: [2, 3] } : {}) } }} frame={{ width: diameter, height: diameter }} />
    {ratio !== null && ratio > 0 ? <Circle trim={{ from: 0, to: ratio }} stroke={{ shapeStyle: q.level === "normal" ? widgetTheme.ring : tone(q.level), strokeStyle: { lineWidth: line, lineCap: ratio < 0.02 ? "butt" : "round" } }} rotationEffect={-90} frame={{ width: diameter, height: diameter }} /> : null}
    <VStack spacing={1}>
      <Text font={size < 45 ? 8 : 13} fontWeight="semibold" fontDesign="rounded" lineLimit={1} minScaleFactor={0.65}>{percent(q.ratio)}</Text>
      <Text font={size < 45 ? 6 : 8} foregroundStyle={widgetTheme.secondary}>{q.ratio === null ? "未取得" : "参考量"}</Text>
    </VStack>
  </ZStack>
}
function AIModelBars({ models, total, limit = 3 }: { models: AIModel[]; total: number | null; limit?: number }) {
  return <VStack alignment="leading" spacing={3} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}>
    {models.length ? models.slice(0, limit).map(model => <VStack key={model.name} alignment="leading" spacing={3}>
      <HStack spacing={5}>
        <Text font={10} lineLimit={1} minScaleFactor={0.8} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}>{model.name.replace(/^@cf\//, "")}</Text>
        <Text font={9} fontWeight="semibold" monospacedDigit lineLimit={1}>{formatNeurons(model.neurons)}</Text>
      </HStack>
      <ProgressView value={model.neurons !== null && total !== null && total > 0 ? Math.min(1, model.neurons / total) : 0} total={1} progressViewStyle="linear" tint={widgetTheme.accent} frame={{ height: 3 }} />
    </VStack>) : <Text font={9} foregroundStyle={widgetTheme.secondary} lineLimit={2}>暂无模型调用记录</Text>}
  </VStack>
}
function AIFooter({ view, day, missing = 0, large = false }: { view: AIView; day?: AIDay; missing?: number; large?: boolean }) {
  const q = aiQuota(day?.neurons), failure = view.failures[0]
  const status = failureLabel(failure) || (day?.requests == null ? "暂无 AI 数据" : day.dateUTC !== utcDate() ? "跨日待更新" : day.neurons === null ? "Neurons 未提供" : day.warnings.length ? "统计有缺口" : q.level === "critical" ? "免费量 ≥95% · 估算" : q.level === "warning" ? "免费量 ≥80% · 估算" : "免费量参考 · 估算")
  return <HStack spacing={3}>
    <Text font={8} foregroundStyle={failure ? widgetTheme.warning : tone(q.level)} lineLimit={1} minScaleFactor={0.75}>{status}{missing ? ` · 缺 ${missing} 天` : ""}</Text>
    <Spacer />
    <Text font={8} foregroundStyle={widgetTheme.secondary} lineLimit={1} minScaleFactor={0.75}>{day ? (large ? `UTC ${day.fetchedAt.slice(11, 16)} · ` : "") + cacheAge(day.fetchedAt) : "请打开 App"}</Text>
  </HStack>
}
export function AIWidgetView({ view, family, dates, history, displaySize }: { view: AIView; family: string; dates: string[]; history: AIDay[]; displaySize?: { width: number; height: number } }) {
  const day = currentDay(view), models = rankAIModels(day ? [day] : []), q = aiQuota(day?.neurons)
  const small = family === "systemSmall", large = family === "systemLarge", layout = widgetLayout(family, displaySize, models.length)
  const missing = dates.filter(date => !history.some(item => item.dateUTC === date && item.neurons !== null)).length
  return <VStack spacing={0} widgetBackground={widgetTheme.background} foregroundStyle={widgetTheme.primary} frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}>
    <VStack alignment="leading" spacing={layout.gap} padding={layout.inset} frame={{ minWidth: 0, maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}>
      <BrandHeader account={view.account} small={small} badge="AI" />
      <HStack alignment="top" spacing={12}>
        <VStack alignment="leading" spacing={small ? 3 : 2} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}>
          <Text font={9} foregroundStyle={widgetTheme.secondary} lineLimit={1} minScaleFactor={0.8}>{title(day)}</Text>
          <Text font={large ? 30 : 28} fontWeight="bold" fontDesign="rounded" monospacedDigit lineLimit={1} minScaleFactor={0.5}>{formatNeurons(day?.neurons)}</Text>
          <HStack spacing={small ? 9 : 7} padding={{ top: layout.quotaTopPadding }}>
            {!large ? <AIRing used={day?.neurons} size={layout.ringSize} /> : null}
            <VStack alignment="leading" spacing={2} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}>
              <Text font={8} foregroundStyle={widgetTheme.secondary} lineLimit={1}>免费量参考剩余</Text>
              <Text font={small ? 14 : 12} fontWeight="semibold" fontDesign="rounded" lineLimit={1} minScaleFactor={0.65}>{small ? q.ratio !== null && q.ratio > 0 && q.ratio < 0.0005 ? "<100%" : percent(q.remaining === null ? null : q.remaining / q.limit) : formatNeurons(q.remaining)}</Text>
            </VStack>
          </HStack>
          {large ? <Text font={8} foregroundStyle={widgetTheme.secondary}>每日参考 10,000 · UTC</Text> : null}
        </VStack>
        {large ? <AIRing used={day?.neurons} size={layout.ringSize} /> : !small ? <VStack alignment="leading" spacing={5} frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}>
          <Text font={8} fontWeight="semibold" foregroundStyle={widgetTheme.secondary}>模型 TOP 3 · Neurons</Text>
          <AIModelBars models={models} total={day?.neurons ?? null} />
        </VStack> : null}
      </HStack>
      {large ? <HStack spacing={7} padding={5} background={{ style: widgetTheme.panel, shape: { type: "rect", cornerRadius: 7 } }}>
        <Text font={8} foregroundStyle={widgetTheme.secondary}>推理 {formatNumber(day?.requests)}</Text>
        <Text font={8} foregroundStyle={widgetTheme.secondary}>错误 {formatNumber(day?.errors)}</Text>
        <Spacer /><DateLabel date={nextReset()} style="timer" font={8} fontDesign="monospaced" />
      </HStack> : null}
      {large ? <VStack alignment="leading" spacing={4} padding={7} background={{ style: widgetTheme.panel, shape: { type: "rect", cornerRadius: 9 } }}>
        <Text font={9} fontWeight="semibold" foregroundStyle={widgetTheme.secondary}>近 7 个 UTC 日 · Neurons</Text>
        <TrendBars dates={dates} days={history.map(item => ({ dateUTC: item.dateUTC, requests: item.neurons }))} height={layout.chartHeight} />
      </VStack> : null}
      {large ? <VStack alignment="leading" spacing={4}>
        <Text font={9} fontWeight="semibold" foregroundStyle={widgetTheme.secondary}>今日模型 · Neurons 排名</Text>
        <AIModelBars models={models} total={day?.neurons ?? null} limit={layout.rankLimit} />
      </VStack> : null}
      <AIFooter view={view} day={day} missing={large ? missing : 0} large={large} />
    </VStack>
  </VStack>
}

export function AIAnalytics({ account }: { account: AccountConfig }) {
  const [period, setPeriod] = useState<Period>("today")
  const [view, setView] = useState<AIView | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  async function refresh(force = false, verify = false, cancelled = () => false) {
    setBusy(true); setStatus("正在刷新 Workers AI…")
    try {
      const result = await loadAI(account, period, { force, verify, onProgress: (done, total) => { if (!cancelled()) setStatus(`正在刷新 AI · ${done} / ${total} 个 UTC 日`) } })
      if (cancelled()) return
      setView(result)
      setStatus(result.refreshState?.kind === "cooldown" ? `刷新冷却中 · ${new Date(result.refreshState.retryAt).toLocaleTimeString()} 后重试`
        : result.refreshState?.kind === "busy" ? "已有查询正在进行，请稍后刷新" : result.failures.length ? "AI 刷新未完成，保留成功缓存" : `${result.fromCache ? "缓存有效" : "AI 刷新完成"} · ${result.days.length} / ${result.expectedDates.length} 天`)
      if (!result.fromCache) Widget.reloadAll()
    } catch (error) { if (!cancelled()) setStatus(failureFrom(error).message) }
    finally { if (!cancelled()) setBusy(false) }
  }
  useEffect(() => {
    let cancelled = false
    setView(cachedAIView(account, period))
    void refresh(false, false, () => cancelled)
    return () => { cancelled = true }
  }, [account.id, account.revision, period])
  const current = view?.account.id === account.id && view.account.revision === account.revision && view.period === period ? view : cachedAIView(account, period)
  const today = currentDay(cachedAIView(account, "today")), q = aiQuota(today?.neurons)
  const models = rankAIModels(current.days)
  const total = current.days.filter(day => day.neurons !== null).reduce((sum, day) => sum + (day.neurons ?? 0), 0)
  const covered = current.days.filter(day => day.neurons !== null).length
  return <Section header={<Text>Workers AI · Neurons</Text>} footer={<Text>{AI_NOTICE}</Text>}>
    <Text font="caption" foregroundStyle={palette.secondary}>{title(today)}</Text>
    <Text font={32} fontWeight="bold" fontDesign="rounded">{formatNeurons(today?.neurons)}</Text>
    <ProgressView value={Math.min(1, q.ratio ?? 0)} total={1} progressViewStyle="linear" tint={q.level === "critical" ? palette.critical : q.level === "warning" ? palette.warning : palette.accent} />
    <Text>免费量参考剩余 {formatNeurons(q.remaining)} / {formatNumber(AI_DAILY_REFERENCE)}</Text>
    <Text font="caption" foregroundStyle={palette.secondary}>推理 {formatNumber(today?.requests)} · 错误 {formatNumber(today?.errors)} · 错误率 {today?.errors == null || today.requests === null ? "—" : fraction(today.errors, today.requests)}</Text>
    <Text font="caption" foregroundStyle={palette.secondary}>输入 Tokens {formatNumber(today?.inputTokens)} · 输出 Tokens {formatNumber(today?.outputTokens)}</Text>
    {today ? <Text font="caption" foregroundStyle={palette.secondary}>UTC {today.dateUTC} · 更新 {new Date(today.fetchedAt).toLocaleString()} · 缓存 {cacheAge(today.fetchedAt)}</Text> : null}
    <HStack><Text font="caption">下次 UTC 重置</Text><Spacer /><DateLabel date={nextReset()} style="timer" font="caption" /></HStack>
    {busy ? <ProgressView /> : null}
    <Text font="caption" foregroundStyle={palette.secondary}>{status || "请选择时段并刷新"}</Text>
    <HStack>
      <Button title="刷新 AI" systemImage="arrow.clockwise" buttonStyle="borderless" action={() => refresh(true)} disabled={busy} />
      <Spacer /><Button title="验证 AI API" buttonStyle="borderless" action={() => refresh(false, true)} disabled={busy} />
    </HStack>
    {current.failures.map((failure, index) => <Text key={index} font="caption" foregroundStyle={palette.warning}>{failureLabel(failure)} · {failure.message}</Text>)}
    <Picker title="AI 统计时段" value={period} pickerStyle="menu" onChanged={value => setPeriod(value as Period)} disabled={busy}>
      <Text tag="today">今日</Text><Text tag="yesterday">昨日</Text><Text tag="7d">7 天</Text><Text tag="30d">30 天</Text>
    </Picker>
    <Text font="headline">已取得 {covered} / {current.expectedDates.length} 天 · {covered ? formatNeurons(total) : "—"} Neurons</Text>
    {current.expectedDates.length > 1 ? <Chart frame={{ height: 150 }} chartLegend="hidden" chartXScale={current.expectedDates.map(date => date.slice(5))} chartYAxis="automatic">
      <BarChart marks={current.days.filter(day => day.neurons !== null).map(day => ({ label: day.dateUTC.slice(5), value: day.neurons as number }))} foregroundStyle={palette.accent} />
    </Chart> : null}
    {current.expectedDates.map(date => <HStack key={date}><Text font="caption">{date}</Text><Spacer /><Text font="caption">{formatNeurons(current.days.find(day => day.dateUTC === date)?.neurons)} N</Text></HStack>)}
    <Text font="headline">模型排名 · Neurons</Text>
    {models.length ? models.map(model => <VStack key={model.name} alignment="leading" spacing={4}>
      <HStack><Text font="headline" lineLimit={2}>{model.name}</Text><Spacer /><Text font="headline">{formatNeurons(model.neurons)} N</Text></HStack>
      <Text font="caption" foregroundStyle={palette.secondary}>推理 {formatNumber(model.requests)} · 输入 {formatNumber(model.inputTokens)} / 输出 {formatNumber(model.outputTokens)} Tokens</Text>
    </VStack>) : <Text font="caption" foregroundStyle={palette.secondary}>暂无模型记录，可能没有调用或 Analytics 尚未聚合。</Text>}
    {[...new Set(current.days.flatMap(day => day.warnings))].map(warning => <Text key={warning} font="caption" foregroundStyle={palette.warning}>{warning}</Text>)}
    <Text font="caption" foregroundStyle={palette.secondary}>桌面显示 AI：编辑小组件，将 Parameter 填为 ai。固定此账号可用 ai:{account.id}。小号、中号始终显示今日；大号附有近 7 日趋势。</Text>
  </Section>
}
