import { Button, Dialog, HStack, List, Navigation, NavigationStack, Picker, ProgressView, Script, Section, SecureField, Spacer, Text, TextField, Toggle, useEffect, useState, VStack, Widget } from "scripting"
import { AccountConfig, cacheAge, failureFrom, formatNumber, MonitorView, Period, planLabel, rankWorkers, totalRequests, utcDate } from "./core"
import { cachedView, loadMonitor } from "./service"
import { deleteAccount, getSettings, saveAccount, selectAccount } from "./storage"
import { DailyChart, failureLabel, FullQuota, palette, WorkerDetail } from "./views"

function AccountEditor({ original }: { original?: AccountConfig }) {
  const dismiss = Navigation.useDismiss()
  const [displayName, setDisplayName] = useState(original?.displayName ?? "")
  const [accountId, setAccountId] = useState(original?.accountId ?? "")
  const [token, setToken] = useState("")
  const [plan, setPlan] = useState<AccountConfig["plan"]>(original?.plan ?? "unknown")
  const [limit, setLimit] = useState(String(original?.dailyLimit ?? ""))
  const [note, setNote] = useState(original?.verificationNote ?? "")
  const [confirmed, setConfirmed] = useState(!!original?.verifiedAt)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const profile: AccountConfig = {
        id: original?.id ?? Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9),
        accountId, displayName, plan, dailyLimit: plan === "custom" ? Number(limit) : undefined,
        verificationNote: note,
        verifiedAt: confirmed ? (original?.plan === plan ? original?.verifiedAt : undefined) ?? new Date().toISOString() : undefined,
      }
      saveAccount(profile, token)
      setToken("")
      Widget.reloadAll()
      dismiss()
    } catch (error) {
      await Dialog.alert({ title: "保存失败", message: failureFrom(error).message })
    } finally { setSaving(false) }
  }

  return <NavigationStack>
    <List navigationTitle={original ? "编辑账号" : "添加账号"} navigationBarTitleDisplayMode="inline" listStyle="insetGrouped" toolbar={{
      cancellationAction: <Button title="取消" action={dismiss} disabled={saving} />,
      confirmationAction: <Button title="保存" action={save} disabled={saving} />,
    }}>
      <Section header={<Text>账号</Text>} footer={<Text>名称由你设置。Account ID 从 Cloudflare 控制台复制，不是 Zone ID。</Text>}>
        <TextField title="显示名称" value={displayName} onChanged={setDisplayName} prompt="例如：个人 Cloudflare" />
        <TextField title="Account ID" value={accountId} onChanged={setAccountId} prompt="32 位十六进制 ID" />
      </Section>
      <Section header={<Text>只读凭据</Text>} footer={<Text>仅需 Account → Account Analytics → Read。Token 保存在本机 Keychain，不写入项目和统计缓存。编辑时留空保留原 Token。</Text>}>
        <SecureField title="API Token" value={token} onChanged={setToken} prompt={original ? "留空保留原 Token" : "粘贴只读 Token"} />
      </Section>
      <Section header={<Text>套餐与日额度</Text>} footer={<Text>Analytics 权限不能可靠读取计费套餐。请以控制台为准。自定义值表示你确认的 UTC 日监控阈值，不代表 Cloudflare 官方余额；付费计划不套用免费额度。</Text>}>
        <Picker title="套餐" value={plan} onChanged={value => { setPlan(value as AccountConfig["plan"]); setConfirmed(false) }}>
          <Text tag="unknown">未确认 · 仅统计用量</Text>
          <Text tag="free">Workers Free · 100,000 / 日</Text>
          <Text tag="paid">Workers Paid · 无免费日额度</Text>
          <Text tag="custom">自定义 UTC 日阈值</Text>
        </Picker>
        {plan === "custom" ? <TextField title="UTC 日阈值" value={limit} onChanged={setLimit} prompt="正整数" /> : null}
        {plan === "free" || plan === "custom" ? <VStack alignment="leading" spacing={10}>
          <TextField title="确认来源" value={note} onChanged={setNote} prompt="例如：控制台显示 Workers Free，2026-10-14 确认" axis="vertical" />
          <Toggle title="我已确认套餐/阈值与 UTC 重置规则" value={confirmed} onChanged={setConfirmed} />
        </VStack> : null}
      </Section>
    </List>
  </NavigationStack>
}

