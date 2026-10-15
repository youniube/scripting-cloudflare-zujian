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
  assert.match(small, /估算剩余\s+20\.0%/)
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
  assert.match(paid, /Paid/i)
  assert.match(paid, /无日额度/)
  assert.doesNotMatch(paid, /估算剩余|100,000|80.0%/)
  const empty = textContent(WidgetView({ view: fixtureView(null), family: "systemSmall", dates: [], history: [] }))
  assert.match(empty, /暂无数据/)
  assert.match(empty, /估算剩余\s+—/)
  assert.doesNotMatch(empty, /100,000|100%/)
})
test("阈值颜色根据已确认用量变化；未知套餐无阈值警告", () => {
  const { quotaColor, palette } = createRuntime().load("views")
  assert.equal(quotaColor(fixtureAccount(), { requests: 80_000 }), palette.warning)
  assert.equal(quotaColor(fixtureAccount(), { requests: 95_000 }), palette.critical)
  assert.equal(quotaColor(fixtureAccount({ plan: "unknown" }), { requests: 95_000 }), palette.accent)
})

function nodes(node, type) {
  if (!node || typeof node !== "object") return []
  const children = node.props?.children ?? []
  return [...(node.type === type ? [node] : []), ...children.flatMap(child => nodes(child, type))]
}
test("三尺寸都在独立内容容器内留白，长账号名与 Worker 名称可收缩", () => {
  const { WidgetView, SetupWidget } = createRuntime().load("views")
  const view = fixtureView()
  view.account.displayName = "一个非常长的 Cloudflare 账号名称用于检查圆角边缘"
  view.days[0].workers[0].name = "a-worker-with-a-very-long-name-near-widget-edge"
  for (const [family, displaySize] of [
    ["systemSmall", { width: 148, height: 148 }],
    ["systemMedium", { width: 321, height: 148 }],
    ["systemLarge", { width: 321, height: 329 }],
  ]) {
    const root = WidgetView({ view, family, dates: [], history: [], displaySize })
    assert.ok(root.props.children[0].props.padding >= 12)
    assert.equal(root.props.padding, undefined, "padding belongs to inner content, background fills outer container")
    assert.equal(root.props.frame.width, undefined, "do not force full display width inside WidgetKit's content area")
    assert.ok(nodes(root, "Image").some(node => node.props.systemName === "cloud.fill"))
    const name = nodes(root, "Text").find(node => textContent(node) === view.account.displayName)
    assert.equal(name.props.lineLimit, 1)
    assert.equal(name.props.frame.minWidth, 0)
    assert.ok(name.props.minScaleFactor < 1)
    if (family !== "systemSmall") {
      const worker = nodes(root, "Text").find(node => textContent(node) === view.days[0].workers[0].name)
      assert.equal(worker.props.lineLimit, 1)
      assert.equal(worker.props.frame.minWidth, 0)
    }
  }
  assert.ok(SetupWidget({ message: "尚未配置账号" }).props.children[0].props.padding >= 12)
})

test("低用量显示 0.002%，小号剩余 99.998%，中大号剩余 99,998", () => {
  const { WidgetView } = createRuntime().load("views")
  const view = fixtureView(2)
  view.days[0].workers = [{ name: "javverse-rex", requests: 2, errors: 0 }]
  for (const family of ["systemSmall", "systemMedium", "systemLarge"]) {
    const root = WidgetView({ view, family, dates: [], history: [] })
    const content = textContent(root)
    assert.match(content, /0\.002%/)
    assert.match(content, family === "systemSmall" ? /99\.998%/ : /99,998/)
    assert.doesNotMatch(textContent(nodes(root, "ZStack")[0]), /0\.0%/)
    assert.doesNotMatch(content, /100\.0k/)
  }
  view.account = fixtureAccount({ plan: "custom", dailyLimit: 1_000_000_000 })
  view.days[0].requests = 1
  const verySmall = textContent(WidgetView({ view, family: "systemSmall", dates: [], history: [] }))
  assert.match(verySmall, /<100%/)
  assert.doesNotMatch(verySmall, /100\.000%/)
})

