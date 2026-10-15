import test from "node:test"
import assert from "node:assert/strict"
import { analytics, BASE_TIME, createRuntime, fixtureAccount, fixtureCaps, plain, response, textContent } from "./harness.mjs"

function nodes(value, type) {
  if (!value || typeof value !== "object") return []
  if (Array.isArray(value)) return value.flatMap(child => nodes(child, type))
  return [...(value.type === type ? [value] : []), ...Object.values(value.props ?? {}).flatMap(child => nodes(child, type))]
}
function allText(element) { return nodes(element, "Text").map(textContent).join(" ") }
async function launch(runtime) {
  runtime.load("index")
  assert.ok(runtime.state.entryPromise, "must execute and capture the real App startup call")
  await runtime.state.entryPromise
  return runtime.state.presented.element
}
function settings(account) { return { version: 1, accounts: [account], selectedId: account.id } }

test("首次启动无账号也能显示主界面，并进入安全的账号设置页", async () => {
  const runtime = createRuntime({ captureEntry: true })
  const element = await launch(runtime)
  assert.equal(nodes(element, "List")[0].props.navigationTitle, "Workers 额度")
  assert.match(allText(element), /开始监控/)
  assert.match(allText(element), /添加 Cloudflare 账号与只读 API Token/)
  assert.doesNotMatch(allText(element), /今日调用估算|Worker 明细与排名/)
  assert.equal(runtime.state.calls.length, 0)

  const add = nodes(element, "Button").find(node => node.props.title === "添加账号")
  assert.ok(add)
  await add.props.action()
  const editor = runtime.state.presentations[1].element
  assert.equal(nodes(editor, "List")[0].props.navigationTitle, "添加账号")
  assert.ok(nodes(editor, "TextField").some(node => node.props.title === "Account ID"))
  assert.equal(nodes(editor, "SecureField")[0].props.title, "API Token")
  assert.equal(nodes(editor, "SecureField")[0].props.value, "")
  assert.equal(runtime.state.calls.length, 0)
  assert.equal(runtime.state.storage.size, 0)
  assert.equal(runtime.state.keychain.size, 0)
})

test("已有账号但查询尚未完成时，主界面保留账号管理和未知用量状态", async () => {
  const account = fixtureAccount()
  const storage = new Map([["cf-workers-meter.v1.settings", settings(account)]])
  const element = await launch(createRuntime({ captureEntry: true, storage }))
  assert.match(allText(element), /测试账号/)
  assert.match(allText(element), /账号管理/)
  assert.match(allText(element), /暂无 Worker 调用记录/)
  assert.ok(nodes(element, "Button").some(node => node.props.title === "手动刷新"))
})

test("主界面只显示当前账号与时段的数据，账号被清空时回到配置入口", async () => {
  const account = fixtureAccount()
  const day = { version: 1, dateUTC: "2026-10-14", fetchedAt: new Date(BASE_TIME).toISOString(), requests: 100, errors: 0, workers: [{ name: "current-worker", requests: 100, errors: 0 }], warnings: [] }
  const view = { account, period: "today", expectedDates: [day.dateUTC], days: [day], failures: [], missingDates: [], fromCache: false }
  const cases = [
    { profile: settings(account), view, visible: true },
    { profile: settings(account), view: { ...view, account: fixtureAccount({ id: "other-account" }) }, visible: false },
    { profile: settings(account), view: { ...view, period: "yesterday" }, visible: false },
    { profile: { version: 1, accounts: [], selectedId: null }, view, visible: false },
  ]
  for (const item of cases) {
    const runtime = createRuntime({ captureEntry: true, initialHooks: [item.profile, "today", item.view] })
    const content = allText(await launch(runtime))
    assert.equal(content.includes("current-worker"), item.visible)
    if (!item.profile.accounts.length) assert.match(content, /开始监控/)
  }
})

test("历史时段通过带标题的菜单行选择，四个时段均可切换且查询中禁用", async () => {
  const account = fixtureAccount()
  for (const busy of [false, true]) {
    const runtime = createRuntime({ captureEntry: true, initialHooks: [settings(account), "today", null, busy] })
    const element = await launch(runtime)
    const history = nodes(element, "Section").find(node => textContent(node.props.header) === "历史 · UTC 自然日")
    const picker = nodes(history, "Picker").find(node => node.props.title === "统计时段")
    assert.ok(picker, "历史时段需要一个具名的可见操作入口")
    assert.equal(picker.props.pickerStyle, "menu")
    assert.equal(picker.props.value, "today")
    assert.equal(picker.props.disabled, busy)
    const options = nodes(picker, "Text").map(node => ({ tag: node.props.tag, title: textContent(node) }))
    assert.deepEqual(plain(options), [
      { tag: "today", title: "今日" }, { tag: "yesterday", title: "昨日" },
      { tag: "7d", title: "7 天" }, { tag: "30d", title: "30 天" },
    ])
    if (!busy) {
      for (const option of options) {
        picker.props.onChanged(option.tag)
        assert.equal(runtime.state.hooks[1], option.tag)
        assert.equal(runtime.state.hooks[5], 0, "时段变更只由 period 驱动一次，不再叠加另一轮 reload")
      }
    }
  }
})

