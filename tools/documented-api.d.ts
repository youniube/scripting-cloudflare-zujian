/**
 * 桌面离线检查专用：依据 docs/ 中官方文档摘录的最小 API 合约。
 * 不是 Scripting 完整官方声明，不进入 iOS 导入包，不代替真机类型诊断。
 * 联机时请通过 scripting-cli 同步 dts/，再运行 tools/check-device-types.mjs。
 */
declare namespace JSX {
  interface Element { readonly __nativeElement?: true }
  interface ElementChildrenAttribute { children: unknown }
  interface IntrinsicAttributes { key?: string | number }
}
type ViewChild = JSX.Element | string | number | boolean | null | undefined | ViewChild[]
type Style = string | { light: string; dark: string }
type Frame = { width?: number; height?: number; alignment?: string } | { minWidth?: number; minHeight?: number; maxWidth?: number | "infinity"; maxHeight?: number | "infinity"; idealWidth?: number | "infinity"; idealHeight?: number | "infinity"; alignment?: string }
interface CommonView {
  children?: ViewChild
  font?: number | string
  fontWeight?: "regular" | "medium" | "semibold" | "bold"
  fontDesign?: "default" | "rounded" | "monospaced" | "serif"
  foregroundStyle?: Style
  widgetBackground?: Style
  tint?: Style
  frame?: Frame
  padding?: boolean | number | { horizontal?: number; vertical?: number; top?: number; bottom?: number; leading?: number; trailing?: number }
  disabled?: boolean
  lineLimit?: number
  minScaleFactor?: number
  tag?: string | number
}
type Component<P = CommonView> = (props: P) => JSX.Element
declare function createElement(type: unknown, props: unknown, ...children: ViewChild[]): JSX.Element
declare const Fragment: Component
interface NativeRequest {
  method?: string
  headers?: Record<string, string>
  body?: string
  timeout?: number
  handleRedirect?: (request: unknown) => Promise<unknown | null>
}
interface NativeResponse {
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  json(): Promise<unknown>
}
declare module "scripting" {
  export const Text: Component
  export const VStack: Component<CommonView & { alignment?: "leading" | "center" | "trailing"; spacing?: number }>
  export const HStack: Component<CommonView & { alignment?: "top" | "center" | "bottom" | "firstTextBaseline" | "lastTextBaseline"; spacing?: number }>
  export const Spacer: Component
  export const Divider: Component
  export const RoundedRectangle: Component<CommonView & { cornerRadius: number; fill?: Style }>
  export const ProgressView: Component<CommonView & { value?: number; total?: number; progressViewStyle?: "linear" | "circular" | "automatic" }>
  export const DateLabel: Component<CommonView & { date: Date; style: "date" | "time" | "timer" | "relative" | "offset" }>
  export const Chart: Component<CommonView & { chartLegend?: "hidden" | "automatic" | "visible"; chartXScale?: string[]; chartYAxis?: "automatic" | "hidden" | "visible" }>
  export const BarChart: Component<CommonView & { marks: { label: string | Date; value: number }[] }>
  export const NavigationStack: Component
  export const List: Component<CommonView & { navigationTitle?: string; navigationBarTitleDisplayMode?: "inline" | "large" | "automatic"; listStyle?: "insetGrouped" | "plain"; toolbar?: Record<string, JSX.Element | JSX.Element[]> }>
  export const Section: Component<CommonView & { header?: JSX.Element; footer?: JSX.Element }>
  export const Button: Component<CommonView & { title: string; systemImage?: string; action: () => unknown; role?: "destructive" | "cancel" }>
  export function Picker<T extends string | number>(props: CommonView & { title?: string; value: T; onChanged: (value: T) => void; pickerStyle?: "segmented" | "menu" | "inline" }): JSX.Element
  export const TextField: Component<CommonView & { title: string; value: string; onChanged: (value: string) => void; prompt?: string; axis?: "vertical" | "horizontal" }>
  export const SecureField: Component<CommonView & { title: string; value: string; onChanged: (value: string) => void; prompt?: string }>
  export const Toggle: Component<CommonView & { title: string; value: boolean; onChanged: (value: boolean) => void }>
  export function useState<T>(initial: T | (() => T)): [T, (value: T | ((previous: T) => T)) => void]
  export function useEffect(effect: () => void | (() => void), dependencies: unknown[]): void
  export namespace Navigation {
    function present(options: { element: JSX.Element }): Promise<void>
    function useDismiss(): () => void
  }
  export namespace Dialog {
    function alert(options: { title?: string; message: string; buttonLabel?: string }): Promise<void>
    function confirm(options: { title?: string; message: string; confirmLabel?: string; cancelLabel?: string }): Promise<boolean>
  }
  export namespace Script { function exit(): void }
  export type WidgetFamily = "systemSmall" | "systemMedium" | "systemLarge" | "systemExtraLarge" | "accessoryCircular" | "accessoryRectangular" | "accessoryInline"
  export namespace Widget {
    const family: WidgetFamily
    const parameter: string
    const displaySize: { width: number; height: number }
    function present(element: JSX.Element, policy?: { policy: "after"; date: Date } | { policy: "atEnd" }): void
    function preview(options: { family: WidgetFamily }): Promise<void>
    function reloadAll(): void
  }
  export function fetch(url: string, init?: NativeRequest): Promise<NativeResponse>
}
declare namespace Storage {
  function get<T>(key: string): T | null
  function set<T>(key: string, value: T): boolean
  function remove(key: string): void
  function keys(): string[]
}
declare namespace Keychain {
  function get(key: string, options?: { synchronizable?: boolean }): string | null
  function set(key: string, value: string, options?: { synchronizable?: boolean; accessibility?: "first_unlock_this_device" }): boolean
  function remove(key: string, options?: { synchronizable?: boolean }): boolean
}
declare namespace Pasteboard {
  function setString(value: string | null): Promise<void>
}
