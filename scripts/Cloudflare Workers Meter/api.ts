import { fetch } from "scripting"
import { byRequests, Capabilities, DAY_MS, DayData, MonitorError, utcStart, WorkerMetric } from "./core"

export const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql"
type ObjectValue = Record<string, unknown>
export function object(value: unknown): ObjectValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new MonitorError("api", "Cloudflare 返回了不完整的数据结构。")
  return value as ObjectValue
}
export function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new MonitorError("api", "Cloudflare 返回了无效的统计数值，已保留旧缓存。")
  return value
}
export function rows(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new MonitorError("api", "Analytics 数据缺失，已保留旧缓存。")
  return value
}
function retryDate(header: string | null, now: number): string {
  const seconds = header === null ? NaN : Number(header)
  const date = Number.isFinite(seconds) ? now + Math.max(60, seconds) * 1000 : header ? Date.parse(header) : NaN
  return new Date(Number.isFinite(date) ? Math.max(now + 60_000, date) : now + 5 * 60_000).toISOString()
}

export function classifyApiFailure(status: number, errors: unknown, retryAfter: string | null = null, now = Date.now()): MonitorError {
  const list = Array.isArray(errors) ? errors : []
  const messages = list.map(item => typeof item === "object" && item !== null && "message" in item ? String(item.message) : "").join(" ").toLowerCase()
  if (status === 429 || /rate.?limit|too many requests|quota exceeded.*query/.test(messages)) {
    return new MonitorError("rateLimit", "Cloudflare API 已限流，冷却后再更新。", retryDate(retryAfter, now))
  }
  if (status === 401 || /authentication error|invalid.{0,30}token|token.{0,20}invalid|expired.{0,20}token|not authenticated/.test(messages)) {
    return new MonitorError("auth", "API Token 无效或已过期，请在账号设置中更换。")
  }
  if (status === 403 || /permission|not authorized|unauthorized|not allowed|cannot access|does not have access/.test(messages)) {
    return new MonitorError("permission", "权限不足或 Account ID 不在 Token 范围内。需要 Account → Account Analytics → Read。")
  }
  if (/notolderthan|retention|too old|older than|time range.{0,30}(invalid|limit)|cannot request data older/.test(messages)) {
    return new MonitorError("retention", "请求的日期超出该账号 Analytics 可查询范围。")
  }
  if (/cannot query field|unknown argument|unknown field|unknown type|validation|invalid value.*enum/.test(messages)) {
    return new MonitorError("schema", "当前 Cloudflare Schema 与已确认字段不一致，请在 App 中重新验证 API。")
  }
  return new MonitorError("api", status >= 500 ? "Cloudflare 服务暂时异常，已保留旧缓存。" : "Cloudflare 拒绝或未完成查询，已保留旧缓存。")
}

export class CloudflareClient {
  private requests = 0
  constructor(
    private readonly accountId: string,
    private readonly token: string,
    private readonly deadline = Date.now() + 120_000,
    private readonly maxRequests = 90,
  ) {}
  private checkBudget() {
    if (Date.now() >= this.deadline || this.requests >= this.maxRequests) {
      throw new MonitorError("incomplete", "本轮查询达到时间或请求上限；未完成的日期没有覆盖缓存，请在 App 中继续刷新。")
    }
    this.requests++
  }
  async graphql(query: string): Promise<ObjectValue> {
    this.checkBudget()
    let response: Awaited<ReturnType<typeof fetch>>
    try {
      response = await fetch(GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: { "Authorization": "Bearer " + this.token, "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ query }),
        timeout: Math.max(1, Math.min(15, (this.deadline - Date.now()) / 1000)),
        handleRedirect: async () => null,
      })
    } catch {
      throw new MonitorError("network", "网络连接失败或超时，正在显示最近成功缓存。")
    }
    let payload: ObjectValue
    try { payload = object(await response.json()) } catch {
      if (!response.ok) throw classifyApiFailure(response.status, [], response.headers.get("Retry-After"))
      throw new MonitorError("api", "Cloudflare 返回了无法解析的数据，已保留旧缓存。")
    }
    const errors = Array.isArray(payload.errors) ? payload.errors : []
    if (!response.ok || errors.length || payload.success === false) {
      // GraphQL 即使 HTTP 200 也可能包含 errors；不使用带错误的 partial data。
      throw classifyApiFailure(response.status, payload.errors, response.headers.get("Retry-After"))
    }
    return object(payload.data)
  }
  accountSelection(body: string): string {
    return `viewer { accounts(filter: { accountTag: ${JSON.stringify(this.accountId)} }) { ${body} } }`
  }
  accountResult(data: ObjectValue): ObjectValue {
    const accounts = rows(object(data.viewer).accounts)
    if (accounts.length !== 1) throw new MonitorError("permission", "该 Account ID 不可访问。请检查账号 ID 与 Token 的账号资源范围。")
    return object(accounts[0])
  }
}