test("浅深色绑定覆盖背景、正文及告警，两个模式的小字对比度均达到 4.5", () => {
  const { WidgetView, SetupWidget, widgetTheme } = createRuntime().load("views")
  function luminance(hex) {
    const rgb = hex.slice(1).match(/../g).map(value => Number.parseInt(value, 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
  }
  for (const mode of ["light", "dark"]) {
    for (const background of [...widgetTheme.background[mode].gradient.map(stop => stop.color), widgetTheme.panel[mode]]) {
      const bg = luminance(background)
      for (const role of ["primary", "secondary", "brand", "accent", "warning", "critical"]) {
        const fg = luminance(widgetTheme[role][mode])
        assert.ok((Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05) >= 4.5, `${mode} ${role} on ${background}`)
      }
    }
  }
  for (const family of ["systemSmall", "systemMedium", "systemLarge"]) {
    const root = WidgetView({ view: fixtureView(), family, dates: [], history: [] })
    assert.equal(root.props.widgetBackground, widgetTheme.background)
    assert.equal(root.props.foregroundStyle, widgetTheme.primary)
    assert.notEqual(root.props.widgetBackground.light, root.props.widgetBackground.dark)
    assert.equal(root.props.preferredColorScheme, undefined)
  }
  const setup = SetupWidget({ message: "网络异常" })
  assert.equal(setup.props.foregroundStyle, widgetTheme.primary)
  assert.equal(setup.props.widgetBackground, widgetTheme.background)
})

test("大号根据可用高度控制排名密度，少量 Worker 时增加趋势图高度", () => {
  const { WidgetView, widgetLayout } = createRuntime().load("views")
  const narrow = { width: 321, height: 329 }
  const roomy = { width: 360, height: 376 }
  const one = widgetLayout("systemLarge", narrow, 1)
  const many = widgetLayout("systemLarge", narrow, 20)
  assert.ok(one.chartHeight > 40)
  assert.ok(one.chartHeight > many.chartHeight)
  assert.ok(many.rankLimit < widgetLayout("systemLarge", roomy, 20).rankLimit)
  assert.ok(many.chartHeight >= 28)
  assert.equal(widgetLayout("systemMedium", narrow, 20).rankLimit, 3)
  const view = fixtureView()
  view.days[0].workers = Array.from({ length: 20 }, (_, index) => ({ name: `worker-${index}`, requests: 100 - index, errors: 0 }))
  const content = textContent(WidgetView({ view, family: "systemLarge", dates: [], history: [], displaySize: narrow }))
  assert.match(content, /worker-0/)
  assert.match(content, new RegExp(`Top ${many.rankLimit} / 20`))
  assert.doesNotMatch(content, new RegExp(`worker-${many.rankLimit}(?: |$)`))
  const invalid = widgetLayout("systemLarge", { width: NaN, height: -1 }, 3)
  assert.ok(Number.isFinite(invalid.chartHeight) && invalid.chartHeight >= 28)
})

test("趋势图给所有 UTC 日期保留标签，缺数据留空，真实零值与缺失明确区分", () => {
  const { TrendBars, WidgetView } = createRuntime().load("views")
  const dates = ["2026-10-12", "2026-10-13", "2026-10-14"]
  const root = TrendBars({ dates, days: [{ dateUTC: dates[1], requests: 0 }, { dateUTC: dates[2], requests: 2 }], height: 80 })
  for (const label of ["10/12", "10/13", "10/14"]) assert.match(textContent(root), new RegExp(label))
  assert.equal(nodes(root, "RoundedRectangle").length, 1, "missing and zero dates must not get fake positive bars")
  const labels = nodes(root, "Text").map(textContent)
  assert.ok(labels.includes("—"))
  assert.ok(labels.includes("0"))
  assert.ok(labels.includes("2"))
  const view = fixtureView()
  const missing = WidgetView({ view, family: "systemLarge", dates, history: dates.map(date => ({ dateUTC: date, requests: null })) })
  assert.match(textContent(missing), /峰值\s+—/)
})

test("额度环精确使用原比例，零与未知不画假弧，超额只钳制几何图形", () => {
  const { QuotaRing } = createRuntime().load("views")
  for (const requests of [null, 0, 2, 42_680, 80_000, 95_000, 120_000]) {
    const view = fixtureView(requests)
    const root = QuotaRing({ account: view.account, day: view.days[0], size: 42 })
    const arcs = nodes(root, "Circle").filter(node => node.props.trim)
    assert.equal(arcs.length, requests !== null && requests > 0 ? 1 : 0)
    if (arcs.length) {
      assert.equal(arcs[0].props.trim.from, 0)
      assert.equal(arcs[0].props.trim.to, Math.min(1, requests / 100_000))
      assert.equal(arcs[0].props.rotationEffect, -90)
      const style = arcs[0].props.stroke.strokeStyle
      assert.ok(arcs[0].props.frame.width + style.lineWidth <= 42)
    }
    if (requests === 120_000) assert.match(textContent(root), /120\.0%/)
  }
  for (const plan of ["paid", "unknown"]) {
    const root = QuotaRing({ account: fixtureAccount({ plan }), day: fixtureView().days[0] })
    assert.equal(nodes(root, "Circle").filter(node => node.props.trim).length, 0)
    assert.ok(nodes(root, "Circle")[0].props.stroke.strokeStyle.dash)
    assert.doesNotMatch(textContent(root), /0\.0%|100%/)
  }
})

test("Worker 流量条使用独立账户总量，不按 Top 3 重新归一化或放大小流量", () => {
  const { WorkerBars } = createRuntime().load("views")
  const workers = [{ name: "a", requests: 75, errors: 0 }, { name: "b", requests: 25, errors: 0 }]
  const root = WorkerBars({ workers, total: 200 })
  assert.deepEqual(nodes(root, "ProgressView").map(node => node.props.value), [0.375, 0.125])
  const tiny = WorkerBars({ workers: [{ name: "tiny", requests: 2, errors: 0 }], total: 100_000 })
  assert.equal(nodes(tiny, "ProgressView")[0].props.value, 2 / 100_000)
  for (const total of [null, 0]) assert.equal(nodes(WorkerBars({ workers, total }), "ProgressView").length, 0)
})

test("大号错误数和错误率来自当前日，未知值不会冒充零错误", () => {
  const { WidgetView } = createRuntime().load("views")
  const view = fixtureView(42_680)
  view.days[0].errors = 13
  const root = WidgetView({ view, family: "systemLarge", dates: [], history: [] })
  const labels = nodes(root, "Text").map(textContent)
  assert.ok(labels.includes("错误"))
  assert.ok(labels.includes("13"))
  assert.ok(labels.includes("错误率"))
  assert.ok(labels.includes("0.030%"))
  view.days[0].requests = null
  view.days[0].errors = null
  const empty = WidgetView({ view, family: "systemLarge", dates: [], history: [] })
  assert.doesNotMatch(textContent(empty), /0\.0%/)
})

test("真实 Widget 仅使用原生符号与图形，未使用截图或远程图片替代界面", () => {
  const { WidgetView, widgetTheme, widgetQuotaColor } = createRuntime().load("views")
  for (const family of ["systemSmall", "systemMedium", "systemLarge"]) {
    const root = WidgetView({ view: fixtureView(), family, dates: [], history: [] })
    assert.ok(nodes(root, "Circle").some(node => node.props.trim))
    for (const image of nodes(root, "Image")) {
      assert.equal(image.props.systemName, "cloud.fill")
      assert.equal(image.props.imageUrl, undefined)
      assert.equal(image.props.filePath, undefined)
    }
  }
  assert.equal(widgetQuotaColor(fixtureAccount(), { requests: 42_680 }), widgetTheme.accent)
  assert.equal(widgetQuotaColor(fixtureAccount(), { requests: 80_000 }), widgetTheme.warning)
  assert.equal(widgetQuotaColor(fixtureAccount(), { requests: 95_000 }), widgetTheme.critical)
})

test("所有尺寸的付费与未确认套餐均不展示免费剩余或免费额度", () => {
  const { WidgetView } = createRuntime().load("views")
  for (const plan of ["paid", "unknown"]) {
    for (const family of ["systemSmall", "systemMedium", "systemLarge"]) {
      const content = textContent(WidgetView({ view: fixtureView(80_000, plan), family, dates: [], history: [] }))
      assert.doesNotMatch(content, /估算剩余|100,000|Free 日额度|80\.0%/)
    }
  }
})
