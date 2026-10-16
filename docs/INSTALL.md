# iPhone 远程安装

**[安装 Cloudflare Workers Meter 到 Scripting](https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fraw.githubusercontent.com%2Fyouniube%2Fscripting-cloudflare-zujian%2Fmain%2Freleases%2Fcloudflare-workers-meter.zip%22%5D)**

当前版本 **1.3.1** 修正融合版余额/排行文字缩小、模型名拥挤和底部过大留白。独立的“融合监控”仍排在“监控项目”菜单第一位，后面依次保留 Workers 请求额度和 Workers AI。原有两版的布局与桌面参数保持不变；更新原脚本后沿用已有账号和 Keychain 凭据。

1. 在 iPhone 安装并打开 Scripting。
2. 用 Safari 打开上面的安装链接。在官方分享页点击打开 Scripting，并确认导入。
3. 运行 `Cloudflare Workers Meter`，点击“添加账号”。
4. 填入显示名称、Account ID 和只读 API Token。Token 权限仅需 `Account → Account Analytics → Read`，账号资源范围限制到你的账号。
5. 选择套餐。确认是 Workers Free 时，填写确认来源并勾选确认；不确定时选择“未确认”。
6. 保存后进入“融合监控”，等待两项 API 验证与近 7 日刷新，确认分别显示统计或明确的无数据状态。可用“监控项目”切回任一独立版。
7. 长按桌面，添加中号 Scripting 小组件。在“编辑小组件”中选择这个脚本，Parameter 填 `fusion`。原 Workers 版继续留空，独立 AI 版填 `ai`。App 菜单的切换不会修改已经配置好的桌面类型。

## 备用安装地址

远程 ZIP：

```text
https://raw.githubusercontent.com/youniube/scripting-cloudflare-zujian/main/releases/cloudflare-workers-meter.zip
```

GitHub 项目目录：

```text
https://github.com/youniube/scripting-cloudflare-zujian/tree/main/scripts/Cloudflare%20Workers%20Meter
```

如果浏览器没有唤起 App，将远程 ZIP 地址粘贴到 [官方导入链接生成页](https://www.scripting.fun/import_scripts/)，生成链接后在 iPhone 上打开。也可以使用 [项目目录导入链接](https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fgithub.com%2Fyouniube%2Fscripting-cloudflare-zujian%2Ftree%2Fmain%2Fscripts%2FCloudflare%2520Workers%2520Meter%22%5D)。

## 使用与更新

- 融合版：监控项目第一项“融合监控 · Workers + AI”，默认加载近 7 日；分别展示今日请求数、AI Neurons、各自趋势及排名。`N` 代表 Neurons。点“刷新融合数据”刷新所选时段，两项各自显示完成、失败或冷却原因。
- 融合桌面：Parameter 填 `fusion`，或复制账号管理中的 `fusion:本地账号标识` 固定账号。小号和中号始终为今日摘要，大号增加近 7 日的双趋势和排名。桌面每轮优先刷新今日，历史由 App 的 7/30 日查询补齐；未取得日期保持 `—`。
- 三种模式可以同时摆放在桌面。已有留空/旧账号参数仍为 Workers，已有 `ai` / `ai:账号` 仍为独立 AI，升级不会替换其原有布局。
- 查看历史：运行脚本进入“Workers 额度”页面，在“历史 · UTC 自然日”区域点“统计时段”菜单行，再选择“今日 / 昨日 / 7 天 / 30 天”。选择“7 天”并等待查询完成可以填充大号 Widget 的趋势缓存。这个菜单位于管理页面，小组件预览页没有历史选择器。
- 手动刷新：脚本内点击“手动刷新”，按钮上方显示查询进度、完成天数、失败状态或可重试时间。重复刷新已有日期最短间隔为 1 分钟，未缓存历史可在成功刷新今日后立即补取；仍遵守限流和失败间隔。Widget 刷新时间由系统决定。
- 固定账号：在账号管理中复制 Widget 参数，再粘贴到对应桌面小组件。
- 更新：仍使用同一安装入口，保留原脚本并选择更新。删除原脚本或导入为另一独立脚本可能需要重新填写 Token。
- 旧版本提示最新：把原脚本的“远程资源”URL 改为上面的 `/main/releases/` ZIP 地址，保存后再点“立即更新”，确认版本变为 1.3.1。包含固定 Git 提交编号的地址只提供对应历史版本，不适合长期自动更新。
- 更新 Widget 样式：导入 1.3.1 后，关闭旧管理页并重新运行，先选择“融合监控”，再在“Widget 预览”打开小号、中号、大号，必要时点“重新加载”。重点检查余额和中号 TOP 3 的可读字号、大号模型名与数值之间的独立间距、AI 条到页脚的距离。预览主题保持“跟随系统”，也可临时分别检查浅色、深色。桌面外观仍需等 WidgetKit 更新后确认。
- 凭据：API Token 只保存在本机 Keychain，不在 GitHub 和 ZIP 中。

安装链接使用 [Scripting 官方分享页](https://www.scripting.fun/import_scripts/) 的 JSON URL 编码格式，目录导入方式与 [官方脚本仓库](https://github.com/scriptingapp/scripts#importing-scripts) 一致。已核对格式，但尚未连接 iPhone 实测原生导入、更新与桌面呈现。
