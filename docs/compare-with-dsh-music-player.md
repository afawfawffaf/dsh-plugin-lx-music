# 对比：kendu76/dsh-music-player v1.0.3 ↔ 本插件 dsh-plugin-lx-music v0.4.0

> 用途：判断「别人那个插件里有什么值得搬过来」，以及**哪些绝对不要搬**。
> 参照物是 kendu76/dsh-music-player v1.0.3 的 README（仓库里没有 `lib/` 源码，
> 所以下面关于它实现的描述只到 README 声称的程度，凡未验证的都标了「README 声称」）。

## 0. 一句话结论

两者不是同一类东西：**它是自带播放器，我们是播放器的外挂**。
它值钱的地方几乎都不在「播放」本身，而在**把状态从浏览器搬到 Host**、**把能力暴露给 agent**、
**把歌词从「一行」做成「一段可读的双语文本」**。这三件事恰好是我们的短板，且都能在现有架构里低成本补上；
它那 80% 的体量（本地曲库、QQ/酷狗/网易云、电台 HLS、TTS 讲书、新闻播报）对我们**是负收益**，不该碰。

## 1. 定位对比

| | dsh-music-player（kendu76） | dsh-plugin-lx-music（我们） |
| --- | --- | --- |
| 谁出声 | **它自己**：Host 扫本地目录 / 拉在线平台，浏览器 `<audio>` 播 | **落雪桌面版**：我们只读 `127.0.0.1:23330` 开放 API |
| 体量 | README 314 行，功能横跨 6 个领域；`lib/client.js` 单体远超我们全仓 | 3 个 JS + 1 个 ps1，共约 100KB，无构建 |
| 失败面 | 自己的播放器、自己的版权风险 | 落雪装了/开着/开了开放 API，三条都满足才有内容 |
| 与 DSH 的耦合 | 深：播放条座位、面板、多标签页单播放器、Host 定时器、模型工具 | 浅：1 个按钮座位 + 1 个 overlay + 1 个设置节 + 几条 HTTP 路由 |
| 升级 DSH 的代价 | 高（复用内部座位与 Host 服务更多） | 低（只依赖 `webServer`、`ctx.loader`、`clientModules` 诊断面） |
| 我们的比较优势 | — | **零播放风险、零版权面、零 TTS 成本**；歌词延迟已做到「本机时钟算行」（rAF + timeline），kendu 的歌词是「服务器算好的行」 |

一句话：**它是「摸鱼全家桶」，我们是「一个做得比别人好一点的歌词层」。**
要么我们保持薄，要么就得承认自己在做第二个播放器——后者见 §5。

## 2. 能力矩阵

