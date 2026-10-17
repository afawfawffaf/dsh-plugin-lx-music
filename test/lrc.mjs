/**
 * lib/lx-api.js 的离线自测：LRC 解析、行号查找、窗口切片、播放控制，以及 API 关闭时的降级。
 * 全程不碰真实落雪（假 fetch），所以随时能跑。
 *
 *   node test/lrc.mjs
 */
import { createLxApi, findLineIndex, lyricWindow, parseLrc } from '../lib/lx-api.js'

const failures = []
const expect = (label, condition, detail) => {
  if (condition) {
    console.log(`  ok   ${label}`)
  } else {
    failures.push(label)
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const SAMPLE = [
  '[ti:失眠]',
  '[ar:Suki刘舒妤]',
  '[offset:0]',
  '[00:00.307]失眠 - Suki刘舒妤',
  '[00:14.998]这个失眠夜 想不起你是谁',
  '[00:20.043][00:29.137]重复的副歌',
  '[00:48.349]拥有你的时间已经不可能倒回',
].join('\n')

console.log('parseLrc:')
const parsed = parseLrc(SAMPLE)
expect('元数据行被跳过', parsed.lines.length === 5, `实际 ${parsed.lines.length}`)
expect('第一条时间是 0.307', Math.abs(parsed.lines[0].time - 0.307) < 1e-9, String(parsed.lines[0].time))
expect('一行多时间戳会展开', parsed.lines.some((l) => l.text === '重复的副歌' && Math.abs(l.time - 20.043) < 1e-9) && parsed.lines.some((l) => l.text === '重复的副歌' && Math.abs(l.time - 29.137) < 1e-9))
expect('时间升序', parsed.lines.every((line, i) => i === 0 || parsed.lines[i - 1].time <= line.time))
expect('offset 被记录', parsed.offsetMs === 0)

const withOffset = parseLrc('[offset:1000]\n[00:05.000]晚一秒')
expect('正 offset 让歌词提前 1s', Math.abs(withOffset.lines[0].time - 4) < 1e-9, String(withOffset.lines[0].time))

const clamp = parseLrc('[offset:9000]\n[00:05.000]太早了')
expect('offset 不会把时间压到负数', clamp.lines[0].time === 0, String(clamp.lines[0].time))

expect('空文本返回空数组', parseLrc('').lines.length === 0)
expect('没有时间戳的行被忽略', parseLrc('随便一行\n[00:01.000]有时间的').lines.length === 1)

console.log('\nfindLineIndex:')
const lines = parsed.lines
expect('还没到第一句 → -1', findLineIndex(lines, 0.1) === -1, String(findLineIndex(lines, 0.1)))
expect('正好落在第一句的时间点', findLineIndex(lines, 0.307) === 0)
expect('落在两句之间取前一句', findLineIndex(lines, 15) === 1, String(findLineIndex(lines, 15)))
expect('超出末尾取最后一句', findLineIndex(lines, 999) === lines.length - 1)
expect('空歌词 → -1', findLineIndex([], 10) === -1)
expect('progress 不是数字 → -1', findLineIndex(lines, Number.NaN) === -1)

console.log('\nlyricWindow:')
const window5 = lyricWindow(lines, 2, 2)
expect('固定 5 个槽位', window5.length === 5, String(window5.length))
expect('槽位 2 是 current', window5[2].role === 'current')
expect('两侧是 prev / next', window5.slice(0, 2).every((s) => s.role === 'prev') && window5.slice(3).every((s) => s.role === 'next'))
expect('distance 递增', window5.map((s) => s.distance).join(',') === '2,1,0,1,2')

const windowTail = lyricWindow(lines, lines.length - 1, 2)
expect('末尾越界是空槽', windowTail[3].role === 'empty' && windowTail[3].text === '')

const windowHead = lyricWindow(lines, -1, 2)
expect('index -1 时中心也是空槽', windowHead[2].role === 'empty')
expect('index -1 时不显示 prev', windowHead.filter((s) => s.role === 'prev').length === 0)

expect('空歌词全空槽', lyricWindow([], 0, 2).every((s) => s.role === 'empty'))

console.log('\ncreateLxApi:')
let statusCalls = 0
let lyricCalls = 0
let currentStatus = { status: 'playing', name: '失眠', singer: 'Suki刘舒妤', albumName: 'Ladies Night', duration: 211.24, progress: 15 }

const fakeFetch = async (url) => {
  if (url.includes('/status')) {
    statusCalls += 1
    return { ok: true, text: async () => JSON.stringify(currentStatus) }
  }
  if (url.includes('/lyric')) {
    lyricCalls += 1
    return { ok: true, text: async () => SAMPLE }
  }
  throw new Error(`unexpected url ${url}`)
}

let clock = 1000
const api = createLxApi({ fetchImpl: fakeFetch, now: () => clock, cacheMs: 700 })

const first = await api.read()
expect('api.enabled 为 true', first.api.enabled === true)
expect('带出了歌名', first.song.name === '失眠')
expect('当前行是第二句（15s）', first.lyric.line === '这个失眠夜 想不起你是谁', first.lyric.line)
expect('切出了 5 个槽位', first.lyric.slots.length === 5)
expect('带上了整首时间轴', Array.isArray(first.lyric.timeline) && first.lyric.timeline.length === first.lyric.total, String(first.lyric.timeline?.length))
expect(
  '时间轴每项是 [秒, 文本]',
  Array.isArray(first.lyric.timeline[0]) && typeof first.lyric.timeline[0][0] === 'number' && typeof first.lyric.timeline[0][1] === 'string',
  JSON.stringify(first.lyric.timeline[0]),
)
expect('时间轴按时间递增', first.lyric.timeline.every((row, i, arr) => i === 0 || row[0] >= arr[i - 1][0]))
expect('带上了播放倍速', first.play.playbackRate === 1, String(first.play.playbackRate))
expect('首次读了 status 和 lyric', statusCalls === 1 && lyricCalls === 1, `${statusCalls}/${lyricCalls}`)

clock += 100
const cached = await api.read()
expect('缓存期内不再打 API', statusCalls === 1 && lyricCalls === 1, `${statusCalls}/${lyricCalls}`)
expect('缓存返回同一份数据', cached.at === first.at)

clock += 1000
currentStatus = { ...currentStatus, progress: 50 }
const second = await api.read()
expect('缓存过期后重新读 status', statusCalls === 2)
expect('同一首歌不重读 lyric', lyricCalls === 1, String(lyricCalls))
expect('进度推进后当前行变了', second.lyric.line === '拥有你的时间已经不可能倒回', second.lyric.line)

currentStatus = { ...currentStatus, name: '别的歌', singer: '别的歌手' }
clock += 1000
await api.read()
expect('换歌后重读 lyric', lyricCalls === 2, String(lyricCalls))

console.log('\ncreateLxApi 降级:')
const refused = async () => {
  const error = new Error('fetch failed')
  error.code = 'ECONNREFUSED'
  throw error
}
const offline = await createLxApi({ fetchImpl: refused }).read()
expect('连接被拒时 api.enabled 为 false', offline.api.enabled === false)
expect('降级错误码是 API_OFFLINE', offline.api.error === 'API_OFFLINE', offline.api.error)
expect('降级时不抛错且 lyric 为 null', offline.lyric === null)

const http500 = async () => ({ ok: false, status: 500, text: async () => '' })
const broken = await createLxApi({ fetchImpl: http500 }).read()
expect('HTTP 500 记成 HTTP_500', broken.api.error === 'HTTP_500', broken.api.error)

const hanging = async () => {
  const error = new Error('timeout')
  error.name = 'TimeoutError'
  throw error
}
const timedOut = await createLxApi({ fetchImpl: hanging }).read()
expect('超时记成 TIMEOUT', timedOut.api.error === 'TIMEOUT', timedOut.api.error)

const badJson = async (url) => ({ ok: true, text: async () => (url.includes('/status') ? 'not json' : SAMPLE) })
const broken2 = await createLxApi({ fetchImpl: badJson }).read()
expect('坏 JSON 记成 BAD_STATUS', broken2.api.error === 'BAD_STATUS', broken2.api.error)

console.log('\ncontrol:')
const controlCalls = []
let playState = 'playing'
let controlClock = 5000
const controlFetch = async (url) => {
  const path = new URL(url).pathname
  controlCalls.push(path)
  if (path === '/status') {
    return {
      ok: true,
      text: async () => JSON.stringify({ status: playState, name: '失眠', singer: 'Suki刘舒妤', duration: 200, progress: 10 }),
    }
  }
  if (path === '/lyric') return { ok: true, text: async () => SAMPLE }
  if (path === '/play') {
    playState = 'playing'
    return { ok: true, status: 200, text: async () => '' }
  }
  if (path === '/pause') {
    playState = 'paused'
    return { ok: true, status: 200, text: async () => '' }
  }
  if (path === '/skip-prev' || path === '/skip-next') {
    return { ok: true, status: 200, text: async () => '' }
  }
  return { ok: false, status: 404, text: async () => '' }
}

const controlApi = createLxApi({ fetchImpl: controlFetch, now: () => controlClock })

const pause = await controlApi.control('toggle')
expect('playing 时 toggle 发的是 /pause', pause.ok === true && pause.path === '/pause', JSON.stringify(pause))
expect('toggle 真的打到了 /pause', controlCalls.includes('/pause'))

const resume = await controlApi.control('toggle')
expect('paused 时 toggle 发的是 /play', resume.ok === true && resume.path === '/play', JSON.stringify(resume))

const prev = await controlApi.control('prev')
expect('prev 发的是 /skip-prev', prev.ok === true && prev.path === '/skip-prev', JSON.stringify(prev))

const next = await controlApi.control('next')
expect('next 发的是 /skip-next', next.ok === true && next.path === '/skip-next', JSON.stringify(next))

expect('大小写与空白被归一', (await controlApi.control('  NEXT ')).ok === true)

const beforeUnknown = controlCalls.length
const unknown = await controlApi.control('shuffle')
expect('不认识的动作返回 UNKNOWN_ACTION', unknown.ok === false && unknown.code === 'UNKNOWN_ACTION', JSON.stringify(unknown))
expect('不认识的动作不打 API', controlCalls.length === beforeUnknown, `${beforeUnknown} -> ${controlCalls.length}`)

// 控制之后缓存要失效，否则下一帧还显示旧状态。
const callsBeforeRead = controlCalls.length
await controlApi.read()
expect('控制后缓存失效，read 会重新问 status', controlCalls.length > callsBeforeRead, `${callsBeforeRead} -> ${controlCalls.length}`)

const control500 = async (url) => {
  const path = new URL(url).pathname
  if (path === '/status') {
    return { ok: true, text: async () => JSON.stringify({ status: 'playing', name: 'x', singer: 'y', duration: 10, progress: 1 }) }
  }
  return { ok: false, status: 500, text: async () => '' }
}
const failed = await createLxApi({ fetchImpl: control500 }).control('next')
expect('HTTP 500 记成 HTTP_500', failed.ok === false && failed.code === 'HTTP_500', JSON.stringify(failed))

const refusedControl = await createLxApi({
  fetchImpl: async () => {
    const error = new Error('fetch failed')
    error.code = 'ECONNREFUSED'
    throw error
  },
}).control('prev')
expect('连接被拒记成 API_OFFLINE', refusedControl.ok === false && refusedControl.code === 'API_OFFLINE', JSON.stringify(refusedControl))

if (failures.length > 0) {
  console.log(`\n${failures.length} 项失败`)
  process.exitCode = 1
} else {
  console.log('\n全部通过')
}
