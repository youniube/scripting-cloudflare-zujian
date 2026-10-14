# iPhone 远程安装

**[安装 Cloudflare Workers Meter 到 Scripting](https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fraw.githubusercontent.com%2Fyouniube%2Fscripting-cloudflare-zujian%2Fmain%2Freleases%2Fcloudflare-workers-meter.zip%22%5D)**

当前版本 **1.0.1** 已修复尚未配置账号时的首次启动异常。运行后应看到“Workers 额度”“开始监控”和“添加账号”。旧版本出现空白时，先更新原脚本，再重新运行；保留原脚本的配置与凭据作用域。

1. 在 iPhone 安装并打开 Scripting。
2. 用 Safari 打开上面的安装链接。在官方分享页点击打开 Scripting，并确认导入。
3. 运行 `Cloudflare Workers Meter`，点击“添加账号”。
4. 填入显示名称、Account ID 和只读 API Token。Token 权限仅需 `Account → Account Analytics → Read`，账号资源范围限制到你的账号。
5. 选择套餐。确认是 Workers Free 时，填写确认来源并勾选确认；不确定时选择“未确认”。
6. 保存后等待首次 API 验证与刷新，确认页面能显示 Worker 统计或明确的无数据状态。
7. 长按桌面，添加中号 Scripting 小组件。在“编辑小组件”中选择这个脚本，Parameter 留空。

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

- 查看历史：在脚本内选择“今日 / 昨日 / 7 天 / 30 天”。先查看一次“7 天”可以填充大号 Widget 的趋势缓存。
- 手动刷新：脚本内点击“手动刷新”；最短间隔为 1 分钟。Widget 刷新时间由系统决定。
- 固定账号：在账号管理中复制 Widget 参数，再粘贴到对应桌面小组件。
- 更新：仍使用同一安装入口，保留原脚本并选择更新。删除原脚本或导入为另一独立脚本可能需要重新填写 Token。
- 凭据：API Token 只保存在本机 Keychain，不在 GitHub 和 ZIP 中。

安装链接使用 [Scripting 官方分享页](https://www.scripting.fun/import_scripts/) 的 JSON URL 编码格式，目录导入方式与 [官方脚本仓库](https://github.com/scriptingapp/scripts#importing-scripts) 一致。已核对格式，但尚未连接 iPhone 实测原生导入、更新与桌面呈现。
