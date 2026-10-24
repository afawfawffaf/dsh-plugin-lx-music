/**
 * 歌词「有时候加载不出来」的回归测试。
 *
 * 三个曾经会同时出现的现象：
 *  1. /lyric 偶尔超时或 5xx 时，整帧变成 api.enabled=false —— 歌名、播放状态、
 *     歌词一起消失，而不只是歌词。
 *  2. /lyric 没返回可解析的行（空串、纯 [ti:][ar:] 头、302 落到的 HTML 页）时，
 *     lyric.key 已经被写成当前歌，于是**同一首歌再也不会重试**，直到切歌才恢复。
 *  3. 同一首歌连续几帧都在请求歌词（切歌的瞬间），每一帧都串行等一次 /lyric。
 */
import http from 'node:http'

let lyricMode = 'ok' // 'ok' | 'fail' | 'empty' | 'once'
let lyricHits = 0
let failOnce = 1

const SAMPLE = '[00:01.00]第一句\n[00:05.00]第二句\n[00:09.00]第三句'

const fakeLx = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (url.pathname === '/status') {
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ status: 'playing', name: '测试歌', singer: '歌手', duration: 200, progress: 6 }))
    return
  }
  if (url.pathname === '/lyric') {
    lyricHits += 1
    if (lyricMode === 'fail') {
      res.statusCode = 500
      res.end('boom')
      return
    }
    if (lyricMode === 'once' && failOnce > 0) {
      failOnce -= 1
      res.statusCode = 500
      res.end('boom')
      return
    }
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end(lyricMode === 'empty' ? '[ti:测试歌]\n[ar:歌手]' : SAMPLE)
    return
  }
  res.statusCode = 404
  res.end('{}')
})

await new Promise((resolve) => fakeLx.listen(0, '127.0.0.1', resolve))
process.env.LX_MUSIC_API = `http://127.0.0.1:${fakeLx.address().port}`

const { createLxApi } = await import('../lib/lx-api.js')
const __lxApi = createLxApi({ baseUrl: `http://127.0.0.1:${fakeLx.address().port}`, cacheMs: 0 })

/** 拿一帧歌词状态。 */
async function frame() {
  const body = await __lxApi.read()
  return { status: 200, body }
}

let failures = 0
function check(label, pass, detail) {
  if (pass) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
  }
}

const api = __lxApi
if (!api) {
  console.error('拿不到 lxApi 实例，测试无法进行')
  process.exit(1)
}

console.log('\n正常一首歌:')
__lxApi.reset()
lyricHits = 0
lyricMode = 'ok'
let f = await frame()
check('取到三行歌词', f.body.lyric.total === 3, `total=${f.body.lyric.total}`)
check('当前行是第二句', f.body.lyric.line === '第二句', String(f.body.lyric.line))

console.log('\n/lyric 报 500（曾经整帧消失）:')
__lxApi.reset()
lyricMode = 'fail'
f = await frame()
check('仍返回 200', f.status === 200, `status=${f.status}`)
check('api.enabled 仍是 true', f.body.api.enabled === true, String(f.body.api.enabled))
check('歌名没丢', f.body.song && f.body.song.name === '测试歌', JSON.stringify(f.body.song))
check('播放状态没丢', f.body.play && f.body.play.status === 'playing', JSON.stringify(f.body.play))
check('歌词降级成空行而不是 null', f.body.lyric && f.body.lyric.total === 0, JSON.stringify(f.body.lyric?.total))

console.log('\n/lyric 恢复后同一首歌自动重试:')
// 冷却期（LYRIC_RETRY_MS = 3000）之内不该反复打；
// 冷却过后同一首歌要能自己恢复，不用等切歌。
lyricMode = 'ok'
lyricHits = 0
await new Promise((r) => setTimeout(r, 60))
f = await frame()
check('冷却期内不重复请求', lyricHits === 0, `hits=${lyricHits}`)
await new Promise((r) => setTimeout(r, 3100))
f = await frame()
check('重试后取到歌词', f.body.lyric.total === 3, `total=${f.body.lyric.total}`)
check('确实重新请求了 /lyric', lyricHits >= 1, `hits=${lyricHits}`)

console.log('\n/lyric 返回空（没有可解析的行）:')
__lxApi.reset()
lyricMode = 'empty'
f = await frame()
check('空歌词不报错', f.status === 200 && f.body.lyric.total === 0, `total=${f.body.lyric.total}`)
check('歌名仍在', f.body.song && f.body.song.name === '测试歌')
lyricMode = 'ok'
lyricHits = 0
await new Promise((r) => setTimeout(r, 3150))
f = await frame()
check('歌词后来出现了（空结果不算终局）', f.body.lyric.total === 3, `total=${f.body.lyric.total} hits=${lyricHits}`)

console.log('\n连续几帧（切歌瞬间）不会每帧都打 /lyric:')
__lxApi.reset()
lyricMode = 'ok'
lyricHits = 0
for (let i = 0; i < 4; i += 1) await frame()
check('多帧只请求一次 /lyric', lyricHits <= 1, `hits=${lyricHits}`)

fakeLx.close()
if (failures > 0) {
  console.log(`\n${failures} 项失败`)
  process.exit(1)
}
console.log('\n全部通过。')
