import test from "node:test"
import assert from "node:assert/strict"
import { BASE_TIME, createRuntime, fixtureAccount, plain } from "./harness.mjs"

test("UTC 日期不使用上海本地零点，跨年/闰日范围正确", () => {
  const core = createRuntime().load("core")
  const shanghaiMidnight = Date.parse("2026-10-14T00:10:00+08:00")
  assert.equal(core.utcDate(shanghaiMidnight), "2026-10-13")
  assert.equal(core.utcStart("2026-10-13"), Date.parse("2026-10-13T00:00:00Z"))
  assert.equal(core.nextReset(shanghaiMidnight).toISOString(), "2026-10-14T00:00:00.000Z")
  assert.deepEqual(plain(core.periodDates("7d", Date.parse("2024-03-02T03:00:00Z"))), ["2024-02-25", "2024-02-26", "2024-02-27", "2024-02-28", "2024-02-29", "2024-03-01", "2024-03-02"])
  assert.equal(core.periodDates("30d", Date.parse("2026-01-04T01:00:00Z"))[0], "2025-12-06")
  assert.equal(core.periodDates("yesterday", BASE_TIME)[0], "2026-10-13")
  assert.throws(() => core.utcStart("2026-02-29"), error => error.kind === "configuration")
})
test("免费额度需确认；付费/未知套餐不推算免费余额", () => {
  const { quota } = createRuntime().load("core")
  assert.equal(quota(fixtureAccount(), 80_000).limit, 100_000)
  assert.equal(quota(fixtureAccount({ plan: "paid", dailyLimit: 100_000 }), 80_000).limit, null)
  assert.equal(quota(fixtureAccount({ plan: "unknown" }), 80_000).ratio, null)
  assert.equal(quota(fixtureAccount({ verifiedAt: undefined }), 80_000).remaining, null)
  assert.equal(quota(fixtureAccount(), null).remaining, null)
  assert.equal(quota(fixtureAccount(), 0).remaining, 100_000)
})
test("80%、95% 阈值与超额进度保留实际比值", () => {
  const { quota } = createRuntime().load("core")
  assert.equal(quota(fixtureAccount(), 79_999).level, "normal")
  assert.equal(quota(fixtureAccount(), 80_000).level, "warning")
  assert.equal(quota(fixtureAccount(), 95_000).level, "critical")
  assert.equal(quota(fixtureAccount(), 120_000).remaining, 0)
  assert.equal(quota(fixtureAccount(), 120_000).ratio, 1.2)
})
test("自定义日阈值要求可验证来源与正整数", () => {
  const { validateAccount, quota } = createRuntime().load("core")
  const custom = fixtureAccount({ plan: "custom", dailyLimit: 250_000 })
  validateAccount(custom)
  assert.equal(quota(custom, 50_000).remaining, 200_000)
  assert.throws(() => validateAccount({ ...custom, verificationNote: "" }))
  assert.throws(() => validateAccount({ ...custom, dailyLimit: 0 }))
  assert.throws(() => validateAccount({ ...custom, dailyLimit: 1.5 }))
  assert.throws(() => validateAccount({ ...custom, accountId: "Zone-ID" }))
})
test("多日排名只合并可加指标，不错误合并 CPU 分位数", () => {
  const { rankWorkers } = createRuntime().load("core")
  const days = [{ workers: [{ name: "a", requests: 10, errors: 1, cpuP50: 5 }, { name: "b", requests: 15, errors: 2, cpuP50: 3 }] }, { workers: [{ name: "a", requests: 30, errors: 4, cpuP50: 7 }] }]
  assert.deepEqual(plain(rankWorkers(days)), [{ name: "a", requests: 40, errors: 5 }, { name: "b", requests: 15, errors: 2 }])
  assert.equal(rankWorkers([days[0]])[1].cpuP50, 5)
})
test("空数据与确切零请求保持区分", () => {
  const { totalRequests, formatNumber, fraction } = createRuntime().load("core")
  assert.equal(totalRequests([{ requests: null }]), null)
  assert.equal(totalRequests([{ requests: 0 }]), 0)
  assert.equal(formatNumber(null), "—")
  assert.equal(formatNumber(100_000), "100,000")
  assert.equal(fraction(0, 0), "—")
})

test("很小的正百分比不会被四舍五入成零，阈值与超额比例保持原显示", () => {
  const { percent } = createRuntime().load("core")
  assert.equal(percent(2 / 100_000), "0.002%")
  assert.equal(percent(1 / 100_000), "0.001%")
  assert.equal(percent(1 / 1_000_000), "<0.001%")
  assert.equal(percent(0), "0.0%")
  assert.equal(percent(0.8), "80.0%")
  assert.equal(percent(0.95), "95.0%")
  assert.equal(percent(1.2), "120.0%")
  assert.equal(percent(null), "—")
  assert.equal(percent(NaN), "—")
})