interface TypeRef { name?: string | null; kind?: string; ofType?: TypeRef | null }
interface Field { name: string; description?: string | null; type: TypeRef; args: { name: string; type: TypeRef }[] }
export interface TypeInfo { fields?: Field[] | null; inputFields?: { name: string }[] | null; enumValues?: { name: string }[] | null }
const TYPE_REF = "kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } }"
export const TYPE_BODY = `fields { name description type { ${TYPE_REF} } args { name type { ${TYPE_REF} } } } inputFields { name } enumValues { name }`
export function typeName(ref: TypeRef | undefined): string {
  if (!ref) throw new MonitorError("schema", "Cloudflare 类型声明缺失。")
  if (ref.name) return ref.name
  return typeName(ref.ofType ?? undefined)
}
export function field(info: TypeInfo, name: string): Field {
  const result = info.fields?.find(item => item.name === name)
  if (!result) throw new MonitorError("schema", `Cloudflare 未提供必要的 ${name} 字段。`)
  return result
}
function hasInput(info: TypeInfo, name: string): boolean {
  return !!info.inputFields?.some(item => item.name === name)
}
function cpuUnit(description: string): WorkerMetric["cpuUnit"] {
  if (/microsecond|micro.second|µs|μs/i.test(description)) return "µs"
  if (/millisecond|milli.second/i.test(description)) return "ms"
  if (/nanosecond|nano.second/i.test(description)) return "ns"
  return "API 原始单位"
}

