import test from "node:test"
import assert from "node:assert/strict"
import { BASE_TIME, createRuntime, fixtureAccount, textContent } from "./harness.mjs"

function fixtureView(requests = 80_000, plan = "free") {
  const account = fixtureAccount({ plan })
  const day = { version: 1, dateUTC: "2026-10-14", fetchedAt: new Date(BASE_TIME).toISOString(), requests, errors: 0, workers: [{ name: "alpha", requests: 60_000, errors: 0 }, { name: "beta", requests: 15_000, errors: 0 }, { name: "gamma", requests: 5_000, errors: 0 }, { name: "delta", requests: 1, errors: 0 }], warnings: [] }
  return { account, period: "today", expectedDates: [day.dateUTC], days: [day], failures: [], missingDates: [], fromCache: false }
}
test("小号显示额度估算，中号显示 Top 3，大号包含 UTC 历史缺口", () => {
  const { WidgetView } = createRuntime().load("views")
  const view = fixtureView()
  const small = textContent(WidgetView({ view, family: "systemSmall", dates: [], history: [] }))
  assert.match(small, /80,000/)
  assert.match(small, /估算剩余 20.0k/)
  assert.match(small, /80.0%/)
  const medium = textContent(WidgetView({ view, family: "systemMedium", dates: [], history: [] }))
  assert.match(medium, /alpha/)
  assert.match(medium, /gamma/)
  assert.doesNotMatch(medium, /delta/)
  const large = textContent(WidgetView({ view, family: "systemLarge", dates: ["2026-10-13", "2026-10-14"], history: view.days }))
  assert.match(large, /近 7 个 UTC 日/)
  assert.match(large, /缺 1 天/)
})
test("付费 Widget 不显示免费日余额，未知用量不显示 100% 剩余", () => {
  const { WidgetView } = createRuntime().load("views")
  const paid = textContent(WidgetView({ view: fixtureView(80_000, "paid"), family: "systemSmall", dates: [], history: [] }))
  assert.match(paid, /付费 · 无免费日额度/)
  assert.doesNotMatch(paid, /估算剩余|100,000|80.0%/)
  const empty = textContent(WidgetView({ view: fixtureView(null), family: "systemSmall", dates: [], history: [] }))
  assert.match(empty, /暂无数据/)
  assert.match(empty, /估算剩余 —/)
  assert.doesNotMatch(empty, /100,000|100%/)
})
test("阈值颜色根据已确认用量变化；未知套餐无阈值警告", () => {
  const { quotaColor, palette } = createRuntime().load("views")
  assert.equal(quotaColor(fixtureAccount(), { requests: 80_000 }), palette.warning)
  assert.equal(quotaColor(fixtureAccount(), { requests: 95_000 }), palette.critical)
  assert.equal(quotaColor(fixtureAccount({ plan: "unknown" }), { requests: 95_000 }), palette.accent)
})
