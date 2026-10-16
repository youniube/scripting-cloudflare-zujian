import test from "node:test"
import assert from "node:assert/strict"
import { analytics, BASE_TIME, createRuntime, fixtureAccount, fixtureCaps, plain, response, textContent } from "./harness.mjs"

const prefix = "cf-workers-meter.v1.account.local-test.ai."
const aiCaps = { checkedAt: new Date(BASE_TIME).toISOString(), maxPageSize: 500, maxDuration: 86400, notOlderThan: 90 * 86400, neurons: true, inputTokens: true, outputTokens: true, errors: true }
const aiPayload = () => ({ data: { viewer: { accounts: [{ total: [{ count: 20, sum: { totalNeurons: 2750.125, totalInputTokens: 1000, totalOutputTokens: 250 } }], models: [{ count: 20, sum: { totalNeurons: 2750.125, totalInputTokens: 1000, totalOutputTokens: 250 }, dimensions: { modelId: "@cf/meta/llama" } }], errors: [{ count: 1 }] }] } } })
const fetchData = async (_, init) => response(JSON.parse(init.body).query.includes("aiInferenceAdaptiveGroups") ? aiPayload() : analytics(3511))
function setup(options = {}) {
  const runtime = createRuntime({ fetch: fetchData, ...options })
  const storage = runtime.load("storage"), account = storage.saveAccount(fixtureAccount(), "test-only-secret")
  storage.writeCapabilities(account, fixtureCaps())
  runtime.state.storage.set(prefix + "capabilities", aiCaps)
  return { ...runtime, storage, account, fusion: runtime.load("fusion") }
}
function nodes(value, type) {
  if (!value || typeof value !== "object") return []
  if (Array.isArray(value)) return value.flatMap(child => nodes(child, type))
  return [...(value.type === type ? [value] : []), ...Object.values(value.props ?? {}).flatMap(child => nodes(child, type))]
}

test("第三模式排第一且 App 默认融合；原 Workers、AI 菜单及预览参数均保留", async () => {
  const runtime = setup({ captureEntry: true })
  runtime.load("index"); await runtime.state.entryPromise
  const element = runtime.state.presented.element
  const picker = nodes(element, "Picker").find(node => node.props.title === "监控项目")
  assert.equal(picker.props.value, "fusion")
  assert.deepEqual(plain(nodes(picker, "Text").map(node => node.props.tag)), ["fusion", "workers", "ai"])
  assert.match(textContent(element), /融合监控 · Workers \+ AI/)
  assert.match(textContent(element), /fusion:\s*local-test/)
  assert.ok(!nodes(element, "Button").some(node => node.props.title === "刷新 AI" || node.props.title === "手动刷新"))
  await nodes(element, "Button").find(node => node.props.title === "中号").props.action()
  const parameters = runtime.state.previewOptions.parameters
  assert.equal(parameters.default, "融合监控")
  assert.equal(JSON.parse(parameters.options["融合监控"]), "fusion:local-test")
  assert.equal(JSON.parse(parameters.options.Workers), "local-test")
  assert.equal(JSON.parse(parameters.options["Workers AI"]), "ai:local-test")
  for (const value of ["workers", "ai", "fusion"]) { picker.props.onChanged(value); assert.equal(runtime.state.hooks[6], value) }
})

test("fusion 参数与 JSON 预览参数识别独立模式，空参数和原参数仍进入原版", () => {
  const runtime = setup(), resolve = runtime.load("ai").resolveWidgetTarget
  for (const value of ["fusion", "fusion:local-test", '"fusion:local-test"', "fusion:" + runtime.account.accountId]) {
    const result = resolve(value); assert.equal(result.kind, "fusion"); assert.equal(result.account.id, "local-test")
  }
  for (const value of ["", "local-test", runtime.account.accountId]) assert.equal(resolve(value).kind, "workers")
  for (const value of ["ai", "ai:local-test", '"ai:local-test"']) assert.equal(resolve(value).kind, "ai")
  assert.throws(() => resolve("fusion:unknown-account"), error => error.kind === "configuration")
})