/** 按真实 Schema 查类型、过滤器、排序枚举、可用字段与账号查询限制。 */
export async function discoverCapabilities(client: CloudflareClient): Promise<Capabilities> {
  const root = await client.graphql(`{ __schema { queryType { fields { name type { ${TYPE_REF} } } } } }`)
  const queryType = object(object(root.__schema).queryType) as unknown as TypeInfo
  const viewerName = typeName(field(queryType, "viewer").type)
  const viewerData = await client.graphql(`{ t: __type(name: ${JSON.stringify(viewerName)}) { ${TYPE_BODY} } }`)
  const accountName = typeName(field(viewerData.t as TypeInfo, "accounts").type)
  const accountData = await client.graphql(`{ t: __type(name: ${JSON.stringify(accountName)}) { ${TYPE_BODY} } }`)
  const dataset = field(accountData.t as TypeInfo, "workersInvocationsAdaptive")
  const filterName = typeName(dataset.args.find(item => item.name === "filter")?.type)
  const orderName = typeName(dataset.args.find(item => item.name === "orderBy")?.type)
  const rowName = typeName(dataset.type)
  const definitions = await client.graphql(`{
    filter: __type(name: ${JSON.stringify(filterName)}) { ${TYPE_BODY} }
    order: __type(name: ${JSON.stringify(orderName)}) { ${TYPE_BODY} }
    row: __type(name: ${JSON.stringify(rowName)}) { ${TYPE_BODY} }
    ${client.accountSelection("settings { workersInvocationsAdaptive { enabled maxPageSize maxDuration notOlderThan availableFields } }")}
  }`)
  const filter = definitions.filter as TypeInfo
  for (const name of ["datetime_geq", "datetime_lt", "scriptName_gt"]) {
    if (!hasInput(filter, name)) throw new MonitorError("schema", `该账号 Schema 不支持 ${name}，不能保证 UTC 边界与完整分页。`)
  }
  if (!(definitions.order as TypeInfo).enumValues?.some(item => item.name === "scriptName_ASC")) {
    throw new MonitorError("schema", "Schema 未提供 scriptName_ASC，不能保证 Worker 明细分页完整。")
  }
  const row = definitions.row as TypeInfo
  const sumName = typeName(field(row, "sum").type)
  const dimensionsName = typeName(field(row, "dimensions").type)
  const quantilesField = row.fields?.find(item => item.name === "quantiles")
  const details = await client.graphql(`{
    sums: __type(name: ${JSON.stringify(sumName)}) { ${TYPE_BODY} }
    dimensions: __type(name: ${JSON.stringify(dimensionsName)}) { ${TYPE_BODY} }
    ${quantilesField ? `quantiles: __type(name: ${JSON.stringify(typeName(quantilesField.type))}) { ${TYPE_BODY} }` : ""}
  }`)
  field(details.sums as TypeInfo, "requests")
  field(details.sums as TypeInfo, "errors")
  field(details.dimensions as TypeInfo, "scriptName")
  const settings = object(object(client.accountResult(definitions).settings).workersInvocationsAdaptive)
  if (settings.enabled !== true) throw new MonitorError("permission", "当前账号或 Token 未启用 Workers Analytics 数据集。")
  const available = rows(settings.availableFields).filter((value): value is string => typeof value === "string")
  for (const name of ["sum_requests", "sum_errors", "dimensions_scriptName"]) {
    if (!available.includes(name)) throw new MonitorError("permission", `当前账号没有开放必要统计字段 ${name}。`)
  }
  const p50 = (details.quantiles as TypeInfo | undefined)?.fields?.find(item => item.name === "cpuTimeP50")
  const p99 = (details.quantiles as TypeInfo | undefined)?.fields?.find(item => item.name === "cpuTimeP99")
  const cpu = !!p50 && !!p99 && available.includes("quantiles_cpuTimeP50") && available.includes("quantiles_cpuTimeP99")
  const maxPageSize = Math.floor(count(settings.maxPageSize))
  const maxDuration = count(settings.maxDuration)
  const notOlderThan = count(settings.notOlderThan)
  if (maxPageSize < 1 || maxDuration < 1 || notOlderThan < 1) throw new MonitorError("schema", "该账号查询限制无效。")
  return {
    checkedAt: new Date().toISOString(), maxPageSize: Math.min(maxPageSize, 500), maxDuration, notOlderThan,
    cpu, cpuUnit: cpu ? cpuUnit((p50?.description ?? "") + " " + (p99?.description ?? "")) : undefined,
    excludePreview: hasInput(filter, "isPreview"),
  }
}

export function metricsBody(start: number, end: number, caps: Capabilities, after?: string, includeTotal = true): string {
  const filter = `datetime_geq: ${JSON.stringify(new Date(start).toISOString())}, datetime_lt: ${JSON.stringify(new Date(end).toISOString())}${caps.excludePreview ? ", isPreview: 0" : ""}`
  return `
    ${includeTotal ? `total: workersInvocationsAdaptive(limit: 1, filter: { ${filter} }) { sum { requests errors } }` : ""}
    workers: workersInvocationsAdaptive(limit: ${caps.maxPageSize}, orderBy: [scriptName_ASC], filter: {
      ${filter}${after !== undefined ? `, scriptName_gt: ${JSON.stringify(after)}` : ""}
    }) { dimensions { scriptName } sum { requests errors } ${caps.cpu ? "quantiles { cpuTimeP50 cpuTimeP99 }" : ""} }
  `
}
function workerFrom(value: unknown, caps: Capabilities): WorkerMetric {
  const row = object(value)
  const name = object(row.dimensions).scriptName
  if (typeof name !== "string") throw new MonitorError("incomplete", "Worker 名称维度缺失，无法保证完整排名。")
  const sums = object(row.sum)
  const metric: WorkerMetric = { name, requests: count(sums.requests), errors: count(sums.errors) }
  if (caps.cpu && row.quantiles !== null && row.quantiles !== undefined) {
    const quantiles = object(row.quantiles)
    if (quantiles.cpuTimeP50 != null) metric.cpuP50 = count(quantiles.cpuTimeP50)
    if (quantiles.cpuTimeP99 != null) metric.cpuP99 = count(quantiles.cpuTimeP99)
    metric.cpuUnit = caps.cpuUnit
  }
  return metric
}

