/** Desktop approximation of the actual TSX view tree. Never used by iOS or packaged. */
import fs from "node:fs"
import { BASE_TIME, createRuntime, fixtureAccount } from "../tests/harness.mjs"

const { WidgetView, widgetTheme } = createRuntime().load("views")
const { AIWidgetView } = createRuntime().load("ai-views")
const { FusionWidgetView } = createRuntime().load("fusion-views")
const aiMode = process.argv.includes("--ai")
const fusionMode = process.argv.includes("--fusion")
const scenario = process.argv.includes("--spacing") ? "spacing" : process.argv.includes("--stress") ? "stress" : process.argv.includes("--low") ? "low" : "normal"
const dates = Array.from({ length: 7 }, (_, index) => `2026-10-${String(8 + index).padStart(2, "0")}`)
const requests = fusionMode ? scenario === "stress" ? 95_340 : scenario === "low" ? 2 : 3_511 : scenario === "spacing" ? 3_511 : scenario === "low" ? 2 : scenario === "stress" ? 95_000 : 42_680
const counts = fusionMode && scenario === "normal" ? [1_880, 973, 658] : scenario === "spacing" ? [1_880, 973, 658] : scenario === "low" ? [2] : scenario === "stress" ? [30_000, 25_000, 20_000, 10_000, 7_000, fusionMode ? 3_340 : 3_000] : [26_410, 11_350, 4_920]
const names = scenario === "stress" ? counts.map((_, index) => `a-long-worker-name-for-layout-verification-${index}`) : ["api-gateway", "image-proxy", "edge-cache"]
const day = { version: 1, dateUTC: dates[6], fetchedAt: new Date(BASE_TIME - 120_000).toISOString(), requests, errors: scenario === "low" ? 0 : 13, workers: counts.map((count, index) => ({ name: names[index], requests: count, errors: 0 })), warnings: [] }
const view = { account: fixtureAccount({ displayName: scenario === "stress" ? "非常长的 Cloudflare 账号名称" : "个人账号" }), period: "today", expectedDates: [day.dateUTC], days: [day], failures: [], missingDates: [], fromCache: false }
const history = scenario === "low" ? [day] : dates.map((date, index) => ({ ...day, dateUTC: date, requests: [18_240, 24_310, 19_820, 33_600, 29_450, 38_120, requests][index] }))
const aiDay = { version: 1, dateUTC: day.dateUTC, fetchedAt: day.fetchedAt, requests: 128, errors: 2, neurons: scenario === "stress" ? 9500.125 : 2750.125, inputTokens: 512000, outputTokens: 42000,
  models: [1620.125, 830, 300].map((neurons, index) => ({ name: ["@cf/meta/llama-3.3", "@cf/qwen/qwen3-30b", "@cf/baai/bge-m3"][index], neurons: scenario === "stress" ? neurons * 9500.125 / 2750.125 : neurons, requests: [70, 40, 18][index], inputTokens: 1000, outputTokens: 250 })), warnings: [] }