test("融合服务依次执行两项查询，账户汇总、计量单位和成功缓存互不混用", async () => {
  let active = 0
  const runtime = setup({ fetch: async (...args) => {
    assert.equal(active++, 0, "不得并行占用两个原服务的共享账号锁")
    await new Promise(resolve => setImmediate(resolve))
    active--; return fetchData(...args)
  } })
  const progress = []
  const result = await runtime.fusion.loadFusion(runtime.account, "today", { onProductProgress: (product, done) => progress.push([product, done]) })
  assert.equal(result.workers.days[0].requests, 3511)
  assert.equal(result.ai.days[0].neurons, 2750.125)
  assert.equal(result.ai.days[0].requests, 20)
  assert.deepEqual(plain(result.workers.failures), [])
  assert.deepEqual(plain(result.ai.failures), [])
  assert.deepEqual(progress, [["Workers", 1], ["Workers AI", 1]])
  assert.equal(runtime.state.calls.length, 2)
  await runtime.fusion.loadFusion(runtime.account, "today", { widget: true })
  assert.equal(runtime.state.calls.length, 2, "独立版和融合版复用同一组已成功日期缓存")
})

test("AI 失败和限流独立保留成功时间，Workers 继续更新；重试时间取两项较晚值", async () => {
  const runtime = setup()
  await runtime.fusion.loadFusion(runtime.account, "today")
  const previous = runtime.load("ai").readAIDay(runtime.account.id, "2026-10-14")
  runtime.state.now += 20 * 60_000
  runtime.state.performFetch = async (_, init) => JSON.parse(init.body).query.includes("aiInferenceAdaptiveGroups") ? response({}, 429, { "retry-after": "3600" }) : response(analytics(4000))
  const result = await runtime.fusion.loadFusion(runtime.account, "today", { force: true })
  assert.equal(result.workers.days[0].requests, 4000)
  assert.equal(result.workers.failures.length, 0)
  assert.equal(result.ai.days[0].neurons, previous.neurons)
  assert.equal(result.ai.days[0].fetchedAt, previous.fetchedAt)
  assert.equal(result.ai.failures[0].kind, "rateLimit")
  assert.equal(runtime.fusion.fusionReload(result).toISOString(), result.ai.failures[0].retryAt)
  const before = runtime.state.calls.length
  await runtime.fusion.loadFusion(runtime.account, "today", { force: true })
  assert.equal(runtime.state.calls.length, before, "再次点击不能绕过任一产品的冷却或限流")
})

test("Workers 查询失败仍尝试 AI；原始异常与 Token 不进入界面", async () => {
  const runtime = setup({ fetch: async (url, init) => {
    if (!JSON.parse(init.body).query.includes("aiInferenceAdaptiveGroups")) throw new Error("offline secret-sentinel")
    return fetchData(url, init)
  } })
  const view = await runtime.fusion.loadFusion(runtime.account, "today")
  assert.equal(view.workers.failures[0].kind, "network")
  assert.equal(view.ai.days[0].neurons, 2750.125)
  const tree = runtime.load("fusion-views").FusionWidgetView({ view, family: "systemSmall" })
  assert.match(textContent(tree), /网络异常/)
  assert.match(textContent(tree), /2,750.125/)
  assert.doesNotMatch(textContent(tree), /secret-sentinel|test-only-secret/)
})

test("离开融合页或删除账号后不再启动第二项查询，跨日缓存仍显示真实日期", async () => {
  for (const deleted of [false, true]) {
    const runtime = setup()
    await runtime.fusion.loadFusion(runtime.account, "today", {
      cancelled: () => !deleted,
      onUpdate: () => { if (deleted) runtime.storage.deleteAccount(runtime.account.id) },
    })
    assert.equal(runtime.state.calls.length, 1)
  }
  const runtime = setup()
  await runtime.fusion.loadFusion(runtime.account, "today")
  runtime.state.now += 86400_000
  const view = runtime.fusion.cachedFusion(runtime.account, "today")
  const tree = runtime.load("fusion-views").FusionWidgetView({ view, family: "systemSmall" })
  assert.match(textContent(tree), /10-14 AI 缓存/)
  assert.match(textContent(tree), /跨日缓存/)
  const app = runtime.load("fusion-views").FusionAnalytics({ account: runtime.account })
  assert.match(textContent(app), /10-14 缓存 · 请求/)
  assert.match(textContent(app), /10-14 AI 缓存 · Neurons/)
})

test("融合 App 的真实 effect 仅查询两套七日数据，不额外启动原 Workers 页面查询", async () => {
  const runtime = setup({ captureEntry: true })
  runtime.load("index"); await runtime.state.entryPromise
  const cleanups = runtime.state.effects.map(effect => effect())
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(runtime.state.calls.length, 14)
  const view = runtime.state.hooks[8]
  assert.equal(view.period, "7d")
  assert.equal(view.workers.days.length, 7)
  assert.equal(view.ai.days.length, 7)
  assert.equal(runtime.state.hooks[9], false)
  assert.match(runtime.state.hooks[10], /Workers：刷新完成.*AI：刷新完成/)
  for (const cleanup of cleanups) cleanup?.()
})

