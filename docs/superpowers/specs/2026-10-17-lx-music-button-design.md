# 落雪音乐内嵌歌词 + 播放控制 —— 设计（v4）

日期：2026-10-17
目标版本：DSH Web（profile: desktop）
状态：v1「叫主界面到前台」被证据推翻；v2「桌面歌词开关」已实现并可用；v3 在 v2 之上加「把歌词内嵌进 DSH 右侧背景」。

## 一句话

在 DSH 对话区右侧的壁纸带里显示落雪正在播的歌词（当前行 + 前后各两句），默认常显；输入框右侧的「歌词」按钮改成临时收起/展开；设置页里可以关掉内嵌歌词，改回落雪的桌面歌词窗。

## 为什么不是 v1（留证，不是废话）

v1 批准的交互是「落雪在跑 → 把主界面叫到前台；没跑 → 启动并前置」。实现完、准备验收时，实测发现这个前提本身是假的：

1. 用 `EnumWindows` 扫落雪进程（pid 26456）的全部顶层窗口，**播放器主界面窗口不存在**。可见的只有：
   - `Lyric - LX Music`（class `Chrome_WidgetWin_1`，454x304，exstyle `0x200008` = `WS_EX_TOPMOST | WS_EX_NOREDIRECTIONBITMAP`）—— 桌面歌词浮窗；
   - `Lies (谎言) - BIGBANG`（158x26，最小化）—— 状态栏歌词条。
   隐藏的只有 `User api`（800x601，脚本宿主页，`<title>User api</title>` 写死在 asar 里）和 Chromium 的内部窗口 `Chrome_WidgetWin_0`。
2. 解 asar 确认机制：`isExistWindow = () => !!browserWindow`；主窗口 `close` 时若托盘启用则 `preventDefault(); hide()`，但一旦走的是销毁分支，`browserWindow` 就变成 `null`，此后 `showWindow()` 只有一个 `if (!browserWindow) return;`。
3. 实测「程序已在运行时再启动一次 exe」（Electron 单实例）：第二个进程自己退出，屏幕上什么都不弹 —— 因为 `second-instance` 处理器是 `if (isExistWindow()) { ... showWindow() } else { app.quit() }`。
4. 截屏确认用户桌面真实状态：只有歌词浮窗浮在编辑区左侧，没有播放器窗口。

结论：在「主界面已被销毁」这个常见状态下，任何「叫到前台」都只能靠重启落雪 —— 而重启会切断正在放的音乐。

用户的两个答复钉住了边界：**平时不怎么用主界面，桌面歌词就够了**；**绝对不能中断播放**。

## 为什么还要 v3

v2 的按钮把桌面歌词藏起来/放回来，但歌词本身还是落雪自己的**置顶透明浮窗**：它浮在所有窗口之上，写代码时挡视线、抢位置。用户要的是「把歌词弹窗内嵌到右边背景中」。内嵌版不占桌面、不置顶、不抢焦点，只活在 DSH 的壁纸带上。

## 交互（v3）

### 内嵌歌词层

- 位置：右侧壁纸带，`position: fixed`、垂直居中、右对齐、`pointer-events: none`（绝不挡点击）。实测视口 1707×1066、对话卡片右边界 x=1306，右侧有 401px 空带，够放。
- 内容：固定 5 个槽位 —— 当前行（20px 白色 + 双层阴影）、前后各两句（14/13px，透明度 0.55/0.3），顶部一行 12px 的「歌名 · 歌手」。固定槽位是为了让整块高度不随歌词行数跳动。
- 自适应：窗口窄于 1120px 整块淡出不显示，避免压到对话卡片。
- 换行/切行用 300ms 的 opacity/transform 过渡；不做滚动、不做卡拉 OK 效果。

### 开关与互斥

| 动作 | 内嵌歌词 | 桌面歌词窗 |
| --- | --- | --- |
| 设置页打开内嵌（默认） | 显示 | **藏起来**（一次性，幂等） |
| 设置页关掉内嵌 | 不显示 | **放回来** |
| 输入框按钮点一下（临时收起） | 收起 | 不动 |

- 偏好存 `localStorage`（键 `lx-music:prefs`）：`{ embedded: true, collapsed: false }`。
- 内嵌开着时桌面歌词窗恒藏，所以收起内嵌不会突然冒出一块浮窗；想回桌面歌词模式就去设置页关内嵌。
- 按钮在「设置里已关掉内嵌」时当作「现在打开」用，不会变成死按钮。

### 失败与降级