const aiView = { ...view, days: [aiDay] }
const aiHistory = dates.map((date, index) => ({ ...aiDay, dateUTC: date, neurons: [1400, 2400.5, 1700, 3100, 2200, 1980, aiDay.neurons][index] }))
if (fusionMode && scenario === "stress") { aiDay.models.forEach(model => { model.neurons *= 9740.5 / aiDay.neurons }); aiDay.neurons = 9740.5; aiHistory[6].neurons = aiDay.neurons }
if (fusionMode && process.argv.includes("--unknown")) {
  aiDay.neurons = null; aiDay.models.forEach(model => { model.neurons = null })
  aiHistory.forEach(day => { day.neurons = null })
}
if (fusionMode && process.argv.includes("--paid")) view.account.plan = "paid"
// 模拟真机反馈中的数据形状：长名称、三项 Worker、一个模型、AI 六天空缺。
// 使用通用名称；不复制用户账号、凭据或截图到公开产物。
if (fusionMode && process.argv.includes("--device-case")) {
  day.requests = 2441; day.errors = 0
  day.workers = [1524, 880, 37].map((requests, index) => ({ name: ["api-service", "application-link-formatter", "edge-proxy"][index], requests, errors: 0 }))
  history[6] = day
  aiDay.neurons = 56.278; aiDay.requests = 3; aiDay.errors = 0
  aiDay.models = [{ name: "@cf/qwen/qwen3-30b-a3b-fp8", neurons: 56.278, requests: 3, inputTokens: 1000, outputTokens: 250 }]
  aiHistory.splice(0, aiHistory.length, aiDay)
}
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
function resolve(value, mode) { return value && typeof value === "object" && "light" in value ? value[mode] : value }
function cssColor(value, mode) {
  value = resolve(value, mode)
  if (typeof value === "string") return value
  if (value?.gradient) {
    const angle = Math.atan2(value.endPoint.x - value.startPoint.x, -(value.endPoint.y - value.startPoint.y)) * 180 / Math.PI
    return `linear-gradient(${angle}deg,${value.gradient.map(stop => `${stop.color} ${stop.location * 100}%`).join(",")})`
  }
  return "transparent"
}
let gradientId = 0
function circle(node, mode) {
  const p = node.props, size = p.frame.width, style = p.stroke?.strokeStyle ?? {}, stroke = resolve(p.stroke?.shapeStyle ?? p.stroke, mode)
  const id = `gradient-${gradientId++}`
  const gradient = typeof stroke === "object" && stroke?.gradient
  const defs = gradient ? `<defs><linearGradient id="${id}" x1="${stroke.startPoint.x * 100}%" y1="${stroke.startPoint.y * 100}%" x2="${stroke.endPoint.x * 100}%" y2="${stroke.endPoint.y * 100}%">${gradient.map(stop => `<stop offset="${stop.location * 100}%" stop-color="${stop.color}"/>`).join("")}</linearGradient></defs>` : ""
  const circumference = Math.PI * size
  const dash = p.trim ? `${(p.trim.to - p.trim.from) * circumference} ${circumference}` : style.dash?.join(" ")
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="overflow:visible">${defs}<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${p.fill ? cssColor(p.fill, mode) : "none"}" stroke="${stroke ? gradient ? `url(#${id})` : stroke : "none"}" stroke-width="${style.lineWidth ?? 0}" stroke-linecap="${style.lineCap ?? "butt"}" ${dash ? `stroke-dasharray="${dash}"` : ""} transform="rotate(${p.rotationEffect ?? 0} ${size / 2} ${size / 2})"/></svg>`
}
function render(node, mode, parent = "", depth = 0) {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node !== "object") return escape(node)
  const p = node.props ?? {}, f = p.frame ?? {}, type = node.type
  const style = ["box-sizing:border-box", "min-width:0"]
  if (type === "VStack" || type === "HStack") {
    style.push("display:flex", `flex-direction:${type === "VStack" ? "column" : "row"}`, `gap:${p.spacing ?? 8}px`)
    const align = type === "VStack" ? p.alignment === "trailing" ? "flex-end" : p.alignment === "leading" ? "stretch" : "center" : { top: "flex-start", bottom: "flex-end", firstTextBaseline: "baseline" }[p.alignment] ?? "center"
    style.push(`align-items:${align}`)
    if (depth < 2) style.push("flex:1", "min-height:0")
  }
  if (type === "ZStack") style.push("display:grid", "place-items:center")
  if (parent === "ZStack") style.push("grid-area:1/1")
  if (p.foregroundStyle) style.push(`color:${cssColor(p.foregroundStyle, mode)}`)
  if (p.widgetBackground) style.push(`background:${cssColor(p.widgetBackground, mode)}`)
  if (p.background) {
    style.push(`background:${cssColor(p.background.style ?? p.background, mode)}`)
    if (p.background.shape) style.push(`border-radius:${p.background.shape.cornerRadius}px`)
  }
  if (typeof p.padding === "number") style.push(`padding:${p.padding}px`)
  else if (p.padding) style.push(`padding:${p.padding.top ?? p.padding.vertical ?? 0}px ${p.padding.trailing ?? p.padding.horizontal ?? 0}px ${p.padding.bottom ?? p.padding.vertical ?? 0}px ${p.padding.leading ?? p.padding.horizontal ?? 0}px`)
  if (typeof p.font === "number") style.push(`font-size:${p.font}px`, "line-height:1.2")
  if (p.fontWeight) style.push(`font-weight:${{ semibold: 600, bold: 700, medium: 500 }[p.fontWeight] ?? 400}`)
  if (p.fontDesign === "monospaced") style.push('font-family:"Consolas",monospace')
  if (p.monospacedDigit) style.push("font-variant-numeric:tabular-nums")
  if (p.kerning) style.push(`letter-spacing:${p.kerning}px`)
  if (f.width !== undefined) style.push(`width:${f.width}px`, "flex-shrink:0")
  if (f.height !== undefined) style.push(`height:${f.height}px`, "flex-shrink:0")
  if (f.maxWidth === "infinity") style.push(parent === "HStack" ? "flex:1" : "width:100%")
  if (f.alignment === "bottom") style.push("justify-content:flex-end")
  if (f.alignment === "trailing") style.push("text-align:right")
  let children = (p.children ?? []).map(child => render(child, mode, type, depth + 1)).join("")
  if (type === "Text") {
    style.push("display:block", "flex-shrink:1")
    if (p.lineLimit === 1) style.push("white-space:nowrap", "text-overflow:ellipsis", "overflow:hidden")
  }
  if (type === "Spacer") style.push("flex:1", "min-height:0", "min-width:0")
  if (type === "RoundedRectangle") style.push(`background:${cssColor(p.fill, mode)}`, `border-radius:${p.cornerRadius}px`)
  if (type === "Circle") children = circle(node, mode)
  if (type === "Image") { style.push("display:flex", "align-items:center", "justify-content:center", "font-size:16px"); children = "☁" }
  if (type === "ProgressView") {
    const barHeight = f.height ?? 3
    style.push("width:100%", `height:${barHeight}px`, `min-height:${barHeight}px`, `max-height:${barHeight}px`, "border-radius:3px", `background:${cssColor(widgetTheme.track, mode)}`)
    children = `<div style="height:${barHeight}px;border-radius:3px;background:${cssColor(p.tint, mode)};width:${(p.value ?? 0) * 100}%"></div>`
  }
  if (type === "DateLabel") children = "12:00:00"
  return `<div data-native="${type}" ${fusionMode && p.minScaleFactor ? `data-min-scale="${p.minScaleFactor}"` : ""} ${fusionMode && type === "Text" && p.fixedSize?.vertical ? `data-fixed-vertical="true" data-font-target="${p.font}"` : ""} style="${style.join(";")}">${children}</div>`
}
const sizes = scenario === "spacing" ? [["systemSmall", "小号", 158, 158], ["systemMedium", "中号", 338, 158]] : scenario === "stress" ? [["systemSmall", "小号", 148, 148], ["systemMedium", "中号", 321, 148], ["systemLarge", "大号", 321, 329]] : [["systemSmall", "小号", 158, 158], ["systemMedium", "中号", 338, 158], ["systemLarge", "大号", 338, 354]]
let columns = ""
for (const mode of ["dark", "light"]) {
  let cards = ""
  for (const [family, title, width, height] of sizes) {
    const fusion = { account: view.account, period: "7d", expectedDates: dates, workers: { ...view, days: history }, ai: { ...aiView, days: aiHistory } }
    const today = { ...fusion, period: "today", expectedDates: [day.dateUTC], workers: view, ai: aiView }
    const tree = fusionMode ? FusionWidgetView({ view: fusion, today, family, displaySize: { width, height } }) : aiMode ? AIWidgetView({ view: aiView, family, dates, history: aiHistory, displaySize: { width, height } }) : WidgetView({ view, family, dates, history, displaySize: { width, height } })
    cards += `<section><p>${title} · ${width} × ${height} pt</p>${fusionMode ? `<div class="reference-slot" style="width:${width}px;height:${height}px">` : ""}<div class="widget" data-widget="${family}-${mode}" style="width:${width}px;height:${height}px">${render(tree, mode)}</div>${fusionMode ? "</div>" : ""}</section>`
  }
  columns += `<article class="${mode}"><h2>${mode === "dark" ? "深色 · Premium Dashboard" : "浅色 · Adaptive Light"}</h2>${cards}</article>`
}
const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><title>Cloudflare Workers — TSX 视图树桌面参考</title><style>*{box-sizing:border-box}body{margin:0;padding:22px 28px;background:#e4eaf2;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:#263448}h1{margin:0 0 8px;font-size:21px;letter-spacing:-.6px}.notice{font-size:11px;margin-bottom:18px;line-height:1.8}main{display:flex;gap:24px}article{width:480px;border-radius:20px;padding:18px 20px;background:#f0f3f8}.dark{background:#202b3b;color:#d8e1ed}h2{font-size:14px;margin:0 0 14px}section{display:flex;flex-direction:column;align-items:center;margin-bottom:18px}section p{font-size:10px;margin:0 0 8px;opacity:.75}.widget{display:flex;border-radius:22px;overflow:hidden}.widget svg{display:block;flex-shrink:0}</style><h1>Cloudflare Workers · A + C 融合实现</h1><div class="notice">由实际 TSX 视图树生成的桌面近似排版 · ${scenario} 场景 / 模拟数据 · 不是 Scripting 原生预览或 iPhone 真机截图。<br>圆环与流量条直接读取被测组件的数值；SwiftUI 字体、缩放、裁切和系统主题切换仍需在手机验证。</div><main>${columns}</main><script>window.scrollTo(0,0);history.scrollRestoration='manual';const issues=[];for(const card of document.querySelectorAll('[data-widget]')){const b=card.getBoundingClientRect();for(const text of card.querySelectorAll('[data-native="Text"]')){const r=text.getBoundingClientRect();if(r.left<b.left+7||r.right>b.right-7||r.top<b.top+5||r.bottom>b.bottom-5)issues.push({widget:card.dataset.widget,text:text.textContent})}}document.body.dataset.edgeIssues=JSON.stringify(issues)</script></html>`
const variant = process.argv.includes("--device-case") ? "-device-case" : process.argv.includes("--unknown") ? "-unknown" : process.argv.includes("--paid") ? "-paid" : scenario === "normal" ? "" : "-" + scenario
const filename = fusionMode ? `widget-fusion-native-preview${variant}.html` : aiMode ? `widget-ai-preview${scenario === "normal" ? "" : "-" + scenario}.html` : scenario === "normal" ? "widget-preview.html" : `widget-preview-${scenario}.html`
// 桌面模拟 minScaleFactor；生产 TSX 仅使用 Scripting 的原生文字缩放。
const fitScript = `<script>function fitNumbers(){for(const el of document.querySelectorAll('[data-min-scale]')){const base=Number(el.dataset.baseFont)||parseFloat(getComputedStyle(el).fontSize);el.dataset.baseFont=base;const min=base*Number(el.dataset.minScale);el.style.fontSize=base+'px';const range=document.createRange();range.selectNodeContents(el);let font=base;while(range.getBoundingClientRect().width>el.clientWidth+.2&&font>min){font=Math.max(min,font-.25);el.style.fontSize=font+'px'}}}fitNumbers();window.addEventListener('resize',fitNumbers);document.fonts.ready.then(fitNumbers)</script>`
let output = aiMode ? html.replaceAll("Cloudflare Workers · A + C 融合实现", "Cloudflare Workers AI · Neurons") : html
if (fusionMode) {
  const fitReferences = `<script>function fitReferences(){for(const card of document.querySelectorAll('[data-widget]'))card.style.transform='';fitNumbers();for(const card of document.querySelectorAll('[data-widget]')){const article=card.closest('article'),width=parseFloat(card.style.width),height=parseFloat(card.style.height),available=article.clientWidth-parseFloat(getComputedStyle(article).paddingLeft)-parseFloat(getComputedStyle(article).paddingRight),scale=Math.min(1,available/width);card.style.transform='scale('+scale+')';card.style.transformOrigin='top left';card.parentElement.style.width=width*scale+'px';card.parentElement.style.height=height*scale+'px'}}fitReferences();addEventListener('resize',fitReferences);document.fonts.ready.then(fitReferences)</script>`
  output = output.replaceAll("Cloudflare Workers · A + C 融合实现", "Cloudflare · Workers + AI 融合版原生视图树").replace("<meta charset=\"utf-8\">", '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">').replace("</html>", fitScript + fitReferences + "</html>").replace("main{display:flex;gap:24px}", "main{display:flex;gap:24px;flex-wrap:wrap}").replace(".widget{display:flex;", ".widget{font-size:10px;display:flex;").replace("</style>", "@media(max-width:600px){body{padding:18px 12px}article{width:100%;padding:18px 10px}main{gap:18px}.notice{font-size:11px}h1{font-size:18px}}</style>")
}
fs.writeFileSync(new URL(`../docs/${filename}`, import.meta.url), output)
console.log(`Generated docs/${filename}; desktop approximation only.`)
