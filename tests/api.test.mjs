import test from "node:test"
import assert from "node:assert/strict"
import { analytics, BASE_TIME, createRuntime, fixtureCaps, response, worker } from "./harness.mjs"

test("账户汇总独立于 Worker 排名，sum.requests 不重复放大", async () => {
  const runtime = createRuntime({ fetch: async () => response(analytics(300, [worker("a", 80, 3), worker("b", 20, 1)])) })
  const { CloudflareClient, fetchDay } = runtime.load("api")
  const day = await fetchDay(new CloudflareClient("a".repeat(32), "test-only-secret"), fixtureCaps(), "2026-10-14", BASE_TIME)
  assert.equal(day.requests, 300)
  assert.equal(day.workers[0].requests, 80)
  assert.ok(day.warnings.some(value => value.includes("分组估算有差异")))
  const query = JSON.parse(runtime.state.calls[0].init.body).query
  assert.match(query, /datetime_geq: "2026-10-14T00:00:00.000Z"/)
  assert.match(query, /datetime_lt: "2026-10-14T12:00:00.000Z"/)
  assert.match(query, /dimensions \{ scriptName \}/)
  assert.doesNotMatch(query, /subrequests|dimensions \{ datetime|status|test-only-secret/)
  assert.match(query, /isPreview: 0/)
  assert.equal(runtime.state.calls[0].init.headers.Authorization, "Bearer test-only-secret")
})
test("Worker 分页到空尾页，全部排序，满页不被当成完整结果", async () => {
  const pages = [[worker("a", 5), worker("b", 7)], [worker("c", 2), worker("d", 10)], []]
  let index = 0
  const runtime = createRuntime({ fetch: async () => response(analytics(24, pages[index++])) })
  const { CloudflareClient, fetchDay } = runtime.load("api")
  const day = await fetchDay(new CloudflareClient("a".repeat(32), "fixture"), fixtureCaps({ maxPageSize: 2 }), "2026-10-14", BASE_TIME)
  assert.equal(index, 3)
  assert.deepEqual([...day.workers.map(item => item.name)], ["d", "b", "a", "c"])
  const second = JSON.parse(runtime.state.calls[1].init.body).query
  const third = JSON.parse(runtime.state.calls[2].init.body).query
  assert.match(second, /scriptName_gt: "b"/)
  assert.match(third, /scriptName_gt: "d"/)
  assert.doesNotMatch(second, /total:/)
})
test("重复/非递增分页和请求预算耗尽明确失败，不返回截断统计", async () => {
  const runtime = createRuntime({ fetch: async () => response(analytics(20, [worker("a", 10), worker("b", 10)])) })
  const { CloudflareClient, fetchDay } = runtime.load("api")
  await assert.rejects(fetchDay(new CloudflareClient("a".repeat(32), "fixture"), fixtureCaps({ maxPageSize: 2 }), "2026-10-14", BASE_TIME), error => error.kind === "incomplete")
  await assert.rejects(fetchDay(new CloudflareClient("a".repeat(32), "fixture", BASE_TIME + 10_000, 1), fixtureCaps({ maxPageSize: 2 }), "2026-10-14", BASE_TIME), error => error.kind === "incomplete")
})
test("每日拆段边界为半开区间，分位数不跨段合并", async () => {
  const runtime = createRuntime({ fetch: async () => response(analytics(10, [worker("a", 10, 2)])) })
  const { CloudflareClient, fetchDay } = runtime.load("api")
  const day = await fetchDay(new CloudflareClient("a".repeat(32), "fixture"), fixtureCaps({ maxDuration: 43200 }), "2026-10-13", BASE_TIME)
  assert.equal(day.requests, 20)
  assert.equal(day.workers[0].requests, 20)
  assert.equal(day.workers[0].cpuP50, undefined)
  const queries = runtime.state.calls.map(call => JSON.parse(call.init.body).query)
  assert.match(queries[0], /datetime_lt: "2026-10-13T12:00:00.000Z"/)
  assert.match(queries[1], /datetime_geq: "2026-10-13T12:00:00.000Z"/)
  assert.match(queries[1], /datetime_lt: "2026-10-14T00:00:00.000Z"/)
})
test("空数组是未知/无记录，不能伪造完整余额", async () => {
  const runtime = createRuntime({ fetch: async () => response(analytics(null, [])) })
  const { CloudflareClient, fetchDay } = runtime.load("api")
  const day = await fetchDay(new CloudflareClient("a".repeat(32), "fixture"), fixtureCaps(), "2026-10-14", BASE_TIME)
  assert.equal(day.requests, null)
  assert.equal(day.errors, null)
  assert.equal(day.workers.length, 0)
})
test("HTTP 与 GraphQL 错误分类，限流遵守 Retry-After", () => {
  const { classifyApiFailure } = createRuntime().load("api")
  assert.equal(classifyApiFailure(401, []).kind, "auth")
  assert.equal(classifyApiFailure(403, [{ message: "Authentication error" }]).kind, "auth")
  assert.equal(classifyApiFailure(403, [{ message: "Permission denied" }]).kind, "permission")
  assert.equal(classifyApiFailure(200, [{ message: "Cannot query field cpuTimeP50" }]).kind, "schema")
  assert.equal(classifyApiFailure(200, [{ message: "Data older than retention limit" }]).kind, "retention")
  assert.equal(classifyApiFailure(500, []).kind, "api")
  assert.equal(classifyApiFailure(429, [], "180", BASE_TIME).retryAt, "2026-10-14T12:03:00.000Z")
  assert.equal(classifyApiFailure(429, [], "Wed, 14 Oct 2026 12:04:00 GMT", BASE_TIME).retryAt, "2026-10-14T12:04:00.000Z")
})
test("HTTP 200 的 partial data 带 errors 时拒绝写入", async () => {
  const payload = analytics()
  payload.errors = [{ message: "Permission denied" }]
  const runtime = createRuntime({ fetch: async () => response(payload) })
  const { CloudflareClient } = runtime.load("api")
  await assert.rejects(new CloudflareClient("a".repeat(32), "fixture").graphql("{}"), error => error.kind === "permission")
})
test("网络原始异常中的秘密不会出现在公开错误里", async () => {
  const runtime = createRuntime({ fetch: async () => { throw new Error("Bearer secret-sentinel") } })
  const { CloudflareClient } = runtime.load("api")
  await assert.rejects(new CloudflareClient("a".repeat(32), "fixture").graphql("{}"), error => error.kind === "network" && !error.message.includes("secret-sentinel"))
})
test("保留期外日期与缺失数值拒绝，而不是填零", async () => {
  const runtime = createRuntime({ fetch: async () => response(analytics(undefined, [worker("a", 10)])) })
  const { CloudflareClient, fetchDay } = runtime.load("api")
  await assert.rejects(fetchDay(new CloudflareClient("a".repeat(32), "fixture"), fixtureCaps({ notOlderThan: 86400 }), "2026-10-10", BASE_TIME), error => error.kind === "retention")
  const bad = analytics()
  bad.data.viewer.accounts[0].total[0].sum.requests = undefined
  runtime.state.performFetch = async () => response(bad)
  await assert.rejects(fetchDay(new CloudflareClient("a".repeat(32), "fixture"), fixtureCaps(), "2026-10-14", BASE_TIME), error => error.kind === "api")
})

function schemaReply(query, { missingSort = false, cpu = true, unit = "microseconds" } = {}) {
  const ref = name => ({ name, kind: "OBJECT" })
  const f = (name, type, args = []) => ({ name, type: ref(type), args })
  if (query.includes("__schema")) return { data: { __schema: { queryType: { fields: [f("viewer", "Viewer")] } } } }
  if (query.includes('name: "Viewer"')) return { data: { t: { fields: [f("accounts", "Account")] } } }
  if (query.includes('name: "Account"')) return { data: { t: { fields: [f("workersInvocationsAdaptive", "Row", [{ name: "filter", type: ref("Filter") }, { name: "orderBy", type: ref("Order") }])] } } }
  if (query.includes('name: "Filter"')) return { data: {
    filter: { inputFields: ["datetime_geq", "datetime_lt", "scriptName_gt", "isPreview"].map(name => ({ name })) },
    order: { enumValues: missingSort ? [] : [{ name: "scriptName_ASC" }] },
    row: { fields: [f("sum", "Sum"), f("dimensions", "Dimensions"), ...(cpu ? [f("quantiles", "Quantiles")] : [])] },
    viewer: { accounts: [{ settings: { workersInvocationsAdaptive: { enabled: true, maxPageSize: 10000, maxDuration: 604800, notOlderThan: 7776000, availableFields: ["sum_requests", "sum_errors", "dimensions_scriptName", ...(cpu ? ["quantiles_cpuTimeP50", "quantiles_cpuTimeP99"] : [])] } } }] },
  } }
  return { data: { sums: { fields: [f("requests", "Float"), f("errors", "Float")] }, dimensions: { fields: [f("scriptName", "String")] }, quantiles: { fields: ["cpuTimeP50", "cpuTimeP99"].map(name => ({ ...f(name, "Float"), description: unit })) } } }
}
test("首次运行从 Schema 验证过滤、排序、CPU 单位和真实账号限制", async () => {
  const runtime = createRuntime({ fetch: async (_, init) => response(schemaReply(JSON.parse(init.body).query)) })
  const { CloudflareClient, discoverCapabilities } = runtime.load("api")
  const caps = await discoverCapabilities(new CloudflareClient("a".repeat(32), "fixture"))
  assert.equal(caps.maxPageSize, 500)
  assert.equal(caps.maxDuration, 604800)
  assert.equal(caps.cpu, true)
  assert.equal(caps.cpuUnit, "µs")
  assert.equal(caps.excludePreview, true)
  assert.equal(runtime.state.calls.length, 5)
})
test("不支持 CPU 则省略，单位不明不猜；无法分页则明确拒绝", async () => {
  for (const options of [{ cpu: false }, { unit: "CPU time percentile" }]) {
    const runtime = createRuntime({ fetch: async (_, init) => response(schemaReply(JSON.parse(init.body).query, options)) })
    const { CloudflareClient, discoverCapabilities } = runtime.load("api")
    const caps = await discoverCapabilities(new CloudflareClient("a".repeat(32), "fixture"))
    assert.equal(caps.cpu, options.cpu !== false)
    assert.equal(caps.cpuUnit, options.cpu === false ? undefined : "API 原始单位")
  }
  const runtime = createRuntime({ fetch: async (_, init) => response(schemaReply(JSON.parse(init.body).query, { missingSort: true })) })
  const { CloudflareClient, discoverCapabilities } = runtime.load("api")
  await assert.rejects(discoverCapabilities(new CloudflareClient("a".repeat(32), "fixture")), error => error.kind === "schema")
})
