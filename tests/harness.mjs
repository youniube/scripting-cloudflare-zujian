import ts from "typescript"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const scriptRoot = path.join(projectRoot, "scripts", "Cloudflare Workers Meter")
export const BASE_TIME = Date.parse("2026-10-14T12:00:00.000Z")
export function fixtureCaps(extra = {}) {
  return { checkedAt: new Date(BASE_TIME).toISOString(), maxPageSize: 500, maxDuration: 86400, notOlderThan: 90 * 86400, cpu: true, cpuUnit: "µs", excludePreview: true, ...extra }
}
export function fixtureAccount(extra = {}) {
  return { id: "local-test", accountId: "a".repeat(32), displayName: "测试账号", plan: "free", verifiedAt: new Date(BASE_TIME).toISOString(), verificationNote: "测试配置：模拟控制台确认", ...extra }
}
export function worker(name, requests, errors = 0, cpu = 42) {
  return { dimensions: { scriptName: name }, sum: { requests, errors }, quantiles: { cpuTimeP50: cpu, cpuTimeP99: cpu * 2 } }
}
export function analytics(total = 100, entries = [worker("alpha", total, 2)]) {
  return { data: { viewer: { accounts: [{ total: total === null ? [] : [{ sum: { requests: total, errors: 2 } }], workers: entries }] } }, errors: null }
}
export function response(payload, status = 200, headers = {}) {
  return { ok: status >= 200 && status < 300, status, headers: { get: name => headers[name.toLowerCase()] ?? null }, json: async () => payload }
}
export function createRuntime(options = {}) {
  const state = {
    now: options.now ?? BASE_TIME, storage: options.storage ?? new Map(), keychain: options.keychain ?? new Map(),
    calls: [], storageFail: false, keychainFail: false, performFetch: options.fetch ?? (async () => response(analytics())), presented: null,
    hooks: [...(options.initialHooks ?? [])], effects: [], presentations: [], dialogs: [], exitCount: 0, entryPromise: null,
  }
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [state.now])) }
    static now() { return state.now }
  }
  const clone = value => JSON.parse(JSON.stringify(value))
  const native = {}
  for (const name of ["Text", "VStack", "HStack", "ZStack", "Circle", "Image", "Spacer", "Divider", "RoundedRectangle", "ProgressView", "DateLabel", "Chart", "BarChart", "NavigationStack", "List", "Section", "Button", "Picker", "TextField", "SecureField", "Toggle"]) {
    native[name] = Object.assign(props => ({ type: name, props }), { native: true })
  }
  let hookIndex = 0
  Object.assign(native, {
    fetch: async (url, init) => { state.calls.push({ url, init }); return state.performFetch(url, init) },
    Widget: { family: options.family ?? "systemMedium", parameter: "", displaySize: { width: 360, height: 170 }, present: (element, policy) => { state.presented = { element, policy } }, reloadAll: () => {}, preview: async () => {} },
    // Only model JavaScript's initial render, not SwiftUI layout or iOS presentation.
    useState: initial => {
      const index = hookIndex++
      if (!Object.hasOwn(state.hooks, index)) state.hooks[index] = typeof initial === "function" ? initial() : initial
      return [state.hooks[index], value => { state.hooks[index] = typeof value === "function" ? value(state.hooks[index]) : value }]
    },
    useEffect: effect => { state.effects.push(effect) },
    Navigation: {
      useDismiss: () => () => {},
      present: async options => { state.presented = options; state.presentations.push(options) },
    },
    Dialog: { alert: async options => { state.dialogs.push(options) }, confirm: async () => false },
    Script: { exit: () => { state.exitCount++ } },
  })
  const context = vm.createContext({
    Date: ClockDate,
    captureEntry: promise => { state.entryPromise = promise },
    Storage: {
      get: key => state.storage.has(key) ? clone(state.storage.get(key)) : null,
      set: (key, value) => { if (state.storageFail) return false; state.storage.set(key, clone(value)); return true },
      remove: key => { state.storage.delete(key) }, keys: () => [...state.storage.keys()],
    },
    Keychain: {
      get: key => state.keychain.get(key) ?? null,
      set: (key, value) => { if (state.keychainFail) return false; state.keychain.set(key, value); return true },
      remove: key => { if (state.keychainFail) return false; state.keychain.delete(key); return true },
    },
    createElement: (type, props, ...children) => {
      const merged = { ...(props ?? {}), children: children.flat(Infinity) }
      if (type.native) return type(merged)
      return type(merged)
    },
  })
  const modules = new Map()
  function load(file) {
    if (file === "scripting") return native
    const absolute = path.resolve(scriptRoot, file.endsWith(".ts") || file.endsWith(".tsx") ? file : file + (fs.existsSync(path.join(scriptRoot, file + ".ts")) ? ".ts" : ".tsx"))
    if (modules.has(absolute)) return modules.get(absolute).exports
    let source = fs.readFileSync(absolute, "utf8")
    if (options.captureEntry && path.basename(absolute) === "index.tsx") {
      // Capture the same startup call so a render exception becomes an awaited test failure.
      if (!/^void run\(\)\s*$/m.test(source)) throw new Error("App startup call was not found")
      source = source.replace(/^void run\(\)\s*$/m, "captureEntry(run())")
    }
    const output = ts.transpileModule(source, { fileName: absolute, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, jsxFactory: "createElement" } }).outputText
    const module = { exports: {} }
    modules.set(absolute, module)
    const wrapped = new vm.Script(`(function(require, module, exports) { ${output}\n})`, { filename: absolute }).runInContext(context)
    wrapped(load, module, module.exports)
    return module.exports
  }
  return { state, load, native }
}
export function textContent(node) {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (!node || typeof node !== "object") return ""
  const children = node.props?.children ?? []
  return (Array.isArray(children) ? children : [children]).map(textContent).join(" ")
}
export function plain(value) { return JSON.parse(JSON.stringify(value)) }