| kendu 的能力 | 我们现状 | 该借？ |
| --- | --- | --- |
| 状态全量落 Host（音量/模式/进度/面板位置/搜索历史），刷新与重启都在 | 只有 `localStorage`（`lib/client.js:22` `PREFS_KEY='lx-music:prefs'`，读 `:135` 写 `:150`） | **借**，§4.1 |
| 旧版 `localStorage` → Host 单向迁移、Host 优先 | 无 | **借**（同上，同一条改造的一半） |
| `music_play` 等**模型工具**，agent 能直接控制播放 | 无工具，只有浏览器按钮 | **借**，§4.2 |
| 歌词「原文／翻译」逐句合并，双语种双向识别 | 完全无（`grep 翻译\|translat` 零命中） | **借**，§4.3 |
| 完整歌词面板（进度标识、可拖动/拉伸、位置独立记忆、透明模式） | 只有 ±2 句竖列；面板做不到 | **半借**（只读版可行，跳转被落雪 API 挡住），§4.4 |
| 歌词来源优先级：同名 `.lrc` → 内嵌标签 → 在线兜底 | 落雪已经替我们做完（它 `/lyric` 就是最终文本） | 不借 |
| 进度外推：帧带 `at` + `playbackRate`，页面按本机时钟算当前行 | **已实现**（`lib/lx-api.js:249` `timeline`、`:240` `playbackRate`；`lib/client.js:489` `POLL_MS=200`） | 已领先，保持 |
| 正/负命中分档缓存（README 声称 6h / 30min） | 只缓存 120ms 用于合流（`lib/lx-api.js:162` `cacheMs`） | 不必：歌曲不变就不重拉 `/lyric`（`:219` `songKey` 判定） |
| 失败「宁缺毋假」：宁可不生成也不拿旧数据顶 | **已实现**（`lib/lx-api.js:255` `offlineValue` → `api.enabled:false`，页面静默不画） | 已对齐 |
| 诊断端点（`/tts-logs`、`client-report`、`stage-rect` 自报） | **我们有更细的**：`/lx-music/debug`、`/lx-music/client-report`、`stage-rect`/`stage-shift`/`lyric-style` | 已领先 |
| 多标签页共用一个播放器、其余静音并同步显示 | 天然无此问题（我们只读，多标签并发轮询最多多几次请求） | 不借 |
| 本地曲库扫描（500 首上限、递归 4 层、音质识别） | 落雪管 | 不借 |
| 在线 QQ/酷狗/网易云三个页签（扫码登录、逐字歌词） | 落雪管，且它自己承担风控 | 不借 |
| 网络电台 + Host 端纯 Node 转 HLS(m3u8)→AAC | 落雪管 | 不借 |
| AI 讲书（txt/epub 结构解析 + TTS，4 种音色） | 无（依赖 xiaomi 提供方，限时免费） | 不借 |
| 每日新闻播报 + 多定时任务 + 10 源 RSS 池 | 无 | 不借 |
| 频谱可视化（柱状/波形两式） | 无 | 不借（落雪窗口里就有） |
| 播放条三位置（输入框上方/底部/悬浮拖动） | 只有「壁纸带」一个位置 | 不借（见 §5 的例外） |
| 滚轮调音量 1%/5% 双档 | 落雪管 | 不借 |
| 防熄屏 | 落雪设置里管 | 不借 |

## 3. 为什么「薄」对我们是对的

把上面这些「不借」加起来的成本，是我们现在全部代码的 10 倍以上，换回来的是**落雪已经做好、且比我们更专业**的能力：
逐字歌词（QRC/KRC/YRC）、音质档位、扫码登录、HLS、离线缓存。我们重做一遍的唯一结果是：
**同一个功能两套实现、两份 bug、两份版权说明。**

反过来看，kendu 的 README 里有两句话正好说明了它的处境，也是我们不必复制的边界：

- 每个在线平台都要带一段「**非官方接口 / 仅供个人学习 / 严禁商用 / 账号风控自担**」的声明（README 103–113、138–140、154–156 行）——这是自带播放器的固有税。
- 它的播放器「浏览器自动播放被拦截，点一次 ▶ 解锁」（README 240–241 行）——凡自建 `<audio>` 必踩。

我们只发 `/play` `/pause` `/skip-*`，这两类问题**结构上不存在**。

## 4. 值得借的四件事（按 ROI 排序）

### 4.1 把偏好从 localStorage 搬到 Host（含单向迁移）

**为什么**：现在 `lib/client.js:135/:150` 只读 `window.localStorage`。README（kendu 84–88 行）声称
dsh-desktop 每次启动端口随机、浏览器存储按源隔离，因此 localStorage 里的偏好在桌面版重启后会丢。
这条**我们没验证**，但即使不成立也有实打实的好处：多标签页一致、清缓存不丢、换机可带走、设置页能看到「真值」。

**怎么落**：

1. 宿主新增两条路由（沿用现有 `ctx.webServer.register` 风格，`lib/index.js:278` 起）：
   - `GET /lx-music/prefs` → `{ ok, prefs }`（文件不存在时 `prefs: null`）
   - `POST /lx-music/prefs` → 合并写 `~/.dsh/lx-music-prefs.json`，返回写入后的整份
2. 合并语义用「**浅合并白名单键**」，不做深合并：键只允许 `{ embedded, lastStageOffset, panelOpen, panelRect, mergeTranslation }` 之类的枚举；
   未知键直接丢弃，防脏数据把文件写膨胀。
3. 客户端读路径改成 **Host 优先 → 空则回退 localStorage → 立即 POST 迁移一次**，迁移成功后打一个
   `prefsMigrated: true` 标记，避免每次启动都读旧副本；**永远不把 Host 的值写回 localStorage**（单向，防止两边打架）。
