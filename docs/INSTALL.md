# iPhone 远程安装

**[安装 Cloudflare Workers Meter 到 Scripting](https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fraw.githubusercontent.com%2Fyouniube%2Fscripting-cloudflare-zujian%2Fmain%2Freleases%2Fcloudflare-workers-meter.zip%22%5D)**

当前版本 **1.1.3 · Premium Dashboard** 为小号、中号的圆环与剩余额度整行增加顶部留白，保留数字和 TOP 3 位置；常规尺寸增加 10pt，紧凑尺寸适当减少以保护底部。保留已有原生额度环、历史菜单和直接刷新反馈。先更新原脚本，再重新运行，沿用原账号配置与凭据作用域。

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

- 查看历史：运行脚本进入“Workers 额度”页面，在“历史 · UTC 自然日”区域点“统计时段”菜单行，再选择“今日 / 昨日 / 7 天 / 30 天”。选择“7 天”并等待查询完成可以填充大号 Widget 的趋势缓存。这个菜单位于管理页面，小组件预览页没有历史选择器。
- 手动刷新：脚本内点击“手动刷新”，按钮上方显示查询进度、完成天数、失败状态或可重试时间。重复刷新已有日期最短间隔为 1 分钟，未缓存历史可在成功刷新今日后立即补取；仍遵守限流和失败间隔。Widget 刷新时间由系统决定。
- 固定账号：在账号管理中复制 Widget 参数，再粘贴到对应桌面小组件。
- 更新：仍使用同一安装入口，保留原脚本并选择更新。删除原脚本或导入为另一独立脚本可能需要重新填写 Token。
- 旧版本提示最新：把原脚本的“远程资源”URL 改为上面的 `/main/releases/` ZIP 地址，保存后再点“立即更新”，确认版本变为 1.1.3。包含固定 Git 提交编号的地址只提供对应历史版本，不适合长期自动更新。
- 更新 Widget 样式：导入 1.1.3 后，关闭旧管理页并重新运行，在“Widget 预览”打开小号、中号并点击“重新加载”。检查数字下方留白、圆环与剩余额度整行下移，以及底部文字不重叠。预览“主题”保持“跟随系统”，可临时选择浅色、深色分别检查。桌面外观仍需等 WidgetKit 更新后确认。完整验证路径见 [UI 设计与真机步骤](UI-DESIGN.md)。
- 凭据：API Token 只保存在本机 Keychain，不在 GitHub 和 ZIP 中。

安装链接使用 [Scripting 官方分享页](https://www.scripting.fun/import_scripts/) 的 JSON URL 编码格式，目录导入方式与 [官方脚本仓库](https://github.com/scriptingapp/scripts#importing-scripts) 一致。已核对格式，但尚未连接 iPhone 实测原生导入、更新与桌面呈现。
