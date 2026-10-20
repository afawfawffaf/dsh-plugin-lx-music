/**
 * 播放控制的端到端自测：起一个假的落雪开放 API，把宿主路由挂上去，
 * 用真 HTTP 打一遍 —— 全程不碰真的播放器（不会打断正在放的歌）。
 *
 *   node test/control-route.mjs
 */
import http from 'node:http'
import { readFileSync } from 'node:fs'

const failures = []
const expect = (label, condition, detail) => {
  if (condition) {
    console.log(`  ok   ${label}`)
  } else {
    failures.push(label)
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

// ---- 假落雪 ----
const SAMPLE = ['[00:00.000]第一句', '[00:10.000]第二句', '[00:20.000]第三句'].join('\n')
const controlHits = []
let lastSeek = null
let playStatus = 'playing'

const fakeLx = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const path = url.pathname
  res.setHeader('content-type', 'application/json; charset=utf-8')
  if (path === '/status') {
    res.end(JSON.stringify({ status: playStatus, name: '测试歌', singer: '测试歌手', duration: 200, progress: 12 }))
    return
  }
  if (path === '/lyric') {
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end(SAMPLE)
    return
  }
  controlHits.push(path)
  if (path === '/seek') {
    // 落雪的跳转只认 query 参数（body 里放 offset 会 400 Invalid offset）。
    lastSeek = url.searchParams.get('offset')
    res.end('{}')
    return
  }
  if (path === '/play') playStatus = 'playing'
  if (path === '/pause') playStatus = 'paused'
  if (['/play', '/pause', '/skip-next', '/skip-prev'].includes(path)) {
    res.end('{}')
    return
  }
  res.statusCode = 404
  res.end('{}')
})
await new Promise((resolve) => fakeLx.listen(0, '127.0.0.1', resolve))
const fakeBase = `http://127.0.0.1:${fakeLx.address().port}`

// 宿主半边在模块加载时读这个环境变量，所以必须先设好再 import。
process.env.LX_MUSIC_API = fakeBase
const { apply, __hostTest } = await import('../lib/index.js')

const routes = []
const cleanups = []
let disposed = 0
apply({
  effect(fn) {
    // cordis 的语义：effect 回调返回的才是卸载函数，不能当场调用。
    const disposer = fn()
    if (typeof disposer === 'function') cleanups.push(disposer)
  },
  webServer: {
    register({ kind, path, handler }) {
      routes.push({ kind, path, handler })
      return () => {
        disposed += 1
      }
    },
  },
})

const host = http.createServer((req, res) => {
  const route = routes.find((r) => r.path === req.url)
  if (!route) {
    res.statusCode = 404
    res.end('{}')
    return
  }
  Promise.resolve(route.handler(req, res)).catch((error) => {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(error) }))
  })
})
await new Promise((resolve) => host.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${host.address().port}`

const post = (action, desired) =>
  fetch(`${base}/lx-music/control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(desired ? { action, desired } : { action }),
  })

console.log('lyric（假落雪）:')
const lyric = await (await fetch(`${base}/lx-music/lyric`)).json()
expect('lyric 200 且 api.enabled', lyric.api.enabled === true, JSON.stringify(lyric.api))
expect('读到假歌名', lyric.song.name === '测试歌', String(lyric.song && lyric.song.name))

console.log('\ncontrol toggle:')
const pauseResponse = await post('toggle')
const paused = await pauseResponse.json()
console.log('  →', pauseResponse.status, JSON.stringify(paused))
expect('toggle 200', pauseResponse.status === 200)
expect('playing 时 toggle 打到 /pause', paused.path === '/pause', String(paused.path))

const resumeResponse = await post('toggle')
const resumed = await resumeResponse.json()
expect('再 toggle 打到 /play', resumed.path === '/play', String(resumed.path))

console.log('\ncontrol next / prev:')
expect('next 打到 /skip-next', (await (await post('next')).json()).path === '/skip-next')
expect('prev 打到 /skip-prev', (await (await post('prev')).json()).path === '/skip-prev')
expect('四次控制都真的到了假落雪', controlHits.join(',') === '/pause,/play,/skip-next,/skip-prev', controlHits.join(','))

console.log('\n双击歌词 → 跳到那一句:')
const seekResponse = await fetch(`${base}/lx-music/control`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'seek', offset: 12.5 }),
})
const seekBody = await seekResponse.json()
expect('seek 200', seekResponse.status === 200, JSON.stringify(seekBody))
expect('seek 打到 /seek 且带三位小数', seekBody.path === '/seek?offset=12.500', String(seekBody.path))
expect('offset 真的作为 query 发出去了', lastSeek === '12.500', String(lastSeek))
const noOffset = await (await fetch(`${base}/lx-music/control`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'seek' }),
})).json()
expect('seek 没有 offset 直接 400（不瞎跳到 0）', noOffset.code === 'BAD_REQUEST', JSON.stringify(noOffset))
const negative = await (await fetch(`${base}/lx-music/control`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'seek', offset: -3 }),
})).status
expect('负数 offset 也 400', negative === 400, String(negative))

console.log('\n守卫:')
expect('GET control 405', (await fetch(`${base}/lx-music/control`)).status === 405)
expect('坏 action 400', (await post('shuffle')).status === 400)
expect('空 body 400', (await fetch(`${base}/lx-music/control`, { method: 'POST' })).status === 400)