4. 写路径：本地先更新内存 + 立即渲染（乐观），再 debounce ~300ms POST；POST 失败不阻塞 UI、不清本地内存。
5. 幂等：文件写入用「写临时文件 + rename」，避免半截 JSON 让下次启动 `JSON.parse` 抛错（这条我们踩过 BOM 的坑，
   见 README 231 行；同理 `JSON.parse` 失败应当**当作空偏好**继续跑，而不是让整个宿主半边挂掉）。

**验收**：`test/host-routes.mjs` 加三例——首次 GET 空、POST 后 GET 能读回、坏 JSON 文件时不抛错且 GET 返回 `prefs:null`。
再加一例：客户端迁移只发生一次（用 `fetch` 桩计数）。

**工作量**：约半天（含测试）。风险低，可单独发一版。

### 4.2 暴露模型工具 `music_control`（agent 能直接暂停/切歌）

**为什么**：这是 kendu 真正「多出来的一维」——`music_play`（README 22 行）。我们的版本对应物很自然：
`music_control`。用户说「下一首」「先停一下」「现在放的是什么」，不必去点胶囊。

**怎么落**（这是 DSH 宿主侧的权威契约，不是猜的）：

`lib/index.js:191` 现在是

```js
export const inject = ['webServer']
```

改成 `export const inject = ['webServer', 'tools']`，然后在 `apply(ctx)` 里注册。
`ToolDefinition` 的精确形状（来自宿主 `tools` 服务）：

```ts
interface ToolSchema { name: string; description: string; parameters: Record<string, unknown> }
interface ToolDefinition extends ToolSchema {
  readonly output: {
    readonly schema: JsonSchemaNode
    render(args: unknown, value: JsonValue): ContentBlock[]
    presentationMeta?(args: unknown, value: JsonValue): JsonValue
  }
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>
  projectContent?(exec, result): ContentBlock[] | undefined
  finalizeContent?(exec, result): ContentBlock[] | undefined
  timeoutMs?: number
  isConcurrencySafe?(args: unknown): boolean
  presentCall?(args: unknown): ToolCallView | undefined
  presentResult?(args: unknown, result: ToolResult): ToolResultView | undefined
}
// 注册：ctx.tools.register(def) → 返回 disposer（丢进 ctx.effect 里，随插件卸载）
```

参数设计**抄 kendu 的「一个工具 + 判别字段」**，不要拆成 4 个工具：

```js
parameters: {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['status', 'toggle', 'next', 'prev'],
              description: 'status 只读；其余改播放状态' },
    desired: { type: 'string', enum: ['playing', 'paused'],
               description: '可选。要求「确保处于这个状态」，比 toggle 幂等' },
  },
  required: ['action'],
}
```

要点（每条都有坑，都是我们现有代码能直接复用的）：

- `execute` 里**直接复用 `lxApi.control()`**（`lib/lx-api.js:318`），失败时把 `HINTS`（`lib/index.js:33`）里那句话当
  `execute` 抛出的 message —— agent 读不懂错误码，读得懂人话。
- `action:'status'` 复用 `lxApi.read()`，只回 `song / play.status / play.progress / lyric.line`，**不要回整首 timeline**
  （一首 2–4KB，灌进对话上下文纯浪费）。
- `isConcurrencySafe: () => false`：切歌不是幂等的，别让调度器并发。
- `presentCall` 返回 `{ card: 'generic', title: '落雪音乐', kind: 'other' }` 之类，让卡片好看；
  不写也能跑，先能跑再加。
- **不要**在工具里做「拉起播放器」那套 15 秒等待（`lib/index.js:45` `LAUNCH_WAIT_MS`）：工具超时会把整轮对话卡住。
  工具只做「API 通就执行、不通就回 `API_OFFLINE` + hint」，拉起逻辑留给用户点胶囊。
- `description` 里明确写「**仅在用户明确要求控制音乐时调用**」，否则模型看到 `status` 会手痒每轮都查一次。
- 工具对**所有** agent 可见（全局注册），所以还要能跨会话用；落雪不开时它返回的是一句可执行的话，不是异常栈。

**验收**：`test/tool.mjs` 新文件——假 `ctx.tools` 收下 definition，直接调 `execute({action:'status'})` 验形状；
`execute({action:'next'})` 用假落雪 API 验真的发了 `/skip-next`；API 关掉时验 `code:'API_OFFLINE'` + hint 文案。
再顺手断言 `inject` 里含 `'tools'`（漏了它 `ctx.tools` 是 undefined，工具静默不存在）。

