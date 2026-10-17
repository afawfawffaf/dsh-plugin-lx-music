/**
 * 播放控制的端到端自测：起一个假的落雪开放 API，把宿主路由挂上去，
 * 用真 HTTP 打一遍 —— 全程不碰真的播放器（不会打断正在放的歌）。
 *
 *   node test/control-route.mjs
 */
import http from 'node:http'

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
const { apply } = await import('../lib/index.js')

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

const post = (action) =>
  fetch(`${base}/lx-music/control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
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

host.close()
for (const cleanup of cleanups) cleanup()
expect('卸载时释放路由', disposed === routes.length, `${disposed}/${routes.length}`)

if (failures.length > 0) {
  console.log(`\n${failures.length} 项失败`)
  process.exitCode = 1
} else {
  console.log('\n全部通过')
}
