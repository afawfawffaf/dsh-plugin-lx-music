# dsh-plugin-lx-music（落雪音乐 · 内嵌歌词 + 播放控制）

[github.com/afawfawffaf/dsh-plugin-lx-music](https://github.com/afawfawffaf/dsh-plugin-lx-music) · MIT · 仅 Windows

把落雪音乐（LX Music）正在播放的歌词，内嵌到 DSH 对话区右侧的壁纸带里：当前行 + 前后各两句，
默认常显。歌词正上方贴着一颗胶囊，放着「上一首 / 播放暂停 / 下一首」。输入框右侧的「歌词」按钮
用来临时收起/展开歌词（收起时只剩胶囊，位置不动），设置页里可以关掉内嵌、改回落雪的桌面歌词窗。

**不接管播放、不打断播放、不弹播放条** —— 歌和声音始终由落雪自己负责；本插件只读它开放的 API
（`127.0.0.1:23330`）做三件事：读当前歌词、发 `/play` `/pause` `/skip-next` `/skip-prev`，
外加一点窗口显隐操作。

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
| POST | `/lx-music/control` | body `{ "action": "prev" \| "next" \| "toggle" }`，走落雪 API 放上一首/下一首/播放暂停 |
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

## 自测

```powershell
cd E:\deepseek\dsh-plugin-lx-music
node test/lrc.mjs
node test/host-routes.mjs
node test/client-bundle.mjs
```

`host-routes.mjs` 会真的调用 PowerShell 把桌面歌词藏起来再放回来，跑完屏幕上应该跟跑之前一样。
它默认**不动播放器**；想真点一次上一首/下一首/暂停，加环境变量：

```powershell
$env:LX_TEST_CONTROL = '1'; node test/host-routes.mjs   # 会暂停再恢复
```

手动试脚本本体：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File lib\lx-music.ps1 -Mode state
powershell.exe -NoProfile -ExecutionPolicy Bypass -File lib\lx-music.ps1 -Mode hide
powershell.exe -NoProfile -ExecutionPolicy Bypass -File lib\lx-music.ps1 -Mode show
```

输出是一行 `LXMUSIC_JSON:{...}`；`hide`/`show` 是幂等的（本来就藏/本来就显示时不重复操作）。

## 分享给别人

这是个标准 npm 包（`package.json` 里带 `dsh.bundle.patch` 与 `dsh.client`），DSH 的「插件」管理页支持四种来源，按你方便的选：

| 方式 | 发什么 | 对方怎么装 |
| --- | --- | --- |
| npm | 包名 `dsh-plugin-lx-music` | 插件页填包名；或 `dsh plugin --profile desktop add dsh-plugin-lx-music` |
| git 仓库 | 仓库地址 | 插件页填 `https://github.com/afawfawffaf/dsh-plugin-lx-music` |
| 压缩包 | `npm pack` 出来的 `.tgz` | 插件页填 tgz 绝对路径；或 `dsh plugin --profile desktop add E:\path\to.tgz` |
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

页面拿到锚点（`progress` + `at` + 倍速）后，每 100ms 用 `progress + (now - at) × rate` 推算此刻唱到哪，
再在时间轴上二分出行号。于是：

- **换行不再等网络**：到点就换，误差只剩本机时钟精度；
- **漂移会被自动纠正**：轮询每 200ms 刷新一次锚点（写在 `player.live` 里，不触发重渲染），
  所以拖动进度条、暂停、换歌之后的误差最多存在一个轮询周期；
- **暂停时不跑定时器**，静止画面零开销。

对应回归断言：`test/lrc.mjs` 查帧里有没有 `timeline` / `playbackRate`，`test/client-bundle.mjs` 用
`plugin.__lxTest.indexAtTimeline` 直接验换行边界（未到首句 → -1、正好踩时间戳 → 该行、两行之间 → 前一行、末句之后 → 末行）。

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