**工作量**：约半天。风险：中（新增了 agent 可触发的写操作），所以描述与 `isConcurrencySafe` 要谨慎。

### 4.3 歌词「原文／翻译」逐句合并（双语种双向）

**为什么**：这是唯一一条**抄完立刻能看见效果**的。kendu 把它做透了（README 281–292 行），
而我们 `grep` 过：`lib/` 里对翻译零支持。落雪 `/lyric` 拿到的是最终 LRC 文本，
外语歌的双语歌词常常就是「翻译行带自己的时间戳、紧跟原句」这种写法，我们目前会把它们当**两句歌**排进 6 行槽位，
观感是「一首歌的歌词翻倍、且每句都要多切一屏」。

**怎么落**：纯函数加在 `lib/lx-api.js`，紧跟 `parseLrc`（`:36`）之后：

```js
// 输入 parseLrc 的 lines（已按时间升序），输出 { lines: [{time, text, translation?}], mergedPairs }
export function mergeTranslations(lines) { … }
```

判定规则（照 kendu 的严格度，宁漏不错）：

1. **主语言先定**：统计整首歌词的脚本占比（Han `\p{Script=Han}` vs Latin `\p{Script=Latin}`/Cyrillic/Kana），
   占比高者为「主语言」。**不假设中文是主语言**，这才支持「中文歌 → 英文翻译」的反向。
2. **相邻 + 时间接近**才可能是同一句：`|t[i+1] - t[i]| <= 0.5s`（kendu 说的是「时间戳接近」，0.5s 是保守取值，
   实际双语 LRC 多数只差 0.2–0.5s）。
3. **两行必须是不同脚本**：一行以主语言为主（该行内主语言字符 ≥ 60%），另一行以非主语言为主。
   这样「歌名/水印/作词作曲」这种中英混排的杂项行不会被当成翻译吞掉——kendu 明确踩过（README 292 行）。
4. 命中就把 `lines[i].translation = lines[i+1].text`，并把 `i+1` 从主时间轴删掉。
5. 合并后 `timeline` 的元素从 `[time, text]` 变成 `[time, text, translation|null]`（`lib/lx-api.js:249`）；
   `slots`（`:246`）每槽多一个 `translation` 字段。

客户端：当前句槽位渲染成两行（原文 + 一行小字的翻译）。**注意几何契约**：
README 199–204 行那三条「key 带文本 / 当前句定高 2.9em / 量像素位移」是换行丝滑的前提，
加一行翻译等于当前句从定高 2 行变 3 行 → `minHeight` 要跟着变成 `4.3em` 左右（或让翻译行 `line-height` 更小），
并且 `test/client-bundle.mjs` 里钉住 `minHeight` 的断言要一起改——**改漏了就是「换行时整块跳一下」这个老 bug 回归**。

**开关**：设置页加一项「双语合并」（默认开）。误判的代价是「少显示一句翻译」或「多显示一行原文」，
用户能一键关掉，比让它悄悄吃掉一行歌词好。

**验收**：`test/lrc.mjs` 加四例——外文歌→中文翻译（合并、`mergedPairs` 计数）、中文歌→外文翻译（反向也合）、
水印行不误判（`[00:00.00]词：某某` 与下一行英文同居不合并）、无翻译时不改任何字段（现状回归）。

**工作量**：半天到一天（纯函数好写，几何那半是细活）。

### 4.4 只读版「完整歌词面板」（跳转这一半先别做）

**为什么**：现在是「±2 句」，想回看前面唱过的那句没有办法。kendu 的歌词面板（README 16 行）值钱的是
**位置/尺寸独立记忆**和**透明模式**这两个交互决定，不是它的实现。

**卡在哪**：kendu 面板能「标识当前进度、可拖动」并且能点跳，是因为播放器是它自己的。
**落雪开放 API 没有 seek**（README 74–80 行只列了 `/status` `/lyric` `/play` `/pause` `/skip-next` `/skip-prev`），
所以「点一行跳过去」做不了。做出来只能是「点一行什么也不发生」，比没有更糟。

