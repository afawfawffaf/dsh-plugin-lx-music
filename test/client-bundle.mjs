/**
 * dsh-plugin-lx-music — 浏览器半边的离线自测。
 *
 * 不起浏览器，只把 lib/client.js 当成「__ModuleLoader__ factory」执行一遍：
 *  · factory 必须返回 { apply, inject, name }
 *  · apply(ctx) 必须往 4 个座位注册（输入框按钮 / 舞台（胶囊 + 歌词） / 提示卡 / 设置页）
 *  · 组件本身要能渲染出一棵树（用桩 jsx 运行时与桩 hooks，不依赖 react）
 *
 * 跑法：node test/client-bundle.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')

const failures = []
const check = (label, condition, detail) => {
  if (condition) {
    console.log('  ok   ' + label)
    return
  }
  failures.push(label + (detail ? ' — ' + detail : ''))
  console.log('  FAIL ' + label + (detail ? ' — ' + detail : ''))
}

// ---- 桩：react / react-jsx-runtime / __ModuleLoader__ / 浏览器全局 ----

const loader = { queue: [] }
const stubs = {
  react: {
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useRef: (initial) => ({ current: initial }),
    // 不执行 effect：否则会起轮询定时器，这个测试只验形状。
    useEffect: () => {},
    useCallback: (fn) => fn,
  },
  'react/jsx-runtime': {
    jsx: (type, props, key) => ({ type, props: props ?? {}, key }),
    jsxs: (type, props, key) => ({ type, props: props ?? {}, key }),
    Fragment: Symbol.for('react.fragment'),
  },
}

globalThis.window = {
  __ModuleLoader__: {
    load: (registration) => loader.queue.push(registration),
    create: () => {
      throw new Error('这个测试不需要真正的模块系统')
    },
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  innerWidth: 1707,
  innerHeight: 1066,
}

const fetched = []
globalThis.fetch = async (url, init) => {
  fetched.push({ url, method: (init && init.method) || 'GET' })
  return { ok: true, json: async () => ({ ok: true }) }
}

// ---- 执行 bundle ----
try {
  new Function(source)()
} catch (error) {
  console.error('bundle 执行失败：', error)
  process.exit(1)
}

check('bundle 用 __ModuleLoader__.load 注册了一次', loader.queue.length === 1, '实际 ' + loader.queue.length)
const registration = loader.queue[0]
check('注册的 id 是包名', registration?.id === 'dsh-plugin-lx-music', String(registration?.id))

const requireStub = (specifier) => {
  if (!(specifier in stubs)) throw new Error('未预期的 external: ' + specifier)
  return stubs[specifier]
}

const plugin = registration.factory(requireStub)
check('factory 返回了 plugin', plugin !== null && typeof plugin === 'object')
check('有 apply', typeof plugin.apply === 'function')
check('inject 含 slots 与 locale', Array.isArray(plugin.inject) && plugin.inject.includes('slots') && plugin.inject.includes('locale'), JSON.stringify(plugin.inject))

// ---- 假 ctx ----
const registered = []
const dictionary = { zh: { button: '歌词', settingsNav: '落雪音乐', settingsTitle: '落雪音乐' } }
const fakeCtx = {
  effect: (fn) => {
    fn()
    return () => {}
  },
  locale: {
    register: (ns, dicts) => {
      registered.push({ kind: 'locale', ns, dicts })
      return () => {}
    },
    bind: (ns) => (key) => (ns === 'lx-music' && dictionary.zh[key]) || key,
  },
  slots: {
    inject: (slotName, factory) => {
      const disposer = factory()
      return typeof disposer === 'function' ? disposer : () => {}
    },
    register: (options, component) => {
      registered.push({ kind: 'slot', options, component })
      return () => {}
    },
  },
}

try {
  plugin.apply(fakeCtx)
} catch (error) {
  console.error('apply 抛错：', error)
  failures.push('apply 不抛错 — ' + error.message)
}

check('注册了中文与英文词典', registered.filter((row) => row.kind === 'locale').length === 1)
const slots = registered.filter((row) => row.kind === 'slot')
check('注册了 4 个座位', slots.length === 4, '实际 ' + slots.length)

const inputRight = slots.find((row) => row.options.name === 'conversation.input.right')
const overlays = slots.filter((row) => row.options.name === 'shell.overlay')
const settings = slots.find((row) => row.options.name === 'settings.section')

check('输入框右侧座位已注册', inputRight !== undefined)
check('overlay 注册了两个（舞台 + 提示卡）', overlays.length === 2, '实际 ' + overlays.length)
check('舞台 id 是 lx-music-stage', overlays.some((row) => row.options.id === 'lx-music-stage'), overlays.map((r) => r.options.id).join(','))
check('提示卡 id 是 lx-music-toast', overlays.some((row) => row.options.id === 'lx-music-toast'), overlays.map((r) => r.options.id).join(','))
check('设置页座位已注册', settings !== undefined)
check('设置页有 label', typeof settings?.options.label === 'function' && settings.options.label() === '落雪音乐', String(settings?.options.label?.()))
check('输入框座位有 id', inputRight?.options.id === 'lx-music', String(inputRight?.options.id))
check('座位声明了 inject()', typeof inputRight?.options.inject === 'function')
const injected = inputRight?.options.inject()
check('inject() 给了 t', typeof injected?.t === 'function')

// ---- 组件能渲染（桩 jsx 下只验证不抛错、树形合理）----
const Button = inputRight?.component
let tree
try {
  tree = Button({ t: injected.t })
} catch (error) {
  console.error('按钮渲染抛错：', error)
  failures.push('按钮能渲染 — ' + error.message)
}
check('按钮返回一个元素', tree !== undefined && tree !== null && typeof tree === 'object')
check('按钮根节点是 button', tree?.type === 'button', String(tree?.type))

// 回归：jsx(type, props, key) 的第三参是 key，把 children 传在那里会让按钮变成空壳（21px 宽、无字）。
const inner = tree?.props?.children
check('按钮带了子节点', inner !== undefined && inner !== null, String(inner))
check('子节点是 span', inner?.type === 'span', String(inner?.type))
const innerKids = inner?.props?.children
check('子节点里既有图标也有文字', Array.isArray(innerKids) && innerKids.length === 2, String(innerKids?.length))
check('图标是个组件', typeof innerKids?.[0]?.type === 'function', typeof innerKids?.[0]?.type)
check('按钮上写着「歌词」', String(innerKids?.[1]?.props?.children) === '歌词', String(innerKids?.[1]?.props?.children))
check('按钮有 aria-pressed', tree?.props?.['aria-pressed'] === 'false', String(tree?.props?.['aria-pressed']))

const Stage = overlays.find((row) => row.options.id === 'lx-music-stage')?.component
let stageTree
try {
  stageTree = Stage({ t: injected.t })
} catch (error) {
  console.error('舞台渲染抛错：', error)
  failures.push('舞台能渲染 — ' + error.message)
}
check('没有播放数据时舞台返回 null', stageTree === null, String(stageTree))

// 布局回归：胶囊必须排在歌词之前（同一个竖列里，胶囊在上、歌词在下）。
const stageSource = String(Stage)
const iControls = stageSource.indexOf("'controls',")
const iLyrics = stageSource.indexOf("'lyrics',")
check(
  '舞台里控制胶囊排在歌词之前',
  iControls !== -1 && iLyrics !== -1 && iControls < iLyrics,
  `controls@${iControls} lyrics@${iLyrics}`,
)

const Toast = overlays.find((row) => row.options.id === 'lx-music-toast')?.component
let toastTree
try {
  toastTree = Toast({})
} catch (error) {
  console.error('提示卡渲染抛错：', error)
  failures.push('提示卡能渲染 — ' + error.message)
}
check('没有提示时提示卡返回 null', toastTree === null, String(toastTree))

const Settings = settings?.component
let settingsTree
try {
  settingsTree = Settings({ t: injected.t })
} catch (error) {
  console.error('设置页渲染抛错：', error)
  failures.push('设置页能渲染 — ' + error.message)
}
check('设置页返回一个元素', settingsTree !== undefined && settingsTree !== null && typeof settingsTree === 'object')
const settingsKids = settingsTree?.props?.children
check('设置页有标题行', Array.isArray(settingsKids) && String(settingsKids[0]?.props?.children) === '落雪音乐', String(settingsKids?.[0]?.props?.children))
const row = Array.isArray(settingsKids) ? settingsKids[1] : null
check('设置页有开关行', row?.type === 'div', String(row?.type))
const switchNode = row?.props?.children?.[1]
check('开关是 role=switch 的按钮', switchNode?.type === 'button' && switchNode?.props?.role === 'switch', String(switchNode?.type))
check('开关默认打开', switchNode?.props?.['aria-checked'] === 'true', String(switchNode?.props?.['aria-checked']))

// ---- 本地推算：换行不再等轮询（这是「歌词有延迟」的根治点）----
const lxTest = plugin.__lxTest
check('暴露了 __lxTest', lxTest !== undefined && typeof lxTest.indexAtTimeline === 'function')
const tl = [[10.5, 'a'], [20, 'b'], [30, 'c']]
check('未到首句 → -1', lxTest.indexAtTimeline(tl, 3) === -1, String(lxTest.indexAtTimeline(tl, 3)))
check('正好踩在时间戳上 → 该行', lxTest.indexAtTimeline(tl, 20) === 1, String(lxTest.indexAtTimeline(tl, 20)))
check('两行之间 → 前一行', lxTest.indexAtTimeline(tl, 25.4) === 1, String(lxTest.indexAtTimeline(tl, 25.4)))
check('最后一行之后 → 末行', lxTest.indexAtTimeline(tl, 99) === 2, String(lxTest.indexAtTimeline(tl, 99)))
const localSlots = lxTest.slotsAtTimeline(tl, 1, 2)
check('本地切片仍是 5 槽', localSlots.length === 5, String(localSlots.length))
check('中间槽是 current', localSlots[2].role === 'current' && localSlots[2].text === 'b', JSON.stringify(localSlots[2]))
check('越界槽是 empty', localSlots[0].role === 'empty' && localSlots[0].text === '', JSON.stringify(localSlots[0]))
check('下一句在右侧槽里', localSlots[3].text === 'c', JSON.stringify(localSlots[3]))
check('舞台确实用本地推算取当前行', stageSource.includes('indexAtTimeline') && stageSource.includes('progressNow'))

// ---- 回归：「歌词切换不丝滑」----
// 之前槽位的 key 只有位置（slot-0..4），换行时 React 复用同一个节点、只改文本，
// 节点上没有任何属性变化，写在槽位上的 transition 一次也触发不了 → 硬切。
// 现在要求：key 带文本（换行即重建）、当前句挂入场动画、且当前句定高两行（不抖高度）。
const motionCss = String(lxTest.motionCss || '')
check('关键帧里有「从下方浮入」的一帧', motionCss.includes('@keyframes lx-lyric-in'), motionCss)
check(
  '入场不从全透明开始（否则每换个行整块歌词暗一下，是闪不是滑）',
  motionCss.includes('lx-lyric-in{from{opacity:.35'),
  motionCss,
)
check(
  '上下文行只做提亮，不从全透明闪出',
  motionCss.includes('@keyframes lx-lyric-near') && motionCss.includes('@keyframes lx-lyric-far'),
  motionCss,
)

const curStyle = lxTest.slotStyle({ text: 'a', role: 'current', distance: 0 })
const nearStyle = lxTest.slotStyle({ text: 'b', role: 'next', distance: 1 })
const farStyle = lxTest.slotStyle({ text: 'c', role: 'next', distance: 2 })
const emptyStyle = lxTest.slotStyle({ text: '', role: 'empty', distance: 2 })
check('当前句是定高两行的框（1 行 / 2 行换行时整块高度不变）', curStyle.minHeight === '2.9em', String(curStyle.minHeight))
check('当前句挂上了入场动画', String(curStyle.animation || '').includes('lx-lyric-in'), String(curStyle.animation))
check('相邻行用 near 动画', String(nearStyle.animation || '').includes('lx-lyric-near'), String(nearStyle.animation))
check('外圈行用 far 动画', String(farStyle.animation || '').includes('lx-lyric-far'), String(farStyle.animation))
check('空槽不加动画', emptyStyle.animation === undefined, String(emptyStyle.animation))
check('槽位 key 带文本（否则换行复用节点、动画永不触发）', stageSource.includes("'slot:' + (firstIndex + index)"), '没找到带文本的 key')
check(
  '换行按帧对齐（rAF 调度 + 取消，不是 100ms 定时器）',
  stageSource.includes('requestAnimationFrame(frameLoop)') && stageSource.includes('cancelAnimationFrame(raf)'),
  '没找到 rAF 调度/取消',
)
check('舞台居中用了量出来的像素位移（百分比位移不参与过渡）', stageSource.includes('stageStyle(shift)'), '没找到 stageStyle(shift)')

// ---- 滚动看词：翻得到上下文，停手 2 秒滑回正在唱的那句 ----
check(
  '歌词窗口上下各多铺 12 句（滚得到上下文）',
  source.includes('const BROWSE_SPAN = 12') && stageSource.includes('slotsAtTimeline(timeline, localIndex, BROWSE_SPAN)'),
  '没有为滚动多铺上下文',
)
check(
  '停手 2 秒回到当前句',
  source.includes('const BROWSE_IDLE_MS = 2000') && source.includes('centerOnCurrent(true)'),
  '没有自动回位',
)
check(
  '回位位置用矩形差算（offsetTop 相对的是定位祖先，会滑到最底部）',
  source.includes('rowBox.top - listBox.top + list.scrollTop') && !source.includes('Math.round(row.offsetTop'),
  '还在用 offsetTop 定位',
)
check(
  '滚轮按坐标截（舞台 pointerEvents: none，收不到 native 滚动）',
  source.includes("window.addEventListener('wheel', onWheel, { passive: false, capture: true })") &&
    source.includes('event.clientX < box.left'),
  '没在歌词框上截滚轮',
)
check(
  '一格滚轮走一行（原样 += deltaY 一格跳五行）',
  source.includes('const BROWSE_WHEEL = 0.25') &&
    source.includes('list.scrollTop += event.deltaY * unit * BROWSE_WHEEL'),
  '滚轮步长没缩放',
)
check(
  '滚动容器定高 + 藏滚动条',
  stageSource.includes('data-lx-lyric-list') &&
    source.includes('height: \'150px\'') &&
    source.includes('scrollbarWidth: \'none\''),
  '视口没定高或滚动条露出来了',
)
check(
  '当前句打了标记（回位靠它找锚点）',
  stageSource.includes("'data-lx-current': isCurrent"),
  '当前句没有标记',
)
const distant = lxTest.slotStyle({ text: 'x', role: 'next', distance: 12 })
check('滚上去的远端句子也读得清（字号不再缩到 12px）', distant.fontSize === '14px', String(distant.fontSize))
check('远近只靠明暗区分', distant.opacity === 0.3, String(distant.opacity))

// ---- 逐字着色：亮到哪个字就是唱到哪个字 ----
const splitCn = lxTest.charsOf('心之所动')
check('中文按字切', JSON.stringify(splitCn) === JSON.stringify(['心', '之', '所', '动']), JSON.stringify(splitCn))
const splitEn = lxTest.charsOf('Tell me why')
check(
  '英文按词切（不然单词会断在中间）',
  JSON.stringify(splitEn) === JSON.stringify(['Tell', ' ', 'me', ' ', 'why']),
  JSON.stringify(splitEn),
)
check('空行也有一个字可占位', JSON.stringify(lxTest.charsOf('')) === JSON.stringify(['\u00a0']), JSON.stringify(lxTest.charsOf('')))
check(
  '当前行拆成逐字 span、初始是暗色',
  stageSource.includes('charsOf(text).map') && stageSource.includes("jsx('span', { style: { color: LYRIC_DIM }"),
  '当前行没有拆字',
)
check(
  '每帧只改「刚亮/刚灭」的字（不整块重渲染）',
  source.includes('const paintChars = (progress, index) =>') &&
    source.includes('for (let i = begin; i < lit && i < total; i += 1)') &&
    source.includes('litCount.current = lit'),
  '逐字着色没有接在帧循环上',
)

// ---- 按字长加权：别让 `extraordinary` 和「的」一样长 ----
check('中文一个字算一拍', lxTest.unitWeight('心') === 1, String(lxTest.unitWeight('心')))
check('英文一个词按字母数', lxTest.unitWeight('Tell') === 4, String(lxTest.unitWeight('Tell')))
check('空格不占时间', lxTest.unitWeight(' ') === 0, String(lxTest.unitWeight(' ')))
check('标点停半拍', lxTest.unitWeight('，') === 0.5, String(lxTest.unitWeight('，')))
check('长单词真的比短单词占得多', lxTest.unitWeight('extraordinary') === 13, String(lxTest.unitWeight('extraordinary')))
check(
  '推进按累计权重算（不是按第几个字）',
  source.includes('sum += unitWeight(node ? node.textContent : \'\')') &&
    source.includes('while (lit < total && cumulative[lit] <= reached) lit += 1'),
  '还在按字数均分',
)

// ---- 回归：「点播放但落雪没开」要顺手拉起播放器 ----
// 拉起可能要几秒，所以点下去先给一句提示；并且把「我想让它播」带上，
// 免得播放器起来时本来就是播放态，重放的那次 toggle 反而把歌关掉。
check(
  '控制请求会带上想去的状态',
  source.includes('const postControl = (action, desired)') && source.includes('{ action, desired }'),
  '没找到 desired 透传',
)
check(
  '点播放时把 intended 状态一起发出去',
  stageSource.includes("postControl(action, nextPlaying === undefined"),
  '没找到 postControl(action, desired)',
)
check(
  '还没有任何数据（播放器没开）时先提示一句再发请求',
  stageSource.includes("if (frame === null) emit({ title: t('launchTitle')"),
  '没找到拉起前的提示',
)
check(
  '中英文都备了「正在打开」的文案',
  source.includes("launchTitle: '正在打开落雪音乐'") && source.includes("launchTitle: 'Starting LX Music'"),
  '文案缺一种语言',
)
check(
  '「拉起来了但 API 没开」有专门的说法',
  source.includes("code === 'API_OFFLINE_AFTER_LAUNCH'"), '没找到 API_OFFLINE_AFTER_LAUNCH 分支',
)


// ---- 回归：「别的插件面板一开，歌词和按钮就被盖住」要压到浏览器顶层 ----
// 座位本身挂在一个 z-index:20 的堆叠上下文里（实测 .BynINW_overlayLayer），
// 里面写多大的 z-index 都白搭，所以只能靠 popover 的 top layer。
check(
  '舞台被提到 popover 顶层（z-index 再大也压不过别人的堆叠上下文）',
  source.includes("setAttribute('popover', 'manual')") && source.includes('showPopover()'),
  '没找到 popover 顶层',
)
check('舞台真的接上了顶层（不是只定义了函数）', stageSource.includes('useTopLayer(stageNode)'), '舞台没调用 useTopLayer')
check('提示卡也提到顶层', source.includes('useTopLayer(overlayNode)'), '提示卡没调用 useTopLayer')
check(
  '顶层复位了 popover 的 UA 样式（否则歌词块变成白底方块）',
  source.includes("inset: 'auto'") && source.includes("background: 'transparent'"),
  '没复位 inset/background',
)
check(
  '测高 ref 没被顶层 ref 顶掉（两件事共用一个回调 ref）',
  stageSource.includes('stageRef(node)') && stageSource.includes('setStageNode(node)'),
  'attachStage 没串联 stageRef',
)

// ---- 回归：「歌词和胶囊跟着跑到了别的页面」要收起来 ----
// shell.overlay 是 frame 级座位，切页不卸载组件，所以得自己判断「还在不在对话页」。
// 判据只用自己家的按钮（[data-lx-input]）：它在对话页才有，而且中心点必须真命中它
// —— 设置页是盖在对话页上面的，只看「节点存在」会误判。
check(
  '输入框按钮带上了页面归属的锚点属性',
  tree?.props?.['data-lx-input'] === 'button',
  String(tree?.props?.['data-lx-input']),
)
check(
  '用「自己的按钮还在不在最上层」判断是否还在对话页',
  source.includes("document.querySelector('[data-lx-input]')") &&
    source.includes('document.elementFromPoint(x, y)') &&
    source.includes('seat.contains(hit)'),
  '没找到页面归属的命中测试',
)
check(
  '被对话框/popover 临时盖住不算离开对话页',
  source.includes("hit.closest('dialog, [role=\"dialog\"], [popover]')"),
  '没找到临时浮层的豁免',
)
check('舞台靠这个判断决定露不露脸', stageSource.includes('const onChat = usePageScope()'), '舞台没订阅页面归属')
check(
  '离开对话页时舞台返回 null',
  stageSource.includes('if (!onChat || narrow || frame === null || !frame.play) return null'),
  '早退条件里没有 onChat',
)
check(
  '提示卡也跟着收起来',
  String(Toast).includes('const onChat = usePageScope()') &&
    String(Toast).includes('if (!onChat || !toast) return null'),
  '提示卡没接页面归属',
)
check(
  '采样器在 apply 里起一次（不是每个组件各起一个）',
  source.includes('ensurePageScopeWatch()') && source.includes('const PAGE_SCOPE_MS = 1000'),
  '没找到 apply 里的采样器',
)
check(
  '发现被挤窄就立刻收起（不等第二次采样，否则观感上慢半拍）',
  source.includes('if (narrowed) return { onChat: false, hit: null, narrowed }'),
  '挤窄判据还在等第二次采样',
)
check(
  '边沿触发：只有挤窄状态翻转的那一拍才动作',
  source.includes('const flipped = next.narrowed !== pageScope.narrowed') &&
    source.includes('if (flipped && !full) {'),
  '采样器还是每拍都动作，不是只认翻转',
)
check(
  '挤窄靠 ResizeObserver 立即重采样（轮询只是兜底）',
  source.includes('new ResizeObserver(() => {') &&
    source.includes('scheduleCheap()') &&
    source.includes('scheduleSettle()') &&
    source.includes('observer.observe(node)') &&
    source.includes('watchSeat()'),
  '没有在输入框上挂 ResizeObserver',
)
check(
  '盯的是按钮上面几层的外框（按钮自己尺寸不变，只看它等于看不见挤窄）',
  source.includes('for (let depth = 0; node && depth < 6; depth += 1)') &&
    source.includes('pageScope.seatWatched = watched'),
  '只盯了按钮本身，分栏挤窄会漏掉',
)
check(
  '完整采样用尾随防抖（拖动时不跑、松手 120ms 后定案）',
  source.includes('if (settleTimer !== null) clearTimeout(settleTimer)') &&
    source.includes('const scheduleSettle = (delay = 120) => {'),
  '完整采样还是「一次就锁死」，拖动中会跑',
)
check(
  '点一下之后补一次完整采样（抽屉是点出来的，别等轮询）',
  source.includes("window.addEventListener('pointerup', () => { burst(500); scheduleSettle() }, true)"),
  '没有点击触发的即时采样',
)
check(
  '交互期间按帧补量（不把「什么时候挤窄」全押在 ResizeObserver 上）',
  source.includes('const burst = (ms = 400) => {') &&
    source.includes("window.addEventListener('pointerdown', () => { burst(500); scheduleSettle() }, true)") &&
    source.includes('if (event.buttons !== 0) burst(200)'),
  '交互后没有按帧补量，窄面板要等轮询才发现',
)
check(
  '挤窄阈值 40px（定 80 时窄面板一个都判不出来）',
  source.includes('narrowed = pageScope.baseRight - right > 40'),
  '阈值还是 80',
)
check(
  '拖分栏时每帧只量几何，不做命中测试（否则挤窄会一卡一卡）',
  source.includes('function probeOnChat(full = true)') &&
    source.includes('if (!full) return { onChat: pageScope.onChat, hit: null, narrowed }') &&
    source.includes('const sample = (full = true) => {') &&
    source.includes('sample(false)'),
  '廉价采样没接上，拖动时还在做完整命中测试',
)
check(
  '面板判据用采样缓存的座位矩形（不再每层祖先各查一次 DOM）',
  source.includes('let box = pageScope.seatBox'),
  'panelish 还在自己查输入框',
)
check(
  '没有 document 的环境不自起定时器（否则离线自测会被吊住）',
  source.includes("if (typeof document === 'undefined' || pageScope.timer !== null) return"),
  '采样器没做无 document 的短路',
)
check(
  '遮挡自检只在对话页里跑（别把我们自己收起当成「被盖住」）',
  stageSource.includes('if (!onChat) return undefined') && stageSource.includes('}, [onChat])'),
  '遮挡自检没接 onChat',
)
// ---- 回归：「右侧抽屉/分栏/窄面板」不会被 composer 判据抓到 ----
// 抽屉不盖输入框，所以按钮中心照样命中自己；得看「歌词自己那一块底下是谁」。
check(
  '抽屉类面板用「歌词底下压着的浮层」判断',
  source.includes('const PANEL_Z = 2') &&
    source.includes('function foreignPanelAt(point)') &&
    source.includes('function foreignAt(point)') &&
    source.includes('function stageProbePoint()') &&
    source.includes('const panel = foreignPanelAt(point)'),
  '没找到浮层面板的判据',
)
check(
  '占位型分栏的结构判据只记录、不动作（阈值未校准）',
  source.includes('function sharesSeatColumn(under, seat, maxDepth = 2)') &&
    source.includes('const sameColumn = !under || sharesSeatColumn(under, seat)') &&
    source.includes('只记录不动作'),
  '结构判据的接线不对',
)
check(
  '浮层判据只看定位过且 z-index >= PANEL_Z 的元素',
  source.includes("css.position === 'fixed' || css.position === 'absolute' || css.position === 'sticky'") &&
    source.includes('z >= PANEL_Z'),
  '浮层判据没限制定位与 z-index',
)
check(
  '没 z-index 的右侧抽屉靠几何兜（整块在输入框右边、面板尺寸）',
  source.includes('function panelish(el)') &&
    source.includes("css.position === 'static' || typeof el.getBoundingClientRect !== 'function'") &&
    source.includes('rect.left >= Math.round(box.right) - 8') &&
    source.includes('rect.width > 120 && rect.height > 120'),
  '没找到几何兜底分支',
)
check(
  '面板判据会往上看几层（抽屉的定位容器常在上面两三层）',
  source.includes('for (let depth = 0; node && depth < 4; depth += 1)') &&
    source.includes('node = node.parentElement'),
  '面板判据只看最上面那颗元素',
)
check(
  '自己的两块（歌词 + 提示卡）在判据里被跳过',
  source.includes("el.closest('[data-lx-stage], [data-lx-toast]')") &&
    String(Toast).includes("'data-lx-toast': 'toast'"),
  '浮层判据没跳过自己',
)
check(
  '探针点会记下来（舞台收起后仍能继续判断，不会每 800ms 闪一次）',
  source.includes('pageScope.point = {') && source.includes('return pageScope.point'),
  '探针点没做记忆',
)
check(
  '快照同时拍输入框和歌词两个点',
  source.includes("stage: 'page-snapshot'") &&
    source.includes('stageStack') &&
    source.includes('panel: panel'),
  'page-snapshot 没拍歌词那个点',
)

console.log('')
if (failures.length > 0) {
  console.error(failures.length + ' 项没过：')
  for (const failure of failures) console.error('  · ' + failure)
  process.exit(1)
}
console.log('全部通过。')
