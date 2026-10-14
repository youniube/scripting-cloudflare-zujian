import test from "node:test"
import assert from "node:assert/strict"
import { BASE_TIME, createRuntime, fixtureAccount, textContent } from "./harness.mjs"

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