**所以**：先做**只读**面板——整首时间轴列表，当前行高亮并自动滚到可视区中央，hover 显示时间戳；
再抄两个交互细节：面板位置/尺寸写进 §4.1 的 Host 偏好（`panelRect`），以及「透明模式」开关。
等落雪开放 API 出了 seek/`/progress` 再补跳转，代码位置留在「点击 → POST `/lx-music/seek`」一个钩子上即可。

**工作量**：只读版约一天（要接 §4.1 的偏好存储才谈得上「位置记忆」）。

## 5. 明确不建议抄的（附理由，别半年后又想抄）

| 项 | 为什么不 |
| --- | --- |
| 本地曲库扫描 + 流式播放 + 队列/模式 | 等于自建播放器。kendu 的 `lib/client.js` 光播放条/面板/频谱/歌单/讲书/新闻就远超我们全仓，抄一半会得到一个两边都不如的东西。落雪已经做了十年。 |
| QQ/酷狗/网易云三个在线页签 | 每个都要「非官方接口 + 账号风控 + 免责声明」。我们插件的全部价值是「不碰版权、不碰登录态」，这条一破，风险全转嫁到作者。 |
| 电台 + HLS(m3u8)→AAC 转码 | 技术上很漂亮（kendu 用纯 Node 做了 TS 分片与裸 ADTS 两种容器），但它是给「没有播放器的人」准备的。我们有落雪。 |
| AI 讲书 / 新闻播报 / TTS | 依赖 xiaomi 提供方（README 173 行：限时免费）、要管定时器、要管「熄屏不出声」、要管执行会话生命周期。这是另一个产品，不是歌词层。 |
| 频谱可视化 | 落雪窗口里有；我们塞进 401px 的壁纸带里只会更挤。 |
| 播放条三位置（含悬浮拖动） | 我们的舞台已经绑在壁纸带上，且「收起只剩胶囊」等价于它的悬浮态；再加第三套布局，几何自检（`stage-rect`/`stage-shift`）要三份，收益接近零。 |
| 多标签页单播放器 | 我们只读，没有「谁出声」的问题。唯一要防的是别让两个标签页各发一次 toggle（现在的乐观更新 + 200ms 对齐已经够）。 |
| 正/负命中分档缓存（6h/30min） | 那是给「在线取词」的。我们每首歌只拉一次 `/lyric`（`lib/lx-api.js:219` 按 `songKey` 判定），没有重复请求可省。 |

## 6. 顺手能抄的小而硬的工程点

这几条不涉及功能，是「写法」，抄了省钱：

1. **单例合并并发**：kendu 对「连点两下」的处理与我们 `lib/index.js:209` `toggling()` / `:217` `applying` 是同一个思路——
   继续用，工具那条路径也要经过同一层，否则「agent 说下一首」和「用户点下一首」会各发一次。
2. **状态码 → 人话的单一出口**：我们 `HINTS`（`lib/index.js:33`）+ `decorate()`（`:160`）已经比 kendu 的 `hintFor` 更完整，
   工具失败时复用它，不要新写一套文案。
3. **写文件要防半截**：见 §4.1 第 5 点，`JSON.parse` 失败降级为空而不是抛出。
4. **诊断优先于猜测**：kendu 靠 `stage-rect` 自报才定位到「按钮宽度 17px、kids 为空」那个 jsx-runtime 坑（README 236–251 行）。
   我们已经有 `client-report`，**§4 任何一项改完，先看一眼自报再宣布完成**。

## 7. 风险清单

- **工具带来的行为面**：模型可能在没有播放时反复调 `status`。缓解：描述写死「用户明确要求时」+ `presentCall` 卡片清爽 + 失败文案指路。
- **偏好搬到 Host 后的一致性**：两个标签页同时改设置会互相覆盖（后写赢）。当前可接受；若在意，POST 里带 `at` 做「新的赢」。
- **双语合并误判**：严格规则 + 默认开 + 一键关，成本可控；不要把「翻译行」写进 `timeline` 后又被 `findLineIndex` 当成独立一句。
- **改了 `minHeight` 忘改断言**：这是本项目唯一会「静默回退」的地方，见 §4.3 最后一段。

## 8. 如果只做一件事

做 **§4.2（工具）**。它是唯一一项「现在做不到、做完之后体验变化最大、而且不碰任何几何与动画契约」的改造，
半天就有结果，且 §4.1 的偏好存储可以下一步独立发版。