console.log('\n落雪 API 掉线:')
await new Promise((resolve) => fakeLx.close(resolve))
const offlineResponse = await post('toggle')
const offline = await offlineResponse.json()
console.log('  →', offlineResponse.status, JSON.stringify(offline))
expect('掉线返回 503', offlineResponse.status === 503)
expect('掉线码是 API_OFFLINE', offline.code === 'API_OFFLINE', String(offline.code))
expect('掉线也带一句人话', typeof offline.hint === 'string' && offline.hint.length > 0)

// ---- 「点了播放但落雪没开」：宿主该自己把播放器拉起来，再重放这次点击 ----
// 拉起播放器换成假的：只把假落雪重新开在同一个端口。绝不能真去启动播放器。
const fakePort = Number(new URL(fakeBase).port)
const revive = async () => {
  await new Promise((resolve) => setTimeout(resolve, 150))
  await new Promise((resolve) => fakeLx.listen(fakePort, '127.0.0.1', resolve))
  return { ok: true, action: 'launched', running: true, pid: 4242 }
}
let launchCalls = 0

console.log('\n没开播时点播放（自动拉起）:')
__hostTest.setLauncher(async () => {
  launchCalls += 1
  return revive()
})
playStatus = 'paused'
controlHits.length = 0
const wokeResponse = await post('toggle', 'playing')
const wokeBody = await wokeResponse.json()
console.log('  →', wokeResponse.status, JSON.stringify(wokeBody))
expect('拉起后这次点击是 200', wokeResponse.status === 200, String(wokeResponse.status))
expect('回包带上 launched', wokeBody.launched === true, JSON.stringify(wokeBody))
expect('拉起后重放了这次点击（暂停态 → /play）', controlHits.join(',') === '/play', controlHits.join(','))

console.log('\n连点两下:')
await new Promise((resolve) => fakeLx.close(resolve))
launchCalls = 0
playStatus = 'paused'
controlHits.length = 0
const [wokeA, wokeB] = await Promise.all([post('toggle', 'playing'), post('toggle', 'playing')])
expect('两个请求都成功', wokeA.status === 200 && wokeB.status === 200, `${wokeA.status}/${wokeB.status}`)
expect('只拉起一次播放器', launchCalls === 1, String(launchCalls))
expect('两次都只是「播」，没有一下把歌暂停掉', controlHits.every((hit) => hit === '/play'), controlHits.join(','))

console.log('\n播放器自己已经恢复播放:')
await new Promise((resolve) => fakeLx.close(resolve))
playStatus = 'playing'
controlHits.length = 0
const settledResponse = await post('toggle', 'playing')
const settledBody = await settledResponse.json()
console.log('  →', settledResponse.status, JSON.stringify(settledBody))
expect('识别出「已经在播」，不反过来暂停', settledBody.settled === true, JSON.stringify(settledBody))
expect('没有多打一次控制请求', controlHits.length === 0, controlHits.join(','))

console.log('\n进程在跑、只是 API 没开:')
await new Promise((resolve) => fakeLx.close(resolve))
__hostTest.setLauncher(async () => ({ ok: true, action: 'already-running', running: true, pid: 1 }))
const runningResponse = await post('toggle')
const runningBody = await runningResponse.json()
console.log('  →', runningResponse.status, JSON.stringify(runningBody))
expect('进程在跑就别再说「已拉起」', runningBody.launched === undefined, JSON.stringify(runningBody))
expect('仍按 API_OFFLINE 报 503', runningResponse.status === 503 && runningBody.code === 'API_OFFLINE', `${runningResponse.status} ${runningBody.code}`)

console.log('\n连播放器都找不到:')
__hostTest.setLauncher(async () => ({ ok: false, code: 'NOT_FOUND' }))
const missingResponse = await post('toggle')
const missingBody = await missingResponse.json()
console.log('  →', missingResponse.status, JSON.stringify(missingBody))
expect('找不到程序报 404', missingResponse.status === 404, String(missingResponse.status))
expect('码是 NOT_FOUND', missingBody.code === 'NOT_FOUND', String(missingBody.code))

__hostTest.setLauncher(null)

// 静态守卫：拉起播放器时必须把 DSH 自己带进来的 ELECTRON_RUN_AS_NODE 摘掉。
// 带着它，落雪会当成 Node 跑、一秒内 exit 0，日志里什么都不留 —— 遇到过就知道了。
console.log('\n脚本本体:')
const scriptSource = readFileSync(new URL('../lib/lx-music.ps1', import.meta.url), 'utf8')
expect(
  '启动前摘掉 ELECTRON_RUN_AS_NODE',
  scriptSource.includes('Remove-Item Env:ELECTRON_RUN_AS_NODE'),
  '没找到摘变量的那行',
)
expect(
  '只对子进程摘、脚本自己环境还原',
  scriptSource.includes('if ($hadVar) { $env:ELECTRON_RUN_AS_NODE = $saved }'),
  '没找到还原那行',
)
const startLine = scriptSource.split('\n').find((line) => line.includes('Start-Process -FilePath $Exe')) || ''
expect(
  '用落雪自己的 -hidden 启动（-WindowStyle Minimized 不管用，窗口照样会弹出来）',
  startLine.includes("-ArgumentList '-hidden'") && !startLine.includes('-WindowStyle'),
  startLine.trim() || '没找到 Start-Process 那行',
)
expect('launch 模式进了 ValidateSet', /ValidateSet\('state', 'launch'/.test(scriptSource), '没找到 launch 模式')

host.close()
for (const cleanup of cleanups) cleanup()
expect('卸载时释放路由', disposed === routes.length, `${disposed}/${routes.length}`)

if (failures.length > 0) {
  console.log(`\n${failures.length} 项失败`)
  process.exitCode = 1
} else {
  console.log('\n全部通过')
}
