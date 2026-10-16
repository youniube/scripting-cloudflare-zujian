/** Workers AI 的统计、缓存和查询；与 Workers 请求额度完全分开。 */
import { CloudflareClient, count, field, object, rows, TYPE_BODY, TypeInfo, typeName } from "./api"
import { AccountConfig, DAY_MS, Failure, failureFrom, MonitorError, MonitorView, Period, periodDates, utcDate, utcStart } from "./core"
import { acquireLease, isCurrentAccount, readToken, releaseLease, resolveWidgetAccount } from "./storage"
import { LoadOptions } from "./service"

export const AI_DAILY_REFERENCE = 10_000
export interface AIModel {
  name: string
  requests: number
  neurons: number | null
  inputTokens: number | null
  outputTokens: number | null
}
export interface AIDay {
  version: 1
  dateUTC: string
  fetchedAt: string
  queriedFrom: string
  queriedTo: string
  requests: number | null
  neurons: number | null
  inputTokens: number | null
  outputTokens: number | null
  errors: number | null
  models: AIModel[]
  warnings: string[]
}
export interface AICapabilities {
  checkedAt: string
  maxPageSize: number
  maxDuration: number
  notOlderThan: number
  neurons: boolean
  inputTokens: boolean
  outputTokens: boolean
  errors: boolean
}
export interface AIView extends Omit<MonitorView, "days" | "previousDay"> { days: AIDay[]; previousDay?: AIDay }
const DATASET = "aiInferenceAdaptiveGroups"
const inFlight = new Map<string, Promise<AIView>>()
function key(id: string, suffix: string) { return "cf-workers-meter.v1.account." + id + ".ai." + suffix }
function store<T>(account: AccountConfig, suffix: string, value: T) {
  if (!isCurrentAccount(account)) throw new MonitorError("configuration", "账号配置已变化，本次 AI 结果未写入。")
  if (!Storage.set(key(account.id, suffix), value)) throw new MonitorError("storage", "AI 统计缓存写入失败，已保留旧数据。")
}
export function readAIDay(id: string, date: string): AIDay | undefined {
  const data = Storage.get<AIDay>(key(id, "day." + date))
  return data?.version === 1 && data.dateUTC === date && Array.isArray(data.models) && Number.isFinite(Date.parse(data.fetchedAt)) ? data : undefined
}
export function writeAIDay(account: AccountConfig, day: AIDay) {
  store(account, "day." + day.dateUTC, day)
  const names = Storage.keys().filter(name => name.startsWith(key(account.id, "day."))).sort().reverse()
  for (const name of names.slice(40)) Storage.remove(name)
}
export function cachedAIView(account: AccountConfig, period: Period, now = Date.now()): AIView {
  const expectedDates = periodDates(period, now)
  const days = expectedDates.map(date => readAIDay(account.id, date)).filter((day): day is AIDay => !!day)
  const failure = Storage.get<Failure>(key(account.id, "failure"))
  const prefix = key(account.id, "day.")
  const previousDay = period === "today" && !days.length
    ? Storage.keys().filter(name => name.startsWith(prefix) && name.slice(prefix.length) < utcDate(now)).sort().reverse()
      .map(name => readAIDay(account.id, name.slice(prefix.length))).find(day => !!day)
    : undefined
  return { account, period, expectedDates, days, missingDates: expectedDates.filter(date => !days.some(day => day.dateUTC === date)), failures: failure ? [failure] : [], fromCache: true, previousDay }
}
export function aiQuota(used: number | null | undefined) {
  const ratio = used == null ? null : used / AI_DAILY_REFERENCE
  return { limit: AI_DAILY_REFERENCE, ratio, remaining: used == null ? null : Math.max(0, AI_DAILY_REFERENCE - used),
    level: ratio === null ? "unknown" : ratio >= 0.95 ? "critical" : ratio >= 0.8 ? "warning" : "normal" }
}
export function formatNeurons(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  if (value > 0 && value < 0.001) return "<0.001"
  const [whole, fraction = ""] = value.toFixed(3).split(".")
  const decimal = fraction.replace(/0+$/, "")
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (decimal ? "." + decimal : "")
}
export function rankAIModels(days: Pick<AIDay, "models">[]): AIModel[] {
  const metrics = new Map<string, AIModel>()
  for (const day of days) for (const model of day.models) {
    const current = metrics.get(model.name)
    if (!current) metrics.set(model.name, { ...model })
    else {
      current.requests += model.requests
      for (const metric of ["neurons", "inputTokens", "outputTokens"] as const) {
        current[metric] = current[metric] === null || model[metric] === null ? null : current[metric] + model[metric]
      }
    }
  }
  return [...metrics.values()].sort((a, b) => (b.neurons ?? -1) - (a.neurons ?? -1) || b.requests - a.requests || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}
/** 参数 ai / ai:账号标识 显示 AI；既有账号参数继续表示 Workers。 */
export function resolveWidgetTarget(parameter: string | null | undefined) {
  let value = parameter?.trim() ?? ""
  // 官方 Widget.preview 的 options 使用 JSON 序列化的参数值。
  if (value.startsWith('"')) {
    try { const parsed: unknown = JSON.parse(value); if (typeof parsed === "string") value = parsed.trim() } catch { /* 交给账号参数校验。 */ }
  }
  const ai = value === "ai" || value.startsWith("ai:")
  return { kind: ai ? "ai" as const : "workers" as const, account: resolveWidgetAccount(ai ? value === "ai" ? "" : value.slice(3) : value) }
}

/** 字段、分页、UTC 边界、可用权限均按账号实时 Schema/Settings 验证。 */
export async function discoverAICapabilities(client: CloudflareClient): Promise<AICapabilities> {
  const root = await client.graphql(`{ __schema { queryType { ${TYPE_BODY} } } }`)
  const viewerName = typeName(field(object(object(root.__schema).queryType) as TypeInfo, "viewer").type)
  const viewer = await client.graphql(`{ t: __type(name: ${JSON.stringify(viewerName)}) { ${TYPE_BODY} } }`)
  const accountName = typeName(field(viewer.t as TypeInfo, "accounts").type)
  const account = await client.graphql(`{ t: __type(name: ${JSON.stringify(accountName)}) { ${TYPE_BODY} } }`)
  const dataset = (account.t as TypeInfo).fields?.find(item => item.name === DATASET)
  if (!dataset) throw new MonitorError("schema", "该账号 Schema 未提供 Workers AI Analytics；原有 Workers 监控仍可使用。")
  const filterName = typeName(dataset.args.find(item => item.name === "filter")?.type)
  const orderName = typeName(dataset.args.find(item => item.name === "orderBy")?.type)
  const definitions = await client.graphql(`{
    filter: __type(name: ${JSON.stringify(filterName)}) { ${TYPE_BODY} }
    order: __type(name: ${JSON.stringify(orderName)}) { ${TYPE_BODY} }
    row: __type(name: ${JSON.stringify(typeName(dataset.type))}) { ${TYPE_BODY} }
    ${client.accountSelection(`settings { ${DATASET} { enabled maxPageSize maxDuration notOlderThan availableFields } }`)}
  }`)
  const inputs = (definitions.filter as TypeInfo).inputFields ?? []
  for (const name of ["datetime_geq", "datetime_lt", "modelId_gt"]) {
    if (!inputs.some(item => item.name === name)) throw new MonitorError("schema", `AI Schema 未提供 ${name}，不能保证 UTC 边界或完整分页。`)
  }
  if (!(definitions.order as TypeInfo).enumValues?.some(item => item.name === "modelId_ASC")) throw new MonitorError("schema", "AI Schema 未提供模型分页排序，已停止查询，避免遗漏。")
  field(definitions.row as TypeInfo, "count")
  const sumName = typeName(field(definitions.row as TypeInfo, "sum").type)
  const dimensionsName = typeName(field(definitions.row as TypeInfo, "dimensions").type)
  const details = await client.graphql(`{
    sums: __type(name: ${JSON.stringify(sumName)}) { ${TYPE_BODY} }
    dimensions: __type(name: ${JSON.stringify(dimensionsName)}) { ${TYPE_BODY} }
  }`)
  field(details.dimensions as TypeInfo, "modelId")
  const settings = object(object(client.accountResult(definitions).settings)[DATASET])
  if (settings.enabled !== true) throw new MonitorError("permission", "该账号未开放 Workers AI Analytics。请检查 Account Analytics → Read 和账号资源范围。")
  const available = rows(settings.availableFields)
  for (const name of ["count", "dimensions_modelId"]) {
    if (!available.includes(name)) throw new MonitorError("permission", `该账号未开放 AI 统计字段 ${name}。`)
  }
  const has = (name: string) => !!(details.sums as TypeInfo).fields?.some(item => item.name === name) && available.includes("sum_" + name)
  const maxPageSize = Math.floor(count(settings.maxPageSize)), maxDuration = count(settings.maxDuration), notOlderThan = count(settings.notOlderThan)
  if (maxPageSize < 1 || maxDuration < 1 || notOlderThan < 1) throw new MonitorError("schema", "AI 查询限制无效。")
  return { checkedAt: new Date().toISOString(), maxPageSize: Math.min(500, maxPageSize), maxDuration, notOlderThan,
    neurons: has("totalNeurons"), inputTokens: has("totalInputTokens"), outputTokens: has("totalOutputTokens"),
    errors: inputs.some(item => item.name === "errorCode_neq") }
}

function sumsSelection(caps: AICapabilities) {
  const fields = [caps.neurons ? "totalNeurons" : "", caps.inputTokens ? "totalInputTokens" : "", caps.outputTokens ? "totalOutputTokens" : ""].filter(Boolean)
  return fields.length ? `sum { ${fields.join(" ")} }` : ""
}
function metrics(value: unknown, caps: AICapabilities) {
  const row = object(value), sum = row.sum == null ? {} : object(row.sum)
  return { requests: count(row.count), neurons: caps.neurons ? count(sum.totalNeurons) : null,
    inputTokens: caps.inputTokens ? count(sum.totalInputTokens) : null, outputTokens: caps.outputTokens ? count(sum.totalOutputTokens) : null }
}
async function fetchAISlice(client: CloudflareClient, caps: AICapabilities, start: number, end: number) {
  const filter = `datetime_geq: ${JSON.stringify(new Date(start).toISOString())}, datetime_lt: ${JSON.stringify(new Date(end).toISOString())}`
  let after: string | undefined
  let total: ReturnType<typeof metrics> | undefined
  let errors: number | null = null
  const models: AIModel[] = []
  const seen = new Set<string>()
  do {
    const body = `${after === undefined ? `total: ${DATASET}(limit: 1, filter: { ${filter} }) { count ${sumsSelection(caps)} }
      ${caps.errors ? `errors: ${DATASET}(limit: 1, filter: { ${filter}, errorCode_neq: 0 }) { count }` : ""}` : ""}
      models: ${DATASET}(limit: ${caps.maxPageSize}, orderBy: [modelId_ASC], filter: { ${filter}${after !== undefined ? `, modelId_gt: ${JSON.stringify(after)}` : ""} }) {
        count ${sumsSelection(caps)} dimensions { modelId }
      }`
    const account = client.accountResult(await client.graphql(`{ ${client.accountSelection(body)} }`))
    if (after === undefined) {
      const totals = rows(account.total)
      if (totals.length > 1) throw new MonitorError("incomplete", "AI 账户汇总返回多组，未覆盖缓存。")
      if (totals.length) total = metrics(totals[0], caps)
      if (caps.errors) {
        const errorRows = rows(account.errors)
        if (errorRows.length > 1) throw new MonitorError("incomplete", "AI 错误汇总返回多组，未覆盖缓存。")
        // 总查询有记录而错误分组为空，表示没有匹配 errorCode != 0 的记录。
        errors = errorRows.length ? count(object(errorRows[0]).count) : total ? 0 : null
      }
    }
    const page = rows(account.models)
    if (page.length > caps.maxPageSize) throw new MonitorError("incomplete", "AI 模型分页长度异常。")
    let cursor = after
    for (const item of page) {
      const name = object(object(item).dimensions).modelId
      if (typeof name !== "string" || seen.has(name) || (cursor !== undefined && name <= cursor)) throw new MonitorError("incomplete", "AI 模型名称或分页顺序异常，已保留旧缓存。")
      seen.add(name); cursor = name
      models.push({ name, ...metrics(item, caps) })
    }
    if (page.length < caps.maxPageSize) break
    after = cursor
  } while (true)
  if (!total && models.length) throw new MonitorError("incomplete", "AI 账户汇总与模型明细不一致。")
  return { total, errors, models }
}
export async function fetchAIDay(client: CloudflareClient, caps: AICapabilities, dateUTC: string, now = Date.now()): Promise<AIDay> {
  const start = utcStart(dateUTC), end = Math.min(start + DAY_MS, now)
  if (end <= start) throw new MonitorError("configuration", "该 UTC 日期尚未开始。")
  if (start < now - caps.notOlderThan * 1000) throw new MonitorError("retention", `${dateUTC} 超出 AI Analytics 保留期，未填为零。`)
  const slices: Awaited<ReturnType<typeof fetchAISlice>>[] = []
  for (let from = start; from < end; from += caps.maxDuration * 1000) slices.push(await fetchAISlice(client, caps, from, Math.min(end, from + caps.maxDuration * 1000)))
  const totals = slices.map(slice => slice.total).filter((value): value is NonNullable<typeof value> => !!value)
  const sum = (metric: keyof ReturnType<typeof metrics>) => !totals.length || totals.some(total => total[metric] === null) ? null : totals.reduce((value, total) => value + (total[metric] ?? 0), 0)
  const warnings: string[] = []
  if (!caps.neurons) warnings.push("该账号 Schema/权限未提供 totalNeurons；不以 Token 数量换算或猜算额度。")
  if (totals.length !== slices.length) warnings.push("部分时段暂无 AI 记录或仍在聚合；已取得总量可能不完整。")
  const models = rankAIModels(slices)
  const neurons = sum("neurons")
  const requests = sum("requests")
  if (requests !== null && Math.abs(models.reduce((value, model) => value + model.requests, 0) - requests) > Math.max(1, requests * 0.02)) warnings.push("账户与模型的推理次数估算存在差异，可能由采样或聚合延迟造成。")
  if (neurons !== null && Math.abs(models.reduce((value, model) => value + (model.neurons ?? 0), 0) - neurons) > Math.max(0.01, neurons * 0.02)) warnings.push("账户与模型分组的采样估算存在差异；参考额度使用独立账户汇总。")
  return { version: 1, dateUTC, queriedFrom: new Date(start).toISOString(), queriedTo: new Date(end).toISOString(), fetchedAt: new Date().toISOString(),
    requests, neurons, inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens"),
    errors: !totals.length || !caps.errors ? null : slices.reduce((value, slice) => value + (slice.errors ?? 0), 0), models, warnings }
}
export async function loadAI(account: AccountConfig, period: Period = "today", options: LoadOptions = {}): Promise<AIView> {
  const running = inFlight.get(account.id)
  if (running) { await running; return loadAI(account, period, { ...options, force: false, verify: false }) }
  const promise = performLoadAI(account, period, options)
  inFlight.set(account.id, promise)
  try { return await promise } finally { if (inFlight.get(account.id) === promise) inFlight.delete(account.id) }
}
async function performLoadAI(account: AccountConfig, period: Period, options: LoadOptions): Promise<AIView> {
  const now = options.now ?? Date.now(), initial = cachedAIView(account, period, now)
  let needs = initial.expectedDates.filter(date => {
    const day = readAIDay(account.id, date), age = day ? now - Date.parse(day.fetchedAt) : -1
    return options.force || age < 0 || age >= (utcStart(date) >= utcStart(utcDate(now)) - DAY_MS ? 600_000 : DAY_MS)
  })
  if (!needs.length && !options.verify) return { ...initial, refreshState: { kind: "fresh" } }
  const oldFailure = initial.failures[0], attempt = Storage.get<number>(key(account.id, "attempt")) ?? 0
  if (oldFailure?.retryAt && Date.parse(oldFailure.retryAt) > now) return { ...initial, refreshState: { kind: "cooldown", retryAt: oldFailure.retryAt } }
  const gap = options.widget ? 600_000 : options.force || options.verify ? 60_000 : 120_000
  if (now - attempt >= 0 && now - attempt < gap) {
    const missing = !options.widget && !options.verify && !oldFailure ? needs.filter(date => !readAIDay(account.id, date)) : []
    if (!missing.length) return { ...initial, refreshState: { kind: "cooldown", retryAt: new Date(attempt + gap).toISOString() } }
    needs = missing
  }
  const lease = acquireLease(account.id, options.widget ? 25_000 : 150_000, now)
  if (!lease) return { ...initial, refreshState: { kind: "busy" } }
  const failures: Failure[] = []
  let refreshed = false
  try {
    store(account, "attempt", now)
    const client = new CloudflareClient(account.accountId, readToken(account.id), Date.now() + (options.widget ? 18_000 : 120_000), options.widget ? 12 : 90)
    let caps = Storage.get<AICapabilities>(key(account.id, "capabilities"))
    if (!caps || options.verify || (!options.widget && now - Date.parse(caps.checkedAt) > 7 * DAY_MS)) {
      if (options.widget) throw new MonitorError("configuration", "请先打开脚本，选择 Workers AI 并刷新，以验证 AI 字段。")
      caps = await discoverAICapabilities(client)
      store(account, "capabilities", caps)
    }
    const ordered = [...needs].sort().reverse()
    for (let i = 0; i < ordered.length; i++) {
      try { writeAIDay(account, await fetchAIDay(client, caps, ordered[i], now)); refreshed = true }
      catch (error) { const failure = failureFrom(error); failures.push(failure); if (failure.kind !== "retention") break }
      options.onProgress?.(i + 1, ordered.length)
    }
    if (failures.length) store(account, "failure", failures[0])
    else Storage.remove(key(account.id, "failure"))
  } catch (error) {
    const failure = failureFrom(error); failures.push(failure)
    try { store(account, "failure", failure) } catch { /* 内存仍保留明确的错误提示。 */ }
  } finally { releaseLease(account.id, lease) }
  return { ...cachedAIView(account, period, now), failures, fromCache: !refreshed }
}