test("融合手动刷新直接启动，成功/失败/冷却反馈可见，时段切换不改变今日额度", async () => {
  const runtime = setup({ initialHooks: ["today"] })
  const tree = runtime.load("fusion-views").FusionAnalytics({ account: runtime.account })
  const button = nodes(tree, "Button").find(node => node.props.title === "刷新融合数据")
  const work = button.props.action()
  assert.equal(runtime.state.calls.length, 1)
  assert.equal(runtime.state.hooks[2], true)
  await work
  assert.equal(runtime.state.calls.length, 2)
  assert.equal(runtime.state.hooks[2], false)
  assert.match(runtime.state.hooks[3], /Workers：刷新完成.*AI：刷新完成/)
  await button.props.action()
  assert.equal(runtime.state.calls.length, 2)
  assert.match(runtime.state.hooks[3], /冷却至/)
  const picker = nodes(tree, "Picker").find(node => node.props.title === "融合统计时段")
  picker.props.onChanged("7d"); assert.equal(runtime.state.hooks[0], "7d")
  assert.equal(runtime.fusion.cachedFusion(runtime.account, "today").workers.days[0].requests, 3511)
})

test("三个融合 Widget 的真实入口优先今日并复用 App 历史，原参数保持原独立视图", async () => {
  for (const family of ["systemSmall", "systemMedium", "systemLarge"]) {
    const runtime = setup({ family, captureEntry: true, parameter: "fusion:local-test" })
    await runtime.fusion.loadFusion(runtime.account, "7d")
    const before = runtime.state.calls.length
    runtime.load("widget"); await runtime.state.entryPromise
    assert.equal(runtime.state.calls.length, before)
    const text = textContent(runtime.state.presented.element)
    assert.match(text, /3,511/); assert.match(text, /2,750.125/)
    assert.match(text, family === "systemLarge" ? /独立刻度.*W\s*7\s*\/7 · AI\s*7\s*\/7/ : /AI/)
    assert.equal(runtime.state.presented.policy.policy, "after")
    assert.ok(nodes(runtime.state.presented.element, "ProgressView").every(node => node.props.value >= 0 && node.props.value <= 1))
  }
})

test("融合大号缺失历史保持缺失，两项图表各自刻度；付费 Workers 不套免费额度", () => {
  const runtime = setup(), views = runtime.load("fusion-views")
  const view = runtime.fusion.cachedFusion(runtime.account, "7d")
  const empty = views.FusionWidgetView({ view, family: "systemLarge" })
  assert.match(textContent(empty), /W\s*0\s*\/7 · AI\s*0\s*\/7/)
  assert.equal(nodes(empty, "RoundedRectangle").length, 0, "缺失日不得绘制数据柱")
  const paid = views.FusionWidgetView({ view: { ...view, account: { ...view.account, plan: "paid" } }, family: "systemLarge" })
  assert.match(textContent(paid), /Paid.*无免费日额度/)
  assert.doesNotMatch(textContent(paid), /100,000/)
  assert.match(textContent(paid), /10,000 N/)
})

test("紧凑和标准尺寸的融合数字列与圆环分别保留宽度，95% 长数字可独立缩放", async () => {
  const runtime = setup(), views = runtime.load("fusion-views")
  const view = await runtime.fusion.loadFusion(runtime.account, "today")
  view.workers.days[0].requests = 95340; view.ai.days[0].neurons = 9740.5
  for (const [family, width, height] of [["systemSmall", 148, 148], ["systemSmall", 158, 158], ["systemMedium", 321, 148], ["systemMedium", 338, 158], ["systemLarge", 321, 329], ["systemLarge", 338, 354]]) {
    const layout = views.fusionLayout(family, { width, height })
    const tree = views.FusionWidgetView({ view, family, displaySize: { width, height } })
    const number = nodes(tree, "Text").find(node => textContent(node) === "95,340")
    assert.equal(number.props.font, 28)
    assert.equal(number.props.lineLimit, 1)
    assert.equal(number.props.frame.width + layout.ring + layout.numberGap, layout.left)
    assert.equal(number.props.minScaleFactor, 0.4)
    assert.match(textContent(tree), /95.3%/)
    assert.match(textContent(tree), /≥95%/)
  }
})
