import { AccountConfig, CACHE_VERSION, Capabilities, DayData, Failure, MonitorError, Settings, utcDate, validateAccount } from "./core"

const PREFIX = "cf-workers-meter.v1."
const SETTINGS_KEY = PREFIX + "settings"
function tokenKey(id: string) { return PREFIX + "token." + id }
function key(id: string, suffix: string) { return PREFIX + "account." + id + "." + suffix }
function write<T>(name: string, value: T): void {
  if (!Storage.set(name, value)) throw new MonitorError("storage", "本地存储写入失败，请检查 Scripting 可用空间。")
}
export function getSettings(): Settings {
  const stored = Storage.get<Settings>(SETTINGS_KEY)
  if (!stored || stored.version !== 1 || !Array.isArray(stored.accounts)) return { version: 1, accounts: [], selectedId: null }
  return stored
}
export function getAccount(id: string): AccountConfig | undefined {
  return getSettings().accounts.find(account => account.id === id)
}
export function isCurrentAccount(account: AccountConfig): boolean {
  const current = getAccount(account.id)
  return !!current && current.accountId === account.accountId && current.revision === account.revision
}
export function selectAccount(id: string): void {
  const settings = getSettings()
  if (!settings.accounts.some(account => account.id === id)) throw new MonitorError("configuration", "账号不存在。")
  write(SETTINGS_KEY, { ...settings, selectedId: id })
}
export function resolveWidgetAccount(parameter: string | null | undefined): AccountConfig | undefined {
  const settings = getSettings()
  const value = parameter?.trim() ?? ""
  if (!value) return settings.accounts.find(account => account.id === settings.selectedId) ?? settings.accounts[0]
  // 参数只允许本地账号标识、Account ID 或唯一显示名；从不接收 Token。
  const matches = settings.accounts.filter(account => account.id === value || account.accountId.toLowerCase() === value.toLowerCase() || account.displayName === value)
  if (matches.length !== 1) throw new MonitorError("configuration", "Widget 参数未匹配唯一账号，请在 App 中复制该账号的 Widget 参数。")
  return matches[0]
}
export function readToken(id: string): string {
  const value = Keychain.get(tokenKey(id), { synchronizable: false })
  if (!value) throw new MonitorError("auth", "Keychain 中没有可读 Token。重启后请先解锁，或在 App 中重新保存 Token。")
  return value
}
/** 配置白名单序列化；Token 永远只进入 Keychain。 */
export function saveAccount(input: AccountConfig, tokenInput: string): AccountConfig {
  const account: AccountConfig = {
    id: input.id, revision: Date.now(), accountId: input.accountId.trim().toLowerCase(), displayName: input.displayName.trim(),
    plan: input.plan, dailyLimit: input.plan === "custom" ? input.dailyLimit : undefined,
    verificationNote: input.verificationNote?.trim(), verifiedAt: input.verifiedAt,
  }
  validateAccount(account)
  const settings = getSettings()
  if (settings.accounts.some(item => item.id !== account.id && item.accountId === account.accountId)) {
    throw new MonitorError("configuration", "此 Account ID 已添加，请修改现有账号。")
  }
  const previous = settings.accounts.find(item => item.id === account.id)
  const oldToken = Keychain.get(tokenKey(account.id), { synchronizable: false })
  const token = tokenInput.trim() || oldToken
  if (!token || /[\r\n]/.test(token)) throw new MonitorError("configuration", "请填写单行 API Token。编辑账号时可留空以保留原 Token。")
  if (!Keychain.set(tokenKey(account.id), token, { synchronizable: false, accessibility: "first_unlock_this_device" })) {
    throw new MonitorError("storage", "Keychain 写入失败，账号没有保存。请先解锁设备。")
  }
  const accounts = previous ? settings.accounts.map(item => item.id === account.id ? account : item) : [...settings.accounts, account]
  try { write(SETTINGS_KEY, { version: 1, accounts, selectedId: settings.selectedId ?? account.id }) } catch (error) {
    if (oldToken) Keychain.set(tokenKey(account.id), oldToken, { synchronizable: false, accessibility: "first_unlock_this_device" })
    else Keychain.remove(tokenKey(account.id), { synchronizable: false })
    throw error
  }
  if (previous?.accountId !== account.accountId) clearAccountCache(account.id)
  else {
    // Token/配置变更后重新确认字段权限与配额，统计缓存仍可离线查看。
    Storage.remove(key(account.id, "capabilities"))
    Storage.remove(key(account.id, "failure"))
    Storage.remove(key(account.id, "attempt"))
  }
  return account
}
export function deleteAccount(id: string): void {
  const settings = getSettings()
  const oldToken = Keychain.get(tokenKey(id), { synchronizable: false })
  if (!Keychain.remove(tokenKey(id), { synchronizable: false })) throw new MonitorError("storage", "Keychain 删除失败，账号仍保留。")
  const accounts = settings.accounts.filter(item => item.id !== id)
  try { write(SETTINGS_KEY, { version: 1, accounts, selectedId: settings.selectedId === id ? accounts[0]?.id ?? null : settings.selectedId }) } catch (error) {
    if (oldToken) Keychain.set(tokenKey(id), oldToken, { synchronizable: false, accessibility: "first_unlock_this_device" })
    throw error
  }
  clearAccountCache(id)
}
export function clearAccountCache(id: string): void {
  const prefix = key(id, "")
  for (const name of Storage.keys()) if (name.startsWith(prefix)) Storage.remove(name)
}
export function readDay(id: string, dateUTC: string): DayData | undefined {
  const data = Storage.get<DayData>(key(id, "day." + dateUTC))
  return data?.version === CACHE_VERSION && data.dateUTC === dateUTC && Array.isArray(data.workers) && Number.isFinite(Date.parse(data.fetchedAt)) ? data : undefined
}
export function writeDay(account: AccountConfig, data: DayData): void {
  if (!isCurrentAccount(account)) throw new MonitorError("configuration", "查询期间账号配置已变化，本次结果未写入。")
  write(key(account.id, "day." + data.dateUTC), data)
  pruneDays(account.id)
}
function pruneDays(id: string): void {
  const prefix = key(id, "day.")
  const names = Storage.keys().filter(name => name.startsWith(prefix)).sort().reverse()
  for (const name of names.slice(40)) Storage.remove(name)
}
export function latestDay(id: string): DayData | undefined {
  const prefix = key(id, "day.")
  const names = Storage.keys().filter(name => name.startsWith(prefix) && name.slice(prefix.length) <= utcDate()).sort().reverse()
  for (const name of names) {
    const data = readDay(id, name.slice(prefix.length))
    if (data) return data
  }
  return undefined
}
export function readCapabilities(id: string): Capabilities | undefined {
  return Storage.get<Capabilities>(key(id, "capabilities")) ?? undefined
}
export function writeCapabilities(account: AccountConfig, capabilities: Capabilities): void {
  if (isCurrentAccount(account)) write(key(account.id, "capabilities"), capabilities)
}
export function readFailure(id: string): Failure | undefined { return Storage.get<Failure>(key(id, "failure")) ?? undefined }
export function writeFailure(account: AccountConfig, failure: Failure): void {
  if (isCurrentAccount(account)) write(key(account.id, "failure"), failure)
}
export function clearFailure(id: string): void { Storage.remove(key(id, "failure")) }
export function readAttempt(id: string): number { return Storage.get<number>(key(id, "attempt")) ?? 0 }
export function markAttempt(id: string, now: number): void { write(key(id, "attempt"), now) }

interface Lease { owner: string; expires: number }
/** 跨 Widget 进程的尽力抑制。Storage 没有 CAS；不宣称这是跨进程原子锁。 */
export function acquireLease(id: string, duration: number, now: number): string | undefined {
  const name = key(id, "lease")
  const current = Storage.get<Lease>(name)
  if (current && current.expires > now) return undefined
  const owner = now.toString(36) + "-" + Math.random().toString(36).slice(2)
  write(name, { owner, expires: now + duration })
  return Storage.get<Lease>(name)?.owner === owner ? owner : undefined
}
export function releaseLease(id: string, owner: string): void {
  if (Storage.get<Lease>(key(id, "lease"))?.owner === owner) Storage.remove(key(id, "lease"))
}