- **开放 API 没开**：歌词层什么都不画（不弹错误、不占位），设置页那行状态写明原因和该去哪开。理由：默认常显的东西一旦报错就会天天烦人。
- **API 中途掉线**：保留最后一帧 3 秒再淡出，不闪。
- **纯音乐 / 没匹配到歌词**：只显示「歌名 · 歌手」。
- 桌面歌词窗操作失败才弹底部提示卡（三句话：发生了什么 / 为什么 / 怎么办），8 秒自动消失。

### 播放控制条（v4）

- **只做三样**：上一首 / 播放暂停 / 下一首。音量、进度、歌单、收藏都先不做（用户原话：「就先这三样，别的不急」）。
- **位置**：贴在歌词正上方，同一条竖列（用户原话：「三颗按钮——上一首 / 播放暂停 / 下一首放在歌词正上方」）。
  舞台是一个 fixed 容器：`top: 50%`、`translateY(-50%)`、`right: clamp(24px,4vw,72px)`、`width: clamp(200px,21vw,330px)`、
  `flex-direction: column`、`align-items: flex-end`、`pointer-events: none`；胶囊 `pointer-events: auto`。
  歌词块在胶囊下面 14px，两者共用同一条右边界；歌词收起时只剩胶囊，位置不动。
- **数据**：和歌词层共用同一个 `player` 轮询总线（500ms、按签名去重），不额外问落雪；
  胶囊只在 `api.enabled && frame` 时出现，视口 < 1120px 时不出现。
- **点击**：先本地翻转图标（乐观更新，350ms 后解除忙碌态），真状态回来后自动对齐；连点不会排队。
- **映射**：`prev → /skip-prev`、`next → /skip-next`、`toggle → 先读 status，playing 就 /pause，否则 /play`。
- **失败**：底部提示卡（发生了什么 / 为什么 / 怎么办），8 秒消失；图标由下一轮轮询纠正。
- **为什么不做网页内播放**：落雪 API 不提供音频流地址，声音只能由落雪本体出（见「为什么不是 v1」）。


```
DSH 页面 ──GET /lx-music/lyric──▶ 宿主插件（内存缓存 700ms）
                                   ├─ GET 127.0.0.1:23330/status?filter=...
                                   └─ GET 127.0.0.1:23330/lyric   （换歌才拉，整首 LRC）
```

浏览器永远只跟同源的 `/lx-music/*` 说话，不跨域直连落雪（避开 CORS，也不把 23330 暴露给页面）。

- 相邻句不靠 API 逐行推，而是**用整首 LRC + 当前 `progress` 算行号**：`parseLrc` 解析成 `[{time,text}]`，二分找 `progress` 落点，取 `index ± 2`。
- 换歌判定：`name + singer` 变了才重拉 `/lyric`。
- 页面每 500ms 轮询宿主；宿主命中 700ms 缓存就不碰落雪，落雪侧实际压力 ≈ 1 次/秒。

## 宿主半边（`lib/index.js`，cordis 插件）

`inject = ['webServer']`，五条 exact 路由：

| 路由 | 语义 | 返回 |
| --- | --- | --- |
| `GET /lx-music/lyric` | 一帧歌词 | `{ ok, api:{enabled,port,error}, song:{name,singer,album,duration}, play:{status,progress}, lyric:{index,total,line,slots[5]} }` |
| `POST /lx-music/control` | body `{action:'prev'\|'next'\|'toggle'}`，走落雪 API 控制播放 | `{ ok, action, path }` |
| `POST /lx-music/lyrics` | body `{visible:boolean}`，设置桌面歌词窗显隐（幂等） | `{ ok, action:'shown'\|'hidden'\|'launched', visible, windows, pid }` |
| `GET /lx-music/lyrics` | 只读状态 | `{ ok, installed, running, exe, pid, windows, visible, title }` |
| `POST /lx-music/lyrics/toggle` | 兼容旧页面：翻转桌面歌词窗 | 同上 |
| `GET /lx-music/debug`、`GET\|POST /lx-music/client-report` | 诊断：插件条目/客户端图、浏览器自报 | — |

- 状态码：成功 200；`NOT_FOUND` 404；`NO_LYRIC_WINDOW` / `LAUNCH_FAILED` / `SCRIPT_FAILED` 409；
  `API_OFFLINE` / `TIMEOUT` / `HTTP_*`（落雪那边不答应）502/503；坏 body 400；方法不对 405。
- PowerShell 调用：`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File lib/lx-music.ps1 -Mode <state|toggle|show|hide>`，失败退到 `pwsh.exe`；stdout 只保证一行 `LXMUSIC_JSON:{...}`，JS 侧按最后一个 marker 解析；超时 30s。
- 同方向请求合流（hide/hide/hide → 只跑一次 PowerShell）。

## 窗口操作（`lib/lx-music.ps1`）

