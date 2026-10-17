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

console.log('')
if (failures.length > 0) {
  console.error(failures.length + ' 项没过：')
  for (const failure of failures) console.error('  · ' + failure)
  process.exit(1)
}
console.log('全部通过。')
