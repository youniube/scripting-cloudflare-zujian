import test from "node:test"
import assert from "node:assert/strict"
import { analytics, BASE_TIME, createRuntime, fixtureAccount, fixtureCaps, plain, response } from "./harness.mjs"

function prepare(runtime, account = fixtureAccount()) {
  const storage = runtime.load("storage")
  const saved = storage.saveAccount(account, "secret-sentinel-readonly")
  storage.writeCapabilities(saved, fixtureCaps())
  return { storage, account: saved, service: runtime.load("service") }
}
function day(date = "2026-10-14", fetchedAt = BASE_TIME - 30 * 60_000, requests = 8765) {
  return { version: 1, dateUTC: date, queriedFrom: `${date}T00:00:00.000Z`, queriedTo: `${date}T11:00:00.000Z`, fetchedAt: new Date(fetchedAt).toISOString(), requests, errors: 2, workers: [{ name: "cached-worker", requests, errors: 2 }], warnings: [] }
}

test("Token 只在 Keychain，配置白名单不会保存偷偷附带的 token 属性", () => {
  const runtime = createRuntime()
  const { storage, account } = prepare(runtime, fixtureAccount({ token: "do-not-serialize-me", apiToken: "do-not-serialize-me" }))
  assert.equal(storage.readToken(account.id), "secret-sentinel-readonly")
  const persisted = JSON.stringify([...runtime.state.storage])
  assert.doesNotMatch(persisted, /secret-sentinel|do-not-serialize-me|apiToken/)
  assert.equal(runtime.state.keychain.size, 1)
})
test("多账号选择和 Widget 参数固定账号，重复显示名明确报错", () => {
  const runtime = createRuntime()
  const { storage, account } = prepare(runtime)
  const second = storage.saveAccount(fixtureAccount({ id: "other", accountId: "b".repeat(32), displayName: "第二账号", plan: "paid" }), "second-secret")
  storage.selectAccount(second.id)
  assert.equal(storage.resolveWidgetAccount("").id, second.id)
  assert.equal(storage.resolveWidgetAccount(account.accountId).id, account.id)
  assert.equal(storage.resolveWidgetAccount("第二账号").id, second.id)
  assert.throws(() => storage.resolveWidgetAccount("invalid"), error => error.kind === "configuration")
  runtime.state.now++
  storage.saveAccount({ ...second, displayName: account.displayName }, "")
  assert.throws(() => storage.resolveWidgetAccount(account.displayName), error => error.kind === "configuration")
  assert.equal(storage.readToken(second.id), "second-secret")
})
test("存储/Keychain 写入失败恢复原凭据，删除只清理所选账号", () => {
  const runtime = createRuntime()
  const { storage, account } = prepare(runtime)
  storage.writeDay(account, day())
  runtime.state.storage.set("unrelated-setting", { keep: true })
  runtime.state.storageFail = true
  assert.throws(() => storage.saveAccount({ ...account, displayName: "新名称" }, "replacement-secret"), error => error.kind === "storage")
  assert.equal(storage.readToken(account.id), "secret-sentinel-readonly")
  runtime.state.storageFail = false
  runtime.state.keychainFail = true
  assert.throws(() => storage.saveAccount({ ...account, displayName: "新名称" }, "replacement-secret"), error => error.kind === "storage")
  assert.equal(storage.getSettings().accounts[0].displayName, account.displayName)
  runtime.state.keychainFail = false
  storage.deleteAccount(account.id)
  assert.equal(storage.getSettings().accounts.length, 0)
  assert.equal(runtime.state.keychain.size, 0)
  assert.equal(storage.readDay(account.id, "2026-10-14"), undefined)
  assert.deepEqual(runtime.state.storage.get("unrelated-setting"), { keep: true })
})
test("配置更改后不接受旧请求结果，Account ID 改变会清理旧统计", () => {
  const runtime = createRuntime()
  const { storage, account } = prepare(runtime)
  storage.writeDay(account, day())
  runtime.state.now++
  const updated = storage.saveAccount({ ...account, accountId: "c".repeat(32) }, "new-secret")
  assert.equal(storage.readDay(updated.id, "2026-10-14"), undefined)
  assert.throws(() => storage.writeDay(account, day()), error => error.kind === "configuration")
})
test("缓存最多保留 40 个 UTC 日，统计与私有凭据独立", () => {
  const runtime = createRuntime()
  const { storage, account } = prepare(runtime)
  for (let i = 0; i < 45; i++) storage.writeDay(account, day(new Date(BASE_TIME - i * 86400000).toISOString().slice(0, 10)))
  assert.equal([...runtime.state.storage.keys()].filter(key => key.includes(".day.")).length, 40)
  assert.equal(storage.latestDay(account.id).dateUTC, "2026-10-14")
  assert.equal(storage.readToken(account.id), "secret-sentinel-readonly")
})
test("同账号并发加载只发送一轮网络请求，成功数据跨 Widget 复用", async () => {
  let complete
  const runtime = createRuntime({ fetch: () => new Promise(resolve => { complete = resolve }) })
  const { account, service } = prepare(runtime)
  const first = service.loadMonitor(account, "today")
  const second = service.loadMonitor(account, "today")
  assert.equal(runtime.state.calls.length, 1)
  complete(response(analytics()))
  const [a, b] = await Promise.all([first, second])
  assert.equal(a.days[0].requests, 100)
  assert.equal(b.days[0].requests, 100)
  await service.loadMonitor(account, "today", { widget: true })
  assert.equal(runtime.state.calls.length, 1)
})
test("网络失败保留同日成功数据与原更新时间，错误不泄露原始异常", async () => {
  const runtime = createRuntime({ fetch: async () => { throw new Error("Bearer secret-sentinel-readonly") } })
  const { account, storage, service } = prepare(runtime)
  const previous = day()
  storage.writeDay(account, previous)
  const result = await service.loadMonitor(account, "today", { force: true })
  assert.equal(result.days[0].requests, 8765)
  assert.equal(result.days[0].fetchedAt, previous.fetchedAt)
  assert.equal(result.fromCache, true)
  assert.equal(result.failures[0].kind, "network")
  assert.doesNotMatch(JSON.stringify([...runtime.state.storage]), /secret-sentinel-readonly/)
})
test("跨 UTC 零点失败时旧数据保留原日期，今日保持缺失", async () => {
  const runtime = createRuntime({ now: Date.parse("2026-10-14T00:02:00Z"), fetch: async () => { throw new Error("offline") } })
  const { account, storage, service } = prepare(runtime)
  storage.writeDay(account, day("2026-10-13", Date.parse("2026-10-13T23:59:00Z")))
  const result = await service.loadMonitor(account, "today", { widget: true })
  assert.equal(result.days.length, 0)
  assert.equal(result.missingDates[0], "2026-10-14")
  assert.equal(result.previousDay.dateUTC, "2026-10-13")
  const node = runtime.load("views").WidgetView({ view: result, family: "systemMedium", dates: [], history: [] })
  const { textContent } = await import("./harness.mjs")
  assert.match(textContent(node), /10-13 旧缓存/)
  assert.match(textContent(node), /缓存日 Top 3/)
})
test("首次 Widget 不猜 Schema，提示先在 App 验证", async () => {
  const runtime = createRuntime()
  const storage = runtime.load("storage")
  const account = storage.saveAccount(fixtureAccount(), "fixture-secret")
  const result = await runtime.load("service").loadMonitor(account, "today", { widget: true })
  assert.equal(result.failures[0].kind, "configuration")
  assert.equal(runtime.state.calls.length, 0)
})
test("API 限流冷却期间手动刷新也不重复请求", async () => {
  const runtime = createRuntime({ fetch: async () => response({ errors: [{ message: "Too many requests" }] }, 429, { "retry-after": "300" }) })
  const { account, service } = prepare(runtime)
  const first = await service.loadMonitor(account, "today")
  assert.equal(first.failures[0].kind, "rateLimit")
  runtime.state.now += 90_000
  const second = await service.loadMonitor(account, "today", { force: true })
  assert.equal(second.failures[0].kind, "rateLimit")
  assert.equal(runtime.state.calls.length, 1)
  const reload = service.suggestedReload(BASE_TIME, first.failures[0])
  assert.ok(reload.getTime() >= Date.parse(first.failures[0].retryAt))
})
test("今日加载后立即切到 30 天，会获取历史而不是被账号防抖阻塞", async () => {
  const runtime = createRuntime()
  const { account, service } = prepare(runtime)
  await service.loadMonitor(account, "today")
  const history = await service.loadMonitor(account, "30d")
  assert.equal(history.days.length, 30)
  assert.equal(runtime.state.calls.length, 30)
  assert.equal(history.missingDates.length, 0)
})
test("历史保留期限制不会伪造缺失日期为 0", async () => {
  const runtime = createRuntime()
  const { account, storage, service } = prepare(runtime)
  storage.writeCapabilities(account, fixtureCaps({ notOlderThan: 3 * 86400 }))
  const history = await service.loadMonitor(account, "7d")
  assert.equal(history.days.length, 3)
  assert.equal(history.missingDates.length, 4)
  assert.ok(history.failures.every(item => item.kind === "retention"))
  assert.deepEqual(plain(history.days.map(item => item.dateUTC)), ["2026-10-12", "2026-10-13", "2026-10-14"])
})
test("午夜刷新建议按 UTC，而不是本地零点", () => {
  const { suggestedReload } = createRuntime().load("service")
  const now = Date.parse("2026-10-13T23:50:00Z")
  assert.equal(suggestedReload(now).toISOString(), "2026-10-14T00:01:00.000Z")
})
