import test from "node:test"
import assert from "node:assert/strict"
import { analytics as workersAnalytics, BASE_TIME, createRuntime, fixtureAccount, fixtureCaps, plain, response, textContent } from "./harness.mjs"

const date = "2026-10-14"
const prefix = "cf-workers-meter.v1.account.local-test.ai."
const caps = extra => ({ checkedAt: new Date(BASE_TIME).toISOString(), maxPageSize: 500, maxDuration: 86400, notOlderThan: 90 * 86400, neurons: true, inputTokens: true, outputTokens: true, errors: true, ...extra })
const metric = (count = 20, neurons = 750.125) => ({ count, sum: { totalNeurons: neurons, totalInputTokens: 1000, totalOutputTokens: 250 } })
const model = (name, count = 20, neurons = 750.125) => ({ ...metric(count, neurons), dimensions: { modelId: name } })
function analytics({ total = metric(), models = [model("@cf/meta/llama")], errors = [] } = {}) {
  return { data: { viewer: { accounts: [{ total: total === null ? [] : [total], models, errors }] } } }
}
function schemaReply(query, options = {}) {
  const ref = name => ({ name, kind: "OBJECT" }), field = (name, type, args = []) => ({ name, type: ref(type), args })
  const sums = ["totalInputTokens", "totalOutputTokens", ...(options.noNeurons ? [] : ["totalNeurons"])]
  if (query.includes("__schema")) return { data: { __schema: { queryType: { fields: [field("viewer", "AIViewer")] } } } }
  if (query.includes('name: "AIViewer"')) return { data: { t: { fields: [field("accounts", "AIAccount")] } } }
  if (query.includes('name: "AIAccount"')) return { data: { t: { fields: options.noDataset ? [] : [field("aiInferenceAdaptiveGroups", "AIRow", [{ name: "filter", type: ref("AIFilter") }, { name: "orderBy", type: ref("AIOrder") }])] } } }
  if (query.includes('name: "AIFilter"')) return { data: {
    filter: { inputFields: ["datetime_geq", "datetime_lt", "errorCode_neq", ...(options.noCursor ? [] : ["modelId_gt"])].map(name => ({ name })) },
    order: { enumValues: [{ name: "modelId_ASC" }] },
    row: { fields: [field("count", "uint64"), field("sum", "AISum"), field("dimensions", "AIDimensions")] },
    viewer: { accounts: [{ settings: { aiInferenceAdaptiveGroups: { enabled: !options.disabled, maxPageSize: 10000, maxDuration: 86400, notOlderThan: 90 * 86400, availableFields: ["count", "dimensions_modelId", ...sums.map(name => "sum_" + name)] } } }] },
  } }
  return { data: { sums: { fields: sums.map(name => field(name, "float64")) }, dimensions: { fields: [field("modelId", "string")] } } }
}
function setup(options = {}) {
  const runtime = createRuntime({ fetch: async () => response(analytics()), ...options })
  const storage = runtime.load("storage"), ai = runtime.load("ai"), api = runtime.load("api")
  const account = storage.saveAccount(fixtureAccount(), "test-only-secret")
  runtime.state.storage.set(prefix + "capabilities", caps())
  return { ...runtime, storage, ai, api, account, client: () => new api.CloudflareClient(account.accountId, "test-only-secret") }
}
function nodes(value, type) {
  if (!value || typeof value !== "object") return []
  if (Array.isArray(value)) return value.flatMap(child => nodes(child, type))
  return [...(value.type === type ? [value] : []), ...Object.values(value.props ?? {}).flatMap(child => nodes(child, type))]
}

test("AI 先通过账号 Schema/Settings 确认字段，缺少 Neurons 时不猜算", async () => {
  for (const noNeurons of [false, true]) {
    const runtime = setup({ fetch: async (_, init) => response(schemaReply(JSON.parse(init.body).query, { noNeurons })) })
    const result = await runtime.ai.discoverAICapabilities(runtime.client())
    assert.equal(result.neurons, !noNeurons)
    assert.equal(result.inputTokens, true)
    assert.equal(result.errors, true)
    assert.equal(result.maxPageSize, 500)
    assert.equal(runtime.state.calls.length, 5)
  }
})