- `Add-Type` 内联 C#，只用 user32：`EnumWindows` / `GetWindowTextW` / `GetClassNameW` / `GetWindowLongW(GWL_EXSTYLE)` / `GetWindowRect` / `IsWindowVisible` / `IsIconic` / `ShowWindow`。
- 歌词窗口识别：`class == 'Chrome_WidgetWin_1'` 且标题匹配 `^Lyric`；标题缺失时兜底为 `WS_EX_TOPMOST` + 宽 ≥120 + 高 ≥40 且标题不是 `User api`。
- 显隐：显示时先 `SW_RESTORE`（若最小化）再 `SW_SHOWNOACTIVATE`（不抢焦点），仍不可见再 `SW_SHOW`；隐藏用 `SW_HIDE`。操作后 120ms 重新读真实可见性再回报。
- 没在跑时：按顺序找 exe（注册表协议项 → `%LOCALAPPDATA%\Programs` → `%ProgramFiles%` → 最后才扫卸载表），`Start-Process`，最多等 20s 等歌词窗出现。
- 纯 ASCII：Windows PowerShell 5.1 读无 BOM 脚本走 ANSI 代码页，中文字面量会乱码；所有面向用户的中文都在 JS 里。
- 性能：PowerShell 注册表 **provider** 首次访问 ~1.3s，所以注册表读取全走 `.NET Microsoft.Win32.Registry`（state 约 0.5s，show/hide 约 0.6s）。

## 浏览器半边（`lib/client.js`）

手写 `__ModuleLoader__` factory 包（无构建步骤），`inject = ['slots', 'locale']`，四个座位：

| 座位 | id | 组件 |
| --- | --- | --- |
| `conversation.input.right` | `lx-music` | 按钮：临时收起/展开内嵌歌词（收起时音符叠斜杠） |
| `shell.overlay` | `lx-music-stage` | 舞台：控制胶囊在上、歌词在下，同一条竖列（`flex-direction: column`，共用右边界） |
| `shell.overlay` | `lx-music-toast` | 底部提示卡（模块内小 emitter 订阅） |
| `settings.section` | `lx-music` | 「落雪音乐」设置：内嵌歌词开关 + 开放 API / 桌面歌词窗状态 |

控制胶囊和歌词合成**一个 overlay**（`LxMusicStage`），胶囊 `pointer-events: auto`、舞台其余部分 `none`；
歌词收起时只剩胶囊，位置不变。一个组件也意味着两侧共享同一个 500ms 轮询订阅。

文案 `zh` / `en` 双语，`ctx.locale.register(NS, messages)` + `bind(NS)`；座位没注入 `t` 时退回内置中文。样式全内联，浅深主题都靠 `text-shadow` 保证压在壁纸上可读。

## 安装

- 源目录 `E:\deepseek\dsh-plugin-lx-music`；profile 里用 junction 指过去：`C:\Users\liuwang\.dsh\profiles\desktop\node_modules\dsh-plugin-lx-music`。
- profile `package.json`：`dependencies` 加 `link:` 条目，`dsh.profile.bundles` 加 `dsh-plugin-lx-music`。
- 插件自带 `cordis.patch.yml`，用 `insert` 把宿主插件行加进 profile 的 `cordis.yml` 层。
- 宿主半边改完要重启 DSH（ESM 模块缓存不刷新）；浏览器半边刷新页面即可。

## 验收

1. `node test/lrc.mjs` —— LRC 解析、行号二分、窗口切片、播放控制路径、API 降级（假 fetch，离线可跑）。
2. `node test/control-route.mjs` —— 起假落雪 API，真 HTTP 打 `POST /lx-music/control`（toggle/next/prev、坏 action、掉线 503），**不碰真播放器**。
3. `node test/host-routes.mjs` —— 假 ctx 起真 HTTP 服务，打 `/lx-music/lyric`、`POST /lx-music/lyrics`（hide → 幂等 hide → show）、坏 body 400、方法 405、卸载释放路由。
4. `node test/client-bundle.mjs` —— 桩 `__ModuleLoader__` 执行 bundle，断言 4 个座位、按钮结构、胶囊排在歌词之前、设置页开关。
5. 重启 DSH 后：右侧出现「歌名 · 歌手 + 5 行歌词」，切歌/换行跟着动；歌词正上方的胶囊能换歌、能暂停/继续（播放不中断）；点输入框按钮整块收起再展开（胶囊不动）；设置页关掉内嵌 → 桌面歌词窗自己回来。

## 不做什么

不做音量、不做进度条、不做歌单、不做收藏、不做卡拉 OK 逐字，不做托盘图标，不自动播放，不重启落雪（会中断播放），不试图叫出已销毁的主界面，不直连落雪 API（一律经宿主同源代理）。