test("今日刷新后从菜单切换七天，通过真实 App effect 补取六天并共享给大号趋势", async () => {
  const runtime = createRuntime({ captureEntry: true })
  const storage = runtime.load("storage")
  const account = storage.saveAccount(fixtureAccount(), "test-only-secret")
  storage.writeCapabilities(account, fixtureCaps())
  await runtime.load("service").loadMonitor(account, "today")
  assert.equal(runtime.state.calls.length, 1)
  const element = await launch(runtime)
  const picker = nodes(element, "Picker").find(node => node.props.title === "统计时段")
  assert.ok(picker)
  picker.props.onChanged("7d")

  // 下一次 JS 渲染继承 hooks 和持久缓存；不模拟 SwiftUI 的原生控件呈现。
  const next = createRuntime({
    captureEntry: true, initialHooks: runtime.state.hooks,
    storage: runtime.state.storage, keychain: runtime.state.keychain,
  })
  await launch(next)
  const cleanup = next.state.effects[0]()
  await new Promise(resolve => setImmediate(resolve))
  const result = next.state.hooks[2]
  assert.equal(result.period, "7d")
  assert.equal(result.days.length, 7)
  assert.equal(result.missingDates.length, 0)
  assert.equal(result.failures.length, 0)
  assert.equal(next.state.calls.length, 6, "刚取得的今日数据必须复用，只补取六个缺失日")
  assert.equal(next.state.hooks[3], false)
  const history = next.load("service").cachedView(account, "7d")
  assert.equal(history.days.length, 7)
  const widget = next.load("views").WidgetView({
    view: next.load("service").cachedView(account, "today"), family: "systemLarge",
    dates: history.expectedDates, history: history.days,
  })
  assert.doesNotMatch(textContent(widget), /缺 \d+ 天/)
  cleanup()
})

test("手动刷新按钮直接启动查询，保留进度与完成反馈，不触发验证 API", async () => {
  let complete
  const runtime = createRuntime({ captureEntry: true, fetch: () => new Promise(resolve => { complete = resolve }) })
  const storage = runtime.load("storage")
  const account = storage.saveAccount(fixtureAccount(), "test-only-secret")
  storage.writeCapabilities(account, fixtureCaps())
  const element = await launch(runtime)
  const button = nodes(element, "Button").find(node => node.props.title === "手动刷新")
  assert.equal(button.props.buttonStyle, "borderless")
  const work = button.props.action()
  assert.equal(runtime.state.calls.length, 1, "点击直接进入请求，不依赖随后某次 effect")
  assert.equal(runtime.state.hooks[3], true)
  assert.match(runtime.state.hooks[4], /正在刷新/)
  assert.doesNotMatch(JSON.parse(runtime.state.calls[0].init.body).query, /__schema|__type/)
  complete(response(analytics(624)))
  await work
  assert.equal(runtime.state.hooks[3], false)
  assert.equal(runtime.state.hooks[2].days[0].requests, 624)
  assert.match(runtime.state.hooks[4], /刷新完成.*1 \/ 1 天/)
  const next = createRuntime({ captureEntry: true, initialHooks: runtime.state.hooks, storage: runtime.state.storage, keychain: runtime.state.keychain })
  assert.match(allText(await launch(next)), /刷新完成.*1 \/ 1 天/)
})

test("刷新冷却与占用都反馈原因，网络失败保留缓存并展示失败状态", async () => {
  for (const scenario of ["cooldown", "busy", "network"]) {
    const runtime = createRuntime({ captureEntry: true, fetch: async () => { throw new Error("offline secret-sentinel") } })
    const storage = runtime.load("storage")
    const account = storage.saveAccount(fixtureAccount(), "test-only-secret")
    storage.writeCapabilities(account, fixtureCaps())
    storage.writeDay(account, {
      version: 1, dateUTC: "2026-10-14", fetchedAt: new Date(BASE_TIME - 15 * 60_000).toISOString(),
      requests: 624, errors: 0, workers: [], warnings: [],
    })
    if (scenario === "cooldown") storage.markAttempt(account.id, BASE_TIME - 15_000)
    if (scenario === "busy") storage.acquireLease(account.id, 150_000, BASE_TIME)
    const element = await launch(runtime)
    await nodes(element, "Button").find(node => node.props.title === "手动刷新").props.action()
    assert.equal(runtime.state.hooks[3], false)
    assert.equal(runtime.state.hooks[2].days[0].requests, 624)
    assert.equal(runtime.state.calls.length, scenario === "network" ? 1 : 0)
    assert.match(runtime.state.hooks[4], scenario === "cooldown" ? /冷却.*重试/ : scenario === "busy" ? /已有查询.*稍后/ : /刷新未完成/)
    assert.doesNotMatch(runtime.state.hooks[4], /secret-sentinel/)
    if (scenario === "network") assert.equal(runtime.state.hooks[2].failures[0].kind, "network")
  }
})

test("七天页面点击手动刷新会补取缺失日，并保留完成天数", async () => {
  const runtime = createRuntime({ captureEntry: true })
  const storage = runtime.load("storage")
  const account = storage.saveAccount(fixtureAccount(), "test-only-secret")
  storage.writeCapabilities(account, fixtureCaps())
  await runtime.load("service").loadMonitor(account, "today")
  runtime.state.hooks = [settings(account), "7d"]
  const element = await launch(runtime)
  await nodes(element, "Button").find(node => node.props.title === "手动刷新").props.action()
  assert.equal(runtime.state.calls.length, 7)
  assert.equal(runtime.state.hooks[2].missingDates.length, 0)
  assert.match(runtime.state.hooks[4], /刷新完成.*7 \/ 7 天/)
})