test("AI 数据集未开放或不能完整分页时明确拒绝，不影响 Workers 字段", async () => {
  for (const options of [{ noDataset: true }, { noCursor: true }, { disabled: true }]) {
    const runtime = setup({ fetch: async (_, init) => response(schemaReply(JSON.parse(init.body).query, options)) })
    await assert.rejects(runtime.ai.discoverAICapabilities(runtime.client()), error => ["schema", "permission"].includes(error.kind))
    assert.ok(runtime.state.calls.every(call => !JSON.parse(call.init.body).query.includes("workersInvocationsAdaptive")))
  }
})

test("AI 独立账户汇总、按模型游标分页、保留小数，不把 Top 3 求和当总额", async () => {
  const runtime = setup({ fetch: async (_, init) => {
    const query = JSON.parse(init.body).query
    if (query.includes("modelId_gt")) return response(analytics({ models: [model("z", 5, 100.5)] }))
    return response(analytics({ total: metric(100, 1000.75), models: [model("a", 10, 300.125), model("b", 20, 400.125)], errors: [{ count: 3 }] }))
  } })
  const day = await runtime.ai.fetchAIDay(runtime.client(), caps({ maxPageSize: 2 }), date)
  assert.equal(day.neurons, 1000.75)
  assert.equal(day.requests, 100)
  assert.equal(day.errors, 3)
  assert.deepEqual(plain(day.models.map(item => item.name)), ["b", "a", "z"])
  assert.equal(runtime.state.calls.length, 2)
  assert.match(JSON.parse(runtime.state.calls[1].init.body).query, /modelId_gt: "b"/)
  assert.doesNotMatch(JSON.parse(runtime.state.calls[1].init.body).query, /total:|errors:/)
  assert.ok(day.warnings.some(text => text.includes("采样")))
})

test("AI 拆段使用 UTC 半开区间，只累加可加指标，不再次乘采样率", async () => {
  const runtime = setup({ fetch: async () => response(analytics({ total: metric(10, 100.125), models: [model("a", 10, 100.125)] })) })
  const day = await runtime.ai.fetchAIDay(runtime.client(), caps({ maxDuration: 6 * 3600 }), date)
  assert.equal(day.requests, 20)
  assert.equal(day.neurons, 200.25)
  assert.equal(day.models[0].neurons, 200.25)
  const queries = runtime.state.calls.map(call => JSON.parse(call.init.body).query)
  assert.match(queries[0], /datetime_geq: "2026-10-14T00:00:00.000Z"/)
  assert.match(queries[0], /datetime_lt: "2026-10-14T06:00:00.000Z"/)
  assert.match(queries[1], /datetime_geq: "2026-10-14T06:00:00.000Z"/)
  assert.match(queries[1], /datetime_lt: "2026-10-14T12:00:00.000Z"/)
})