function MainView() {
  const dismiss = Navigation.useDismiss()
  const [settings, setSettings] = useState(getSettings())
  const [period, setPeriod] = useState<Period>("today")
  const [view, setView] = useState<MonitorView | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState("")
  const [reload, setReload] = useState({ generation: 0, force: false, verify: false })
  const account = settings.accounts.find(item => item.id === settings.selectedId) ?? settings.accounts[0]

  useEffect(() => {
    let cancelled = false
    if (!account) { setView(null); setBusy(false); return }
    const cached = cachedView(account, period)
    setView(cached)
    setBusy(true)
    setProgress("正在查询 Cloudflare…")
    void loadMonitor(account, period, {
      force: reload.force, verify: reload.verify,
      onProgress: (completed, total) => { if (!cancelled) setProgress(`已读取 ${completed} / ${total} 个 UTC 日`) },
    }).then(result => {
      if (cancelled) return
      setView(result)
      if (!result.fromCache) Widget.reloadAll()
    }).catch(error => {
      if (!cancelled) setView({ ...cached, failures: [failureFrom(error)] })
    }).finally(() => { if (!cancelled) { setBusy(false); setProgress("") } })
    return () => { cancelled = true }
  }, [account?.id, account?.revision, period, reload.generation])

  async function edit(original?: AccountConfig) {
    await Navigation.present({ element: <AccountEditor original={original} /> })
    const updated = getSettings()
    setSettings(updated)
    setReload(current => ({ generation: current.generation + 1, force: false, verify: false }))
  }
  async function remove(item: AccountConfig) {
    if (!await Dialog.confirm({ title: `删除「${item.displayName}」？`, message: "删除本机账号配置、Token 和统计缓存。Cloudflare 账号和 Worker 不受影响。", confirmLabel: "删除", cancelLabel: "取消" })) return
    try {
      deleteAccount(item.id)
      setSettings(getSettings())
      Widget.reloadAll()
    } catch (error) { await Dialog.alert({ title: "删除失败", message: failureFrom(error).message }) }
  }
  function switchAccount(id: string) {
    try {
      selectAccount(id)
      setSettings(getSettings())
      setReload(current => ({ generation: current.generation + 1, force: false, verify: false }))
      Widget.reloadAll()
    } catch (error) { void Dialog.alert({ title: "切换失败", message: failureFrom(error).message }) }
  }
  // 首次运行时两个 ID 都可能是 undefined，必须先确认数据和账号存在。
  const currentView = view && account && view.account.id === account.id && view.period === period ? view : null
  const days = currentView?.days ?? []
  const ranked = rankWorkers(days)
  const total = totalRequests(days)
  const covered = days.filter(day => day.requests !== null).length
  const expected = currentView?.expectedDates ?? []
  const today = account ? cachedView(account, "today") : null
  const todayDay = today?.days[0] ?? today?.previousDay
  const warnings = [...new Set(days.flatMap(day => day.warnings))]

  return <NavigationStack>
    <List navigationTitle="Workers 额度" navigationBarTitleDisplayMode="inline" listStyle="insetGrouped" toolbar={{
      cancellationAction: <Button title="完成" action={dismiss} />,
      topBarTrailing: <Button title="添加账号" systemImage="plus" action={() => edit()} disabled={busy} />,
    }}>
      {!account ? <Section header={<Text>开始监控</Text>}>
        <Text>添加 Cloudflare 账号与只读 API Token。没有配置时不会显示演示用量。</Text>
        <Button title="添加账号" action={() => edit()} />
      </Section> : <Section header={<Text>当前账号</Text>}>
        <Picker title="账号" value={account.id} onChanged={switchAccount} disabled={busy}>
          {settings.accounts.map(item => <Text key={item.id} tag={item.id}>{item.displayName}</Text>)}
        </Picker>
        <FullQuota account={account} day={todayDay} />
        {busy ? <HStack><ProgressView /><Text font="caption">{progress}</Text></HStack> : <Text font="caption" foregroundStyle={palette.secondary}>{currentView?.fromCache ? "当前使用缓存 · 手动刷新最短间隔 1 分钟" : "已完成本次查询"}</Text>}
        <HStack>
          <Button title="手动刷新" systemImage="arrow.clockwise" action={() => setReload(current => ({ generation: current.generation + 1, force: true, verify: false }))} disabled={busy} />
          <Spacer />
          <Button title="验证 API" action={() => setReload(current => ({ generation: current.generation + 1, force: false, verify: true }))} disabled={busy} />
        </HStack>
      </Section>}

      {currentView?.failures.length ? <Section header={<Text>更新状态</Text>}>
        {currentView.failures.slice(0, 3).map((failure, index) => <VStack key={index} alignment="leading" spacing={5}>
          <Text font="headline" foregroundStyle={palette.warning}>{failureLabel(failure)}</Text>
          <Text font="caption">{failure.message}</Text>
          {failure.retryAt ? <Text font="caption">下次允许重试：{new Date(failure.retryAt).toLocaleString()}</Text> : null}
        </VStack>)}
      </Section> : null}

      {account ? <Section header={<Text>历史 · UTC 自然日</Text>} footer={<Text>最近 7 / 30 天包含今日，今日尚未结束。空日期与未知数据不会填成零；历史统计仅对已取得数据求和。</Text>}>
        <Picker title="统计时段" value={period} pickerStyle="menu" onChanged={value => {
          setPeriod(value as Period)
          setReload(current => ({ generation: current.generation + 1, force: false, verify: false }))
        }} disabled={busy}>
          <Text tag="today">今日</Text><Text tag="yesterday">昨日</Text><Text tag="7d">7 天</Text><Text tag="30d">30 天</Text>
        </Picker>
        <HStack>
          <Text font="headline">{covered < expected.length ? "已取得部分用量" : "时段调用量"}</Text>
          <Spacer />
          <Text font="headline" fontDesign="rounded">{formatNumber(total)}</Text>
        </HStack>
        <Text font="caption" foregroundStyle={palette.secondary}>Analytics 估算 · 已取得 {covered} / {expected.length} 天</Text>
        {expected.length > 1 ? <DailyChart dates={expected} days={days} /> : null}
        {expected.map(date => {
          const day = days.find(item => item.dateUTC === date)
          return <HStack key={date}>
            <Text font="caption">{date}{date === utcDate() ? " · 进行中" : ""}</Text>
            <Spacer />
            <Text font="caption" foregroundStyle={palette.secondary}>{day ? cacheAge(day.fetchedAt) : "未取得"}</Text>
            <Text font="caption" fontWeight="semibold">{formatNumber(day?.requests)}</Text>
          </HStack>
        })}
      </Section> : null}

      {account ? <Section header={<Text>Worker 明细与排名 · {ranked.length} 项</Text>} footer={<Text>{days.length > 1 ? "多日 CPU 分位数不能相加或取平均，选择今日/昨日查看日 P50、P99。" : "CPU 字段可用时显示 API 的日 P50、P99；单位来自 Schema 描述，未明确时显示原始单位。"}</Text>}>
        {ranked.length ? ranked.map(worker => <WorkerDetail key={worker.name} worker={worker} total={total} />) : <Text foregroundStyle={palette.secondary}>暂无 Worker 调用记录。可能尚未产生调用，或 Analytics 仍在聚合。</Text>}
      </Section> : null}

      {warnings.length ? <Section header={<Text>数据提示</Text>}>
        {warnings.map(warning => <Text key={warning} font="caption" foregroundStyle={palette.warning}>{warning}</Text>)}
      </Section> : null}

      <Section header={<Text>账号管理</Text>} footer={<Text>Widget 参数留空跟随当前账号；填写唯一显示名称、Account ID 或这里的本地标识可固定账号。多账号的 Token 与缓存独立。</Text>}>
        {settings.accounts.map(item => <VStack key={item.id} alignment="leading" spacing={7}>
          <Text font="headline">{item.displayName}</Text>
          <Text font="caption" foregroundStyle={palette.secondary}>{planLabel(item)}</Text>
          <Text font="caption" fontDesign="monospaced">Account ID: {item.accountId}</Text>
          <Text font="caption" fontDesign="monospaced">Widget 参数: {item.id}</Text>
          <Button title="复制 Widget 参数" action={async () => {
            try { await Pasteboard.setString(item.id); await Dialog.alert({ title: "已复制", message: "长按桌面 Widget → 编辑小组件，将参数粘贴到 Parameter。" }) }
            catch { await Dialog.alert({ title: "复制失败", message: "可使用该账号唯一显示名称作为 Widget 参数。" }) }
          }} />
          <HStack>
            <Button title="编辑" action={() => edit(item)} disabled={busy} />
            <Spacer />
            <Button title="删除" role="destructive" action={() => remove(item)} disabled={busy} />
          </HStack>
        </VStack>)}
        <Button title="添加账号" action={() => edit()} disabled={busy} />
      </Section>
      {account ? <Section header={<Text>Widget 预览</Text>}>
        <HStack>
          <Button title="小号" action={() => Widget.preview({ family: "systemSmall" })} disabled={busy} />
          <Button title="中号" action={() => Widget.preview({ family: "systemMedium" })} disabled={busy} />
          <Button title="大号" action={() => Widget.preview({ family: "systemLarge" })} disabled={busy} />
        </HStack>
      </Section> : null}
      <Section header={<Text>统计说明</Text>}>
        <Text font="caption" foregroundStyle={palette.secondary}>Analytics 调用估算可能有数分钟聚合延迟，且与计费口径不同。Service Binding、Pages Functions 等场景可能影响余额推算。请以 Cloudflare 控制台为准。</Text>
        <Text font="caption" foregroundStyle={palette.secondary}>用量达 80% 显示黄色，95% 显示红色。当前版本使用界面提示；系统决定 Widget 的刷新时机。</Text>
      </Section>
    </List>
  </NavigationStack>
}

async function run() {
  try { await Navigation.present({ element: <MainView /> }) } finally { Script.exit() }
}
void run()
