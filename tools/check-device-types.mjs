/** 使用 iPhone 经 scripting-cli 同步的官方声明检查；不回退到文档子集。 */
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const official = path.join(root, "dts", "scripting.d.ts")
if (!fs.existsSync(official)) {
  process.stderr.write("尚未取得当前 Scripting App 的官方 dts/scripting.d.ts。请先通过 scripting-cli 连接 iPhone 同步声明；本工具不会用手写合约冒充官方检查。\n")
  process.exitCode = 2
} else {
  const config = ts.parseJsonConfigFileContent({
    compilerOptions: {
      target: "ESNext", lib: ["ESNext"], module: "CommonJS", strict: true, noEmit: true, skipLibCheck: true,
      jsx: "react", jsxFactory: "createElement", jsxFragmentFactory: "Fragment",
      baseUrl: root, paths: { scripting: ["./dts/scripting.d.ts"] },
    },
    include: ["scripts/**/*.ts", "scripts/**/*.tsx", "dts/*.d.ts"], exclude: ["dts/scripting.d.ts"],
  }, ts.sys, root)
  const program = ts.createProgram(config.fileNames, config.options)
  const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program)]
  if (diagnostics.length) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => root, getCanonicalFileName: file => file, getNewLine: () => "\n",
    }))
    process.exitCode = 1
  } else process.stdout.write("已通过当前 Scripting App 同步的官方类型声明检查；仍需在 iPhone 检查原生呈现与 Widget。\n")
}