test("AI 无记录保持未知，确切零保持零，未开放 Neurons 则省略该查询字段", async () => {
  const runtime = setup()
  runtime.state.performFetch = async () => response(analytics({ total: null, models: [] }))
  const unknown = await runtime.ai.fetchAIDay(runtime.client(), caps(), date)
  assert.equal(unknown.neurons, null)
  assert.equal(unknown.requests, null)
  assert.equal(unknown.errors, null)
  runtime.state.performFetch = async () => response(analytics({ total: metric(0, 0), models: [] }))
  const zero = await runtime.ai.fetchAIDay(runtime.client(), caps(), date)
  assert.equal(zero.neurons, 0)
  assert.equal(zero.errors, 0)
  const omitted = await runtime.ai.fetchAIDay(runtime.client(), caps({ neurons: false, inputTokens: false, outputTokens: false }), date)
  assert.equal(omitted.neurons, null)
  assert.doesNotMatch(JSON.parse(runtime.state.calls.at(-1).init.body).query, /totalNeurons|totalInputTokens|totalOutputTokens|sum \{/)
  assert.match(omitted.warnings.join(" "), /不以 Token 数量/)
})

test("AI 重复分页、非法统计数值、部分错误响应或超预算都不返回假完整结果", async () => {
  const runtime = setup({ fetch: async () => response(analytics({ models: [model("a")] })) })
  await assert.rejects(runtime.ai.fetchAIDay(runtime.client(), caps({ maxPageSize: 1 }), date), error => error.kind === "incomplete")
  runtime.state.performFetch = async () => response(analytics({ total: metric(10, -1) }))
  await assert.rejects(runtime.ai.fetchAIDay(runtime.client(), caps(), date), error => error.kind === "api")
  runtime.state.performFetch = async () => response({ ...analytics(), errors: [{ message: "not authorized" }] })
  await assert.rejects(runtime.ai.fetchAIDay(runtime.client(), caps(), date), error => error.kind === "permission")
  runtime.state.performFetch = async () => response(analytics())
  await assert.rejects(runtime.ai.fetchAIDay(new runtime.api.CloudflareClient(runtime.account.accountId, "fixture", BASE_TIME + 1000, 1), caps({ maxPageSize: 1 }), date), error => error.kind === "incomplete")
})

test("AI 保留期以账号 Settings 为准，过期日期不请求且不填零", async () => {
  const runtime = setup()
  await assert.rejects(runtime.ai.fetchAIDay(runtime.client(), caps({ notOlderThan: 3600 }), date), error => error.kind === "retention")
  assert.equal(runtime.state.calls.length, 0)
})

test("AI 和 Workers 的缓存、成功时间、失败状态和凭据隔离，账号编辑仍复用 Token", async () => {
  const runtime = setup()
  runtime.storage.writeCapabilities(runtime.account, fixtureCaps())
  runtime.state.performFetch = async () => response(workersAnalytics())
  const workers = await runtime.load("service").loadMonitor(runtime.account, "today")
  assert.equal(workers.days[0].requests, 100)
  runtime.state.performFetch = async () => response(analytics())
  const workersKeys = [...runtime.state.storage.keys()].filter(name => !name.includes(".ai."))
  const result = await runtime.ai.loadAI(runtime.account)
  assert.equal(result.days[0].neurons, 750.125)
  assert.equal(runtime.storage.readDay(runtime.account.id, date).requests, 100)
  assert.equal(runtime.storage.readFailure(runtime.account.id)?.kind, workers.failures[0]?.kind)
  assert.ok(workersKeys.every(name => runtime.state.storage.has(name)))
  assert.ok(!JSON.stringify([...runtime.state.storage.values()]).includes("test-only-secret"))
  runtime.state.now++
  const updated = runtime.storage.saveAccount({ ...runtime.account, displayName: "新名称" }, "")
  assert.equal(runtime.storage.readToken(updated.id), "test-only-secret")
  assert.equal(runtime.state.storage.has(prefix + "capabilities"), false)
  assert.ok(runtime.ai.readAIDay(updated.id, date))
  runtime.storage.deleteAccount(updated.id)
  assert.ok(![...runtime.state.storage.keys()].some(name => name.startsWith(prefix)))
})

test("同账号 AI 并发只查询一次，失败与限流都保留成功数据和原更新时间", async () => {
  const runtime = setup()
  await Promise.all([runtime.ai.loadAI(runtime.account), runtime.ai.loadAI(runtime.account)])
  assert.equal(runtime.state.calls.length, 1)
  const cached = runtime.ai.readAIDay(runtime.account.id, date)
  runtime.state.now += 61_000
  runtime.state.performFetch = async () => { throw new Error("test-only-secret") }
  const failed = await runtime.ai.loadAI(runtime.account, "today", { force: true })
  assert.equal(failed.failures[0].kind, "network")
  assert.equal(failed.days[0].fetchedAt, cached.fetchedAt)
  assert.equal(failed.days[0].neurons, cached.neurons)
  assert.ok(!JSON.stringify(failed).includes("test-only-secret"))
  runtime.state.now += 61_000
  runtime.state.performFetch = async () => response({ errors: [{ message: "rate limit" }] }, 429, { "retry-after": "900" })
  await runtime.ai.loadAI(runtime.account, "today", { force: true })
  const count = runtime.state.calls.length
  runtime.state.now += 61_000
  const blocked = await runtime.ai.loadAI(runtime.account, "today", { force: true })
  assert.equal(blocked.refreshState.kind, "cooldown")
  assert.equal(runtime.state.calls.length, count)
})

test("AI 多账号的统计与 Token 独立，旧配置结果不能写回，删除只清理目标账号", async () => {
  const runtime = setup()
  const first = await runtime.ai.loadAI(runtime.account)
  const second = runtime.storage.saveAccount(fixtureAccount({ id: "second-ai", accountId: "b".repeat(32), displayName: "第二个账号" }), "second-fixture-secret")
  runtime.state.storage.set("cf-workers-meter.v1.account.second-ai.ai.capabilities", caps())
  runtime.state.performFetch = async () => response(analytics({ total: metric(8, 42.125), models: [model("other-model", 8, 42.125)] }))
  const other = await runtime.ai.loadAI(second)
  assert.equal(other.days[0].neurons, 42.125)
  assert.equal(runtime.ai.readAIDay(runtime.account.id, date).neurons, 750.125)
  assert.equal(runtime.storage.readToken(runtime.account.id), "test-only-secret")
  assert.equal(runtime.storage.readToken(second.id), "second-fixture-secret")
  runtime.state.now += 1
  const updated = runtime.storage.saveAccount({ ...runtime.account, displayName: "更新配置" }, "")
  assert.throws(() => runtime.ai.writeAIDay(runtime.account, first.days[0]), error => error.kind === "configuration")
  runtime.storage.deleteAccount(updated.id)
  assert.equal(runtime.ai.readAIDay(second.id, date).neurons, 42.125)
  assert.equal(runtime.storage.readToken(second.id), "second-fixture-secret")
})

test("AI 今日刷新后立即选择七天可补取六天，跨 UTC 日失败仍标明旧缓存日期", async () => {
  const runtime = setup()
  await runtime.ai.loadAI(runtime.account)
  const history = await runtime.ai.loadAI(runtime.account, "7d")
  assert.equal(history.days.length, 7)
  assert.equal(runtime.state.calls.length, 7)
  runtime.state.now = Date.parse("2026-10-15T00:01:00Z")
  runtime.state.performFetch = async () => { throw new Error("offline") }
  const failed = await runtime.ai.loadAI(runtime.account)
  assert.equal(failed.days.length, 0)
  assert.equal(failed.previousDay.dateUTC, date)
  assert.equal(failed.missingDates[0], "2026-10-15")
})

test("AI 首次 Widget 提示先验证，不能把已有 Workers 验证当作 AI 字段验证", async () => {
  const runtime = setup()
  runtime.state.storage.delete(prefix + "capabilities")
  runtime.storage.writeCapabilities(runtime.account, fixtureCaps())
  const result = await runtime.ai.loadAI(runtime.account, "today", { widget: true })
  assert.equal(result.failures[0].kind, "configuration")
  assert.match(result.failures[0].message, /Workers AI/)
  assert.equal(runtime.state.calls.length, 0)
})

test("Widget 参数兼容原有账号参数，并支持 ai、ai:账号与官方预览 JSON 参数", () => {
  const runtime = setup()
  for (const parameter of ["", runtime.account.id, runtime.account.displayName, JSON.stringify(runtime.account.id)]) {
    assert.equal(runtime.ai.resolveWidgetTarget(parameter).kind, "workers")
    assert.equal(runtime.ai.resolveWidgetTarget(parameter).account.id, runtime.account.id)
  }
  for (const parameter of ["ai", "ai:" + runtime.account.id, JSON.stringify("ai:" + runtime.account.id)]) {
    assert.equal(runtime.ai.resolveWidgetTarget(parameter).kind, "ai")
    assert.equal(runtime.ai.resolveWidgetTarget(parameter).account.id, runtime.account.id)
  }
  assert.throws(() => runtime.ai.resolveWidgetTarget("ai:no-such-account"), error => error.kind === "configuration")
})

test("AI 数字与免费量参考保留小数、阈值与超额；Paid 不改变原有 Workers 配额", () => {
  const runtime = setup(), { formatNeurons, aiQuota } = runtime.ai
  for (const [value, expected] of [[0, "0"], [10000, "10,000"], [750.125, "750.125"], [0.9999, "1"], [0.00001, "<0.001"], [null, "—"]]) assert.equal(formatNeurons(value), expected)
  assert.equal(aiQuota(8000).level, "warning")
  assert.equal(aiQuota(9500).level, "critical")
  assert.equal(aiQuota(11000).ratio, 1.1)
  assert.equal(aiQuota(11000).remaining, 0)
  assert.equal(aiQuota(null).remaining, null)
  assert.equal(runtime.load("core").quota(fixtureAccount({ plan: "paid" }), 10000).limit, null)
})

test("AI 三尺寸使用 Neurons 真值绘制，未知量不显示满额；大号趋势的缺失日留空", async () => {
  const runtime = setup(), views = runtime.load("ai-views")
  const view = await runtime.ai.loadAI(runtime.account)
  const dates = runtime.load("core").periodDates("7d")
  for (const family of ["systemSmall", "systemMedium", "systemLarge"]) {
    const tree = views.AIWidgetView({ view, family, dates, history: view.days })
    const text = textContent(tree)
    assert.match(text, /750.125/)
    assert.match(text, /Neurons/)
    assert.doesNotMatch(text, /100,000|Worker 排名/)
    const arc = nodes(tree, "Circle").find(node => node.props.trim)
    assert.equal(arc.props.trim.to, 750.125 / 10000)
    if (family === "systemLarge") assert.match(text, /缺 6 天/)
  }
  view.days[0].neurons = null
  const unknown = views.AIWidgetView({ view, family: "systemSmall", dates, history: view.days })
  assert.doesNotMatch(textContent(unknown), /100.0%/)
  assert.match(textContent(unknown), /Neurons 未提供/)
  assert.equal(nodes(unknown, "Circle").filter(node => node.props.trim).length, 0)
})

test("App 有明确监控项目菜单，AI 模式只查询 AI，刷新反馈、原生预览参数均正确", async () => {
  const runtime = setup({ captureEntry: true })
  runtime.state.hooks[6] = "workers" // 继续验证从原独立 Workers 页面切到 AI 的路径。
  runtime.load("index"); await runtime.state.entryPromise
  const picker = nodes(runtime.state.presented.element, "Picker").find(node => node.props.title === "监控项目")
  assert.equal(picker.props.pickerStyle, "menu")
  picker.props.onChanged("ai")
  const next = createRuntime({ captureEntry: true, initialHooks: runtime.state.hooks, storage: runtime.state.storage, keychain: runtime.state.keychain, fetch: async () => response(analytics()) })
  next.load("index"); await next.state.entryPromise
  const element = next.state.presented.element
  assert.ok(nodes(element, "Button").some(node => node.props.title === "刷新 AI"))
  assert.ok(!nodes(element, "Button").some(node => node.props.title === "手动刷新"))
  const cleanupWorkers = next.state.effects[0]()
  assert.equal(next.state.calls.length, 0)
  const cleanupAI = next.state.effects[1]()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(next.state.calls.length, 1)
  assert.ok(next.state.calls.every(call => JSON.parse(call.init.body).query.includes("aiInferenceAdaptiveGroups")))
  assert.match(next.state.hooks[10], /AI 刷新完成/)
  const preview = nodes(element, "Button").find(node => node.props.title === "中号")
  await preview.props.action()
  assert.equal(next.state.previewOptions.parameters.default, "Workers AI")
  assert.equal(JSON.parse(next.state.previewOptions.parameters.options["Workers AI"]), "ai:" + runtime.account.id)
  cleanupAI(); if (cleanupWorkers) cleanupWorkers()
})

test("真实 Widget 入口按 ai 参数分流，各尺寸均不发出 Workers 查询或推理生成请求", async () => {
  for (const family of ["systemSmall", "systemMedium", "systemLarge"]) {
    const runtime = setup({ captureEntry: true, parameter: "ai", family })
    const history = await runtime.ai.loadAI(runtime.account, "7d")
    assert.equal(history.days.length, 7)
    const before = runtime.state.calls.length
    runtime.load("widget"); await runtime.state.entryPromise
    assert.equal(runtime.state.calls.length, before)
    assert.match(textContent(runtime.state.presented.element), /Neurons/)
    assert.equal(runtime.state.presented.policy.policy, "after")
    assert.ok(runtime.state.calls.every(call => call.url.endsWith("/graphql") && !JSON.parse(call.init.body).query.includes("workersInvocationsAdaptive")))
  }
})