async function fetchSlice(client: CloudflareClient, caps: Capabilities, start: number, end: number) {
  let after: string | undefined
  let total: number | null = null
  let errors: number | null = null
  const workers: WorkerMetric[] = []
  const seen = new Set<string>()
  do {
    const data = await client.graphql(`{ ${client.accountSelection(metricsBody(start, end, caps, after, after === undefined))} }`)
    const account = client.accountResult(data)
    if (after === undefined) {
      const totals = rows(account.total)
      if (totals.length > 1) throw new MonitorError("incomplete", "账户汇总意外返回多组，已停止写入，避免重复统计。")
      if (totals.length === 1) {
        const sums = object(object(totals[0]).sum)
        total = count(sums.requests)
        errors = count(sums.errors)
      }
    }
    const page = rows(account.workers).map(item => workerFrom(item, caps))
    if (page.length > caps.maxPageSize) throw new MonitorError("incomplete", "分页长度异常，已停止写入。")
    let cursor = after
    for (const worker of page) {
      if (seen.has(worker.name) || (cursor !== undefined && worker.name <= cursor)) {
        throw new MonitorError("incomplete", "Worker 分页重复或排序异常，已保留原缓存。")
      }
      seen.add(worker.name)
      cursor = worker.name
      workers.push(worker)
    }
    if (page.length < caps.maxPageSize) break
    after = page[page.length - 1].name
  } while (true)
  if (total === null && workers.length) throw new MonitorError("incomplete", "Worker 明细与账户汇总不一致，已保留原缓存。")
  return { total, errors, workers }
}

export async function fetchDay(client: CloudflareClient, caps: Capabilities, dateUTC: string, now = Date.now()): Promise<DayData> {
  const start = utcStart(dateUTC)
  const end = Math.min(start + DAY_MS, now)
  if (end <= start) throw new MonitorError("configuration", "该 UTC 日期尚未开始。")
  if (start < now - caps.notOlderThan * 1000) throw new MonitorError("retention", `${dateUTC} 超出该账号 API 保留期，未将缺失日期填为零。`)
  const slices: Awaited<ReturnType<typeof fetchSlice>>[] = []
  for (let from = start; from < end; from += caps.maxDuration * 1000) {
    slices.push(await fetchSlice(client, caps, from, Math.min(from + caps.maxDuration * 1000, end)))
  }
  const metrics = new Map<string, WorkerMetric>()
  for (const slice of slices) {
    for (const worker of slice.workers) {
      if (slices.length === 1) metrics.set(worker.name, worker)
      else {
        const existing = metrics.get(worker.name) ?? { name: worker.name, requests: 0, errors: 0 }
        existing.requests += worker.requests
        existing.errors += worker.errors
        metrics.set(worker.name, existing)
      }
    }
  }
  // 空响应无法区分无调用与聚合延迟，因此 requests=null，不伪装成 0。
  const hasTotals = slices.some(slice => slice.total !== null)
  const requests = hasTotals ? slices.reduce((sum, slice) => sum + (slice.total ?? 0), 0) : null
  const errors = hasTotals ? slices.reduce((sum, slice) => sum + (slice.errors ?? 0), 0) : null
  const workers = [...metrics.values()].sort(byRequests)
  const warnings: string[] = []
  if (slices.length > 1) warnings.push("API 时段限制导致分段查询；CPU 分位数没有跨段合并。")
  if (slices.some(slice => slice.total === null)) warnings.push("部分时段暂无调用记录，也可能是 Analytics 延迟；总量可能尚未完整。")
  const workerTotal = workers.reduce((sum, worker) => sum + worker.requests, 0)
  if (requests !== null && Math.abs(workerTotal - requests) > Math.max(1, requests * 0.02)) {
    warnings.push("账户聚合与 Worker 分组估算有差异（采样或写入延迟）；额度以独立账户聚合为准。")
  }
  if (!caps.excludePreview) warnings.push("此 Schema 没有 Preview 过滤器；统计可能包含预览调用。")
  return { version: 1, dateUTC, queriedFrom: new Date(start).toISOString(), queriedTo: new Date(end).toISOString(), fetchedAt: new Date().toISOString(), requests, errors, workers, warnings }
}
