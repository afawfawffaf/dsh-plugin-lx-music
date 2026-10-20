# dsh-plugin-lx-music（落雪音乐 · 内嵌歌词 + 播放控制）

[github.com/afawfawffaf/dsh-plugin-lx-music](https://github.com/afawfawffaf/dsh-plugin-lx-music) · MIT · 仅 Windows

把落雪音乐（LX Music）正在播放的歌词，内嵌到 DSH 对话区右侧的壁纸带里：当前行 + 前后各两句，
默认常显。歌词正上方贴着一颗胶囊，放着「上一首 / 播放暂停 / 下一首」。输入框右侧的「歌词」按钮
用来临时收起/展开歌词（收起时只剩胶囊，位置不动），设置页里可以关掉内嵌、改回落雪的桌面歌词窗。

**不接管播放、不打断播放、不弹播放条** —— 歌和声音始终由落雪自己负责；本插件只读它开放的 API
（`127.0.0.1:23330`）做三件事：读当前歌词、发 `/play` `/pause` `/skip-next` `/skip-prev`，
外加一点窗口显隐操作。

装（任选其一）：

```bash
dsh plugin add afawfawffaf/dsh-plugin-lx-music
```

桌面端也可以在 DSH 的「插件 → 添加插件」里粘贴仓库地址
`https://github.com/afawfawffaf/dsh-plugin-lx-music`（桌面 profile 由 Electron 管理，
CLI 的 `--profile desktop` 会被拒，这是 DSH 的既定行为，不是本插件的问题）。

## 为什么有这个东西

桌面歌词是落雪自己的**置顶透明浮窗**，浮在所有窗口之上，写代码时挡视线、抢位置。
内嵌版不占桌面、不置顶、不抢焦点，只活在 DSH 的右侧空带里（实测视口 1707 宽时右侧有 401px）。
内嵌开着时，落雪的桌面歌词窗会被自动藏起来，两边不会重复。

设计文档（含 v1 被推翻的完整证据、窗口枚举、asar 里的 `isExistWindow` 代码）见
`docs/superpowers/specs/2026-10-17-lx-music-button-design.md`。

## 结构

```
lib/index.js      宿主半边（cordis 插件，inject ['webServer']），代理落雪 API + 桌面歌词窗显隐 + 播放控制
lib/lx-api.js     落雪开放 API 客户端：LRC 解析、行号二分、±2 句切片、700ms 缓存、播放控制、错误降级
lib/lx-music.ps1  Windows 窗口操作：找 exe / 启进程 / 枚举窗口 / show|hide|toggle|state
lib/client.js     浏览器半边，手写 __ModuleLoader__ factory 包，无构建步骤
cordis.patch.yml  让 profile 的 cordis.yml 层插入本插件
test/lrc.mjs           离线：LRC 解析 / 行号 / 切片 / 缓存 / 换歌 / 播放控制 / 降级
test/control-route.mjs 离线：起假落雪 API，真 HTTP 打 /lx-music/control（不碰真播放器）
test/host-routes.mjs   离线：假 ctx + 真 HTTP，含真的把桌面歌词藏起来再放回去
test/client-bundle.mjs 离线：桩 __ModuleLoader__ 执行 bundle，验 4 个座位与组件形状
```

## 四个座位

| 座位 | id | 干什么 |
| --- | --- | --- |
| `conversation.input.right` | `lx-music` | 输入框右侧的「歌词」按钮：临时收起/展开内嵌歌词 |
| `shell.overlay` | `lx-music-stage` | 右侧壁纸带的一条竖列：控制胶囊在上、歌词在下（当前行 + 前后各两句） |
| `shell.overlay` | `lx-music-toast` | 失败提示卡（成功一律不弹） |
| `settings.section` | `lx-music` | 设置页：内嵌开关 + 开放 API / 桌面歌词窗状态 |

舞台和控制条是**同一个 overlay**（`LxMusicStage`）：胶囊贴在歌词正上方，两者共用同一条右边界，
歌词收起时只剩胶囊。它们共用**同一个轮询器**（`player` 总线，500ms，按签名去重），所以落雪那边每轮只被问一次；
控制条点的瞬间先本地翻转图标（乐观更新），真状态回来后自动对齐。

## 路由

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/lx-music/lyric` | 一帧歌词：`{ ok, api, song, play, lyric:{ index, total, line, slots[5] } }` |
| POST | `/lx-music/control` | body `{ "action": "prev" \| "next" \| "toggle", "desired"?: "playing" \| "paused" }`，走落雪 API 放上一首/下一首/播放暂停；**播放器没开时先把播放器拉起来再重放这次点击** |
| POST | `/lx-music/lyrics` | body `{ "visible": true\|false }`，设置桌面歌词窗显隐（幂等） |
| GET | `/lx-music/lyrics` | 只读状态：`{ ok, installed, running, exe, pid, windows, visible, title }` |
| POST | `/lx-music/lyrics/toggle` | 兼容旧页面：翻转桌面歌词窗 |
| GET | `/lx-music/debug` | 诊断：本插件在宿主里的 loader 条目、客户端图、bundle 路径 |
| GET/POST | `/lx-music/client-report` | 浏览器半边把「我跑到哪一步」记在这里 |

成功 `200`；`NOT_FOUND` 404；`NO_LYRIC_WINDOW` / `LAUNCH_FAILED` / `SCRIPT_FAILED` 409；
落雪 API 掉线/超时 503；坏 body 400；方法不对 405。失败体统一带 `code` + `hint`。

## 落雪开放 API（v2.7.0+，默认端口 23330，需要在落雪里手动打开）

- `GET /status?filter=status,name,singer,albumName,duration,progress,lyricLineText`
- `GET /lyric` —— 整首原始 LRC 文本（含 `[ti:]` `[ar:]` `[offset:]` 与 `[mm:ss.xxx]` 时间标签）
- 控制：`GET /play` `/pause` `/skip-next` `/skip-prev`（`toggle` 先读状态再决定打哪个）

页面永远只跟同源的 `/lx-music/*` 说话，不跨域直连落雪：避开 CORS，也不把 23330 暴露给页面。

## 播放器没开时，点一下播放键就自己拉起来

点播放/上一首/下一首时，`POST /lx-music/control` 先照常打落雪 API；如果连不上（`API_OFFLINE`），
宿主会做三件事：

1. 跑 `lx-music.ps1 -Mode launch`：找到 `lx-music-desktop.exe` 就带 `-hidden` 启动 —— 窗口不弹出来，直接以系统托盘常驻（托盘图标若本来是关的，落雪会自己把它打开，所以随时能点回来），已经在跑则只回报 `already-running`；
2. 每 250ms 探一次开放 API，最多等 15 秒（实测启动到 API 可用 <1.4 秒）；
3. 等到了就把这次点击**重放**一遍，回包带上 `launched: true`。

三个坑，都写进代码注释了，别改回去：

- **`ELECTRON_RUN_AS_NODE`**：DSH 自己就是 Electron，它启动的子进程会带着 `ELECTRON_RUN_AS_NODE=1`。
  这个变量会让**任何** Electron 程序以无界面 Node 的身份运行 —— 落雪起来后不执行主进程，一秒内 `exit 0`，
  日志里连 `App starting...` 都没有，看起来像「播放器打不开」。`lx-music.ps1` 里的 `Start-LxPlayer`
  在启动子进程前临时把这个变量摘掉，启动完再放回去。
- **`-WindowStyle Minimized` 不够**：Electron 在 `ready-to-show` 里自己调 `showWindow()`，窗口照样弹出来。
  落雪自己有 `-hidden` 开关（`src/main/app.ts` 里 `cmdParams.hidden`：跳过 `showWindow()`，并在
  `applyInitSetting` 里把 `tray.enable` 打开），用它才是真的「后台起来、只在托盘」。
- **别把「想让它播」变成「把它关掉」**：播放器启动时可能自己恢复成播放态，这时重放的 `toggle`
  会反过来暂停。所以控制请求可以带 `desired: "playing" | "paused"`，重放前先比对当前状态，
  已经是用户要的状态就直接返回 `settled: true`，不发请求。

走不通时按结果分派：程序找不到 404 `NOT_FOUND`；启动被系统挡下 409 `LAUNCH_FAILED`；
拉起来了但开放 API 一直不答话 503 `API_OFFLINE_AFTER_LAUNCH`（提示去落雪里开开放 API）。

## 自测

```powershell
cd E:\deepseek\dsh-plugin-lx-music
node test/lrc.mjs
node test/control-route.mjs
node test/host-routes.mjs
node test/client-bundle.mjs
```

`control-route.mjs` 起一个假的落雪开放 API，用真 HTTP 打一遍控制路由 —— 包括「点了播放但落雪没开」：
拉起播放器那一步被换成了假的（`__hostTest.setLauncher`），只把假 API 重新开在同一个端口，
所以 `npm test` **不会**真的启动你的播放器。

`host-routes.mjs` 会真的调用 PowerShell 把桌面歌词藏起来再放回来，跑完屏幕上应该跟跑之前一样。
它默认**不动播放器**；想真点一次上一首/下一首/暂停，加环境变量：

```powershell
$env:LX_TEST_CONTROL = '1'; node test/host-routes.mjs   # 会暂停再恢复
```

手动试脚本本体：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File lib\lx-music.ps1 -Mode state
powershell.exe -NoProfile -ExecutionPolicy Bypass -File lib\lx-music.ps1 -Mode launch
powershell.exe -NoProfile -ExecutionPolicy Bypass -File lib\lx-music.ps1 -Mode hide
powershell.exe -NoProfile -ExecutionPolicy Bypass -File lib\lx-music.ps1 -Mode show
```

`-Mode launch` 只在播放器没在跑的时候才会真的启动它（已经在跑就只回报 `already-running`）。

输出是一行 `LXMUSIC_JSON:{...}`；`hide`/`show` 是幂等的（本来就藏/本来就显示时不重复操作）。

## 分享给别人

这是个标准 npm 包（`package.json` 里带 `dsh.bundle.patch` 与 `dsh.client`），DSH 的「插件」管理页支持几种来源，按你方便的选。**目前只发在 GitHub 上，npm 上还没发布**，所以没有「填包名」这一种：

| 方式 | 发什么 | 对方怎么装 |
| --- | --- | --- |
| git 仓库 | 仓库地址 | 插件页填 `https://github.com/afawfawffaf/dsh-plugin-lx-music`；或 `dsh plugin add afawfawffaf/dsh-plugin-lx-music` |
| 压缩包 | `npm pack` 出来的 `.tgz` | 插件页填 tgz 绝对路径；或 `dsh plugin add E:\path\to.tgz` |
| 目录 | 整个 `dsh-plugin-lx-music` 目录 | 插件页填目录绝对路径（等价于本机 dev 的 link） |

装的时候插件管理器会自己把包名补进 `dsh.profile.bundles`，**不用手改** profile 的 `package.json`。

对方还需要满足三件事：

1. **Windows** —— 窗口显隐走 PowerShell + user32（`package.json` 里声明了 `"os": ["win32"]`）。
2. **落雪音乐 v2.7+**，并在落雪里打开「设置 → 开放 API」（默认 `127.0.0.1:23330`），否则歌词区和胶囊都不出现。
3. 装完**重启一次 DSH**（宿主半边是 Node 进程，模块代码不热重载）；之后客户端改动只需刷新页面。

## 本机开发时怎么装

```powershell
$profileDir = 'C:\Users\liuwang\.dsh\profiles\desktop'
New-Item -ItemType Junction -Path "$profileDir\node_modules\dsh-plugin-lx-music" -Target 'E:\deepseek\dsh-plugin-lx-music'
```

然后 profile 的 `package.json`：

- `dependencies` 里加 `"dsh-plugin-lx-music": "link:E:/deepseek/dsh-plugin-lx-music"`
- `dsh.profile.bundles` 数组里加 `"dsh-plugin-lx-music"`

装完**重启 DSH**（宿主半边是 Node 进程，热更不生效）；浏览器半边刷新页面即可。

## 歌词为什么不再有延迟

老链路是「页面问宿主，宿主问落雪」，三道缓冲叠在一起，最坏要等 1.2 秒才换行：

| 环节 | 改前 | 改后 |
| --- | --- | --- |
| 页面轮询 `/lx-music/lyric` | 500ms | 200ms（只刷新锚点，不负责换行） |
| 宿主缓存（合流用） | 700ms | 120ms |
| 换行时刻由谁决定 | 服务器算好的 `index` | **页面按本机时钟自己算** |
| 换行过渡动画 | 300ms | 180ms |

现在 `/lx-music/lyric` 每帧多带两样东西：

- `lyric.timeline` —— 整首 `[[秒, 文本], …]`（一首歌 2–4KB，本机传无所谓）；
- `play.playbackRate` 与 `at`（服务器读到这一帧的时刻）。

页面拿到锚点（`progress` + `at` + 倍速）后，每一帧（`requestAnimationFrame`）用 `progress + (now - at) × rate`
推算此刻唱到哪，再在时间轴上二分出行号。于是：

- **换行不再等网络**：到点就换，误差只剩一帧（以前用 100ms 定时器，最坏要等 100ms 才反应过来）；
- **漂移会被自动纠正**：轮询每 200ms 刷新一次锚点（写在 `player.live` 里，不触发重渲染），
  所以拖动进度条、暂停、换歌之后的误差最多存在一个轮询周期；
- **暂停时不跑帧循环**，静止画面零开销；标签页隐藏时 rAF 自己停，回到前台重算一次。

换行那一刻的观感由三件事决定，缺一件就会「不丝滑」：

1. **节点得真的重建**。槽位的 key 里必须带文本（`'slot:' + index + ':' + slot.text`）。只用位置当 key 时，
   换行只是把同一个 DOM 节点的文本换掉，节点上一个属性都没变 —— 写在槽位上的 transition 一次也触发不了，看到的就是硬切。
2. **当前句要定高两行**（`minHeight: 2.9em`）。歌词在 1 行 / 2 行之间来回换时整块高度不变，舞台不做垂直重排。
3. **舞台居中要用量出来的像素位移**。`translateY(-50%)` 是百分比，计算值永远是同一个字符串，
   高度变化只改「使用值」，transition 抓不到 —— 必须由 `useStageShift()` 量出真实高度写成 `translateY(-Npx)`
   并过渡，行数变化时整条竖列才是滑过去的。

入场动效：当前句从下方 9px 浮入（`lx-lyric-in`，240ms），上下文行只从更暗处提亮（`lx-lyric-near` / `lx-lyric-far`），
不从全透明闪出；关键帧只写 `from`，`to` 用浏览器算出的内联 opacity，1 / 0.55 / 0.3 三档亮度因此不会被动画抹平。
`prefers-reduced-motion: reduce` 时整套动画关掉。

对应回归断言：`test/lrc.mjs` 查帧里有没有 `timeline` / `playbackRate`，`test/client-bundle.mjs` 用
`plugin.__lxTest.indexAtTimeline` 直接验换行边界（未到首句 → -1、正好踩时间戳 → 该行、两行之间 → 前一行、末句之后 → 末行），
并钉住上面三件事（key 带文本、当前句定高、rAF 调度）与三组关键帧 —— 回退任意一条都会红。

## 已知边界

- 开放 API 没开时，歌词层静默不画（不弹错误、不占位），控制条也不出现；设置页那行会写明「开放 API 未连接」。
- 桌面歌词整个关掉时（落雪里「桌面歌词」开关为关，`desktopLyric.enable=false`），没有可操作的窗口 → `NO_LYRIC_WINDOW`；
  内嵌歌词照样能用（它走 API），只是「关掉内嵌后把浮窗放回来」做不到，会弹提示让用户去落雪里自己打开。
- 空数组的坑：PowerShell 函数 `return @()` 到调用方会变成 `$null`，而 `@($null).Count` 是 1 ——
  一度让脚本以为「有一个歌词窗」。`Get-LyricWindows` 用 `return ,$match` 保住空数组。
- 认窗口靠标题 `Lyric - LX Music` + `Chrome_WidgetWin_1` + `WS_EX_TOPMOST` 兜底；落雪改标题文案就要跟着改 `Test-LyricWindow`。
- 脚本纯 ASCII（PowerShell 5.1 读无 BOM 脚本走 ANSI，中文会乱码），所有中文文案都在 JS 里。
- 歌词窗太窄（视口 < 1120px）时整个歌词层不显示，避免压到对话卡片。

## DSH 的加载机制（实测，踩过坑）

- 宿主半边：改 `cordis.patch.yml` 会让宿主重新 reconcile 条目（禁用/启用立即生效），**但模块代码本身不会重新 import** —— `lib/index.js` 改了必须重启 DSH 进程。
- 浏览器半边：bundle 按 `rev`（mtime/ctime/size 指纹）取 URL，文件一改就换新 URL，**刷新页面即可生效**；`/plugins/events` 的 SSE 会推 `graph` / `rebuilt` 帧。
- `package.json` 的 `dsh.client.inject` 列的是「先加载哪些客户端包」，宿主把它缓存在 `pkgMeta` 这个 Map 里且**没有失效逻辑** —— 改了也必须重启。列的 id 不存在时会被静默忽略，不会导致加载失败。
- 浏览器侧的失败不会冒到宿主：`clientModules` 把每条 `{id, message}` 留在页面内的 `snapshot.failures` 里 —— 所以本插件自带 `/lx-music/client-report` 自报通道。
- **`package.json` 前面多一个 UTF-8 BOM，插件就彻底不加载**：`dsh-app-boot` 的 `loadProfileDirectory` 用 `JSON.parse` 读每个 bundle 的 package.json，带 BOM 直接抛 `SyntaxError: Unexpected token ''`；而这类失败**只进 `skippedBundles`，不打印、不进客户端图、路由也不注册**。表现是「装了、链接在、依赖在，但 `/lx-music/*` 一律 404，重启多少次都一样，日志里一个字都没有」。
  判据：`[System.IO.File]::ReadAllBytes('package.json')[0]` 应该是 `0x7b`（`{`），不是 `0xef`（BOM 首字节）。
  根治：用 `JSON.parse` + `JSON.stringify` 重写文件（Node 写出的 UTF-8 不带 BOM），别用 Windows PowerShell 5.1 的 `Set-Content -Encoding UTF8`（默认加 BOM）。
  `test/no-bom.mjs` 把这条钉成了回归断言 —— 这种失败静默到只能靠字节检查抓。

## 按钮为什么曾经「渲染了但看不见」

第一版按钮在座位上确实挂上了，可屏幕上什么都没有。靠 `client-report` 报回来的几何数据定位到真因：

```
{"stage":"button-rect","rect":{"x":1006,"y":999,"w":17,"h":28},"kids":[]}
```

宽度 17px、`kids` 为空 —— 按钮是个空壳。原因是 `react/jsx-runtime` 的签名是 `jsx(type, props, key)`，
**第三个参数是 `key`，不是子节点**。把 `<span>歌词</span>` 当第三参传进去，它就变成了 key，
`children` 永远是 undefined，于是按钮只剩 padding 加边框。修法：`children` 放进 `props`。修好后：

```
{"stage":"button-rect","rect":{"x":958,"y":999,"w":65,"h":28},"kids":[{"tag":"span","text":"歌词","w":44}]}
```

配套的两条经验：

- 手写 `__ModuleLoader__` bundle 时，`children` 只能放在 props 里；`test/client-bundle.mjs` 里
  「按钮带了子节点」「按钮上写着『歌词』」两条回归断言，正是为了拦住这种静默失败。
- `conversation.input.right` 位于一个 `display:flex` 的行里，flex 项默认会被压缩。按钮要
  `flex: 0 0 auto` + `min-width: max-content`，否则内容会被挤没。

## 舞台几何自检（`stage-rect`）

舞台（控制胶囊 + 歌词）挂载后会上报一次实测矩形，用来在看不到屏幕时证明布局对：

```
{"stage":"stage-rect","controls":{"x":1532,"y":435,"w":107,"h":39},
 "lyrics":{"x":1405,"y":488,"w":234,"h":143},"viewport":{"w":1707,"h":1066}}
```

读法：`controls.y + controls.h`（474）比 `lyrics.y`（488）小 → 胶囊在歌词**上面**；
`controls.x + controls.w` 与 `lyrics.x + lyrics.w` 都是 1639 → 共用**同一条右边界**；
整块 435…631 的中点是 533，正好是视口高度的一半 → 垂直居中。

## 换行动效自检（`stage-shift` / `lyric-style`）

动效是「代码对、页面没跑」的重灾区（keyframes 没注入、key 没换、`translateY(-50%)` 不参与过渡），
所以这里也留了两个一次性自报，隔一层浏览器自己说出来：

```
{"stage":"stage-shift","motion":true,"shift":-112.6}

{"stage":"lyric-style","index":56,"block":172,"rows":[
  {"animation":"none","opacity":0.5,"minHeight":"auto","height":17},
  {"animation":"lx-lyric-far","opacity":0.14,"minHeight":"auto","height":20},
  {"animation":"lx-lyric-near","opacity":0.3,"minHeight":"auto","height":21},
  {"animation":"lx-lyric-in","opacity":0.35,"minHeight":"58px","height":58},
  {"animation":"lx-lyric-near","opacity":0.3,"minHeight":"auto","height":21},
  {"animation":"lx-lyric-far","opacity":0.14,"minHeight":"auto","height":20}]}
```

读法：

- `stage-shift.motion=true` 且 `shift` 是负的像素值 → 新 bundle 确实在页面里求值了，
  居中走的是「量高度 → 写像素位移」这条路，不是 `translateY(-50%)`；
- `lyric-style.rows` 里 `animation` 不是 `none` → 三张关键帧都真的被浏览器认下来了
  （`getComputedStyle(node).animationName` 读的是生效值，不是源码里的字符串）；
- 当前句 `minHeight: 58px` 且 `height: 58px`（20px × 1.45 × 2）→ 定高两行生效；
- 各行的 `opacity` 报的是动画第一帧的值（`.35 / .3 / .14`），不是 0 —— 整块不会随换行暗一下；
- `block` 在多次换行之间不变（本机实测一直是 172）→ 当前句换行不会带动整块重排。

## 为什么歌词能压过别的插件面板（top layer）

现象：打开别的插件的面板（设置页、`dsh-comfyui` 的任务队列）后，歌词和胶囊整个被盖住，只在边上漏出一点点。

原因不是 z-index 不够大，而是**位置放错了层**。`shell.overlay` 这个座位挂在
`.BynINW_overlayLayer`（`position:absolute; z-index:20`）里面，那是一个**独立的堆叠上下文** ——
里面写 `z-index: 2147482000` 也只是在这一层内部排第一，而这一层本身在 `.BynINW_frame` 里排第 20 名，
面板（`.dsc-panel{z-index:900}`、设置页）都在它上面。实测祖先链：

```
div(fixed, z=2147482000) > div(static) > div.BynINW_overlayLayer(z=20) > div.BynINW_frame > body
```

解法是 **popover 的顶层（top layer）**：`node.setAttribute('popover','manual')` + `node.showPopover()`。
顶层不受任何 z-index / 堆叠上下文影响，而且节点**留在 React 树里**（`createPortal` 那条路走不通 ——
DSH 只给客户端 Builtin `ctx`/`React`/`host`/`styles`/`console`，没有 react-dom；把节点搬到 `body`
还会让 React 18 的事件委托失效，按钮直接点不动）。`manual` 模式不会被 light-dismiss 关掉。

三个坑，都踩过：

1. **UA 样式要逐项清掉**。popover 一显示，浏览器就补上 `inset:0 / margin / border / background:Canvas /
   padding / overflow:auto` —— 不清就是白底方块。`stageStyle` / `toastOverlayStyle` 里逐项复位。
2. **`inset:'auto'` 必须写在 `top`/`right` 之前**。它是四方向的简写，排在后面会把刚写好的
   `top:50%`、`right:clamp(...)` 一起抹成 `auto`（React 按对象顺序逐条写 style）。第一版就是这么把
   整条歌词甩到屏幕左上角外面去的 —— 几何自报里 `controls.y = -113` 直接抓到了。
3. **自检要延后**。提顶层的 `useLayoutEffect` 依赖 `stageNode` 这个 state，要等 ref 回调触发重渲染之后
   才跑；当场测会测到「还没提上去」的旧状态，误判成失败。`top-layer-hit` 因此延后 600ms。

自检一条：

```
{"stage":"top-layer-hit","open":true,"others":1,"own":true,
 "hit":{"tag":"path","cls":"","z":"auto"},"parent":{"tag":"div","cls":"","z":"auto"}}
```

`open:true` = 真的进了顶层；`own:true` = 胶囊中心的 `elementFromPoint` 命中的是自己（`path` 是图标），
说明按钮在自己面板上面、点得到；`others` 是当前顶层里的 popover 数量（只有我们一个）。

