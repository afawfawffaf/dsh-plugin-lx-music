/**
 * 宿主半边的离线自测：不启动 DSH，直接拿一个假 ctx 调 apply()，把注册到的路由
 * 挂到真的 node http 服务上，再用 fetch 打一遍。
 *
 * 会真的去读落雪的开放 API（需要它开着），也会真的把桌面歌词藏起来再放回去
 * —— 最后一步总是恢复到测试开始前的可见状态。
 *
 *   node test/host-routes.mjs
 */
import http from 'node:http'
import { apply } from '../lib/index.js'

const routes = []
let disposedHandlers = 0

const ctx = {
  disposers: [],
  effect(fn) {
    const disposer = fn()
    if (typeof disposer === 'function') ctx.disposers.push(disposer)
  },
  webServer: {
    register({ kind, path, handler }) {
      routes.push({ kind, path, handler })
      return () => {
        disposedHandlers += 1
      }
    },
  },
}

apply(ctx)

const failures = []
const expect = (label, condition, detail) => {
  if (condition) {
    console.log(`  ok   ${label}`)
  } else {
    failures.push(label)
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('routes:')
expect('注册了全部路由', routes.length === 6, `实际 ${routes.length}`)
for (const path of ['/lx-music/lyric', '/lx-music/control', '/lx-music/lyrics', '/lx-music/lyrics/toggle', '/lx-music/client-report', '/lx-music/debug']) {
  expect(`${path} 是 exact`, routes.some((r) => r.path === path && r.kind === 'exact'))
}

const server = http.createServer((req, res) => {
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

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const base = `http://127.0.0.1:${port}`

console.log('\nlyric（需要落雪开放 API）:')
const lyricResponse = await fetch(`${base}/lx-music/lyric`)
const lyric = await lyricResponse.json()
console.log('  →', JSON.stringify({ ...lyric, lyric: lyric.lyric && { ...lyric.lyric, slots: lyric.lyric.slots.map((s) => `${s.role}:${s.text}`) } }).slice(0, 600))
expect('lyric 200', lyricResponse.status === 200)
expect('lyric 带 api 段', typeof lyric.api === 'object' && lyric.api !== null)
expect('lyric 报 api 端口', lyric.api.port === 23330, `port=${lyric.api.port}`)

if (lyric.api.enabled) {
  expect('lyric 有歌名', typeof lyric.song?.name === 'string' && lyric.song.name.length > 0)
  expect('lyric 有 artist', typeof lyric.song?.singer === 'string')
  expect('lyric 有播放位置', typeof lyric.play?.progress === 'number')
  expect('lyric 固定 5 个槽位', Array.isArray(lyric.lyric?.slots) && lyric.lyric.slots.length === 5, JSON.stringify(lyric.lyric?.slots))
  expect('中间槽位是 current', lyric.lyric.slots[2].role === 'current', lyric.lyric.slots[2].role)
  const others = [0, 1, 3, 4].map((i) => lyric.lyric.slots[i].role)
  expect('两侧槽位是 prev/next', others.every((role) => role === 'prev' || role === 'next' || role === 'empty'), others.join(','))
} else {
  console.log('  （开放 API 没开：跳过歌词字段断言，只验证降级形态）')
  expect('API 关闭时 api.error 有值', typeof lyric.api.error === 'string')
  expect('API 关闭时 lyric 为 null', lyric.lyric === null)
}

console.log('\nlyrics state:')
const stateResponse = await fetch(`${base}/lx-music/lyrics`)
const state = await stateResponse.json()
console.log('  →', JSON.stringify(state))
expect('state 200', stateResponse.status === 200)
expect('state 报 installed', state.installed === true)
expect('state 报 running', state.running === true)
expect('state 报了歌词窗口数量', typeof state.windows === 'number' && state.windows >= 0, `windows=${state.windows}`)
const before = state.visible
expect('state 报了 visible 布尔值', typeof before === 'boolean')

if (state.windows >= 1) {
  console.log('\nPOST lyrics {visible:false}:')
  const hideResponse = await fetch(`${base}/lx-music/lyrics`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ visible: false }),
  })
  const hidden = await hideResponse.json()
  console.log('  →', hideResponse.status, JSON.stringify(hidden))
  expect('hide 200', hideResponse.status === 200)
  expect('hide 后 visible === false', hidden.visible === false)
  expect('hide 的 action 是 hidden', hidden.action === 'hidden', hidden.action)

  console.log('\nPOST lyrics {visible:false} 再来一次（幂等）:')
  const hideAgain = await (await fetch(`${base}/lx-music/lyrics`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ visible: false }),
  })).json()
  expect('重复 hide 仍是 false', hideAgain.visible === false)

  console.log('\nPOST lyrics {visible:true}（恢复原状）:')
  const showResponse = await fetch(`${base}/lx-music/lyrics`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ visible: true }),
  })
  const shown = await showResponse.json()
  console.log('  →', showResponse.status, JSON.stringify(shown))
  expect('show 200', showResponse.status === 200)
  expect('show 后 visible === true', shown.visible === true)
  expect('show 的 action 是 shown', shown.action === 'shown', shown.action)

  if (before === false) {
    await fetch(`${base}/lx-music/lyrics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visible: before }),
    })
  }
} else {
  console.log('\n桌面歌词窗当前不存在（落雪里 desktopLyric.enable=false）→ 验证降级形态:')
  const hideResponse = await fetch(`${base}/lx-music/lyrics`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ visible: false }),
  })
  const hidden = await hideResponse.json()
  console.log('  →', hideResponse.status, JSON.stringify(hidden))
  expect('没有歌词窗时返回 409', hideResponse.status === 409)
  expect('错误码是 NO_LYRIC_WINDOW', hidden.code === 'NO_LYRIC_WINDOW', hidden.code)
  expect('降级也带一句人话', typeof hidden.hint === 'string' && hidden.hint.length > 0)
}

console.log('\nPOST lyrics 坏 body:')
const badBody = await fetch(`${base}/lx-music/lyrics`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ visible: 'yes' }),
})
expect('坏 body 返回 400', badBody.status === 400)

console.log('\nmethod guard:')
const wrongMethod = await fetch(`${base}/lx-music/lyrics/toggle`)
console.log('  → GET toggle:', wrongMethod.status)
expect('GET toggle 返回 405', wrongMethod.status === 405)

console.log('\nlegacy toggle（两次，恢复原状）:')
if (state.windows >= 1) {
  const preToggle = (await (await fetch(`${base}/lx-music/lyrics`)).json()).visible
  const toggleOne = await (await fetch(`${base}/lx-music/lyrics/toggle`, { method: 'POST' })).json()
  const toggleTwo = await (await fetch(`${base}/lx-music/lyrics/toggle`, { method: 'POST' })).json()
  expect('toggle 翻转了可见性', toggleOne.visible === !preToggle, `before=${preToggle} after=${toggleOne.visible}`)
  expect('toggle 两次回到原状态', toggleTwo.visible === preToggle, `before=${preToggle} after=${toggleTwo.visible}`)
} else {
  console.log('  跳过：没有桌面歌词窗可翻转')
}

console.log('\nclient report:')
const posted = await fetch(`${base}/lx-music/client-report`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ stage: 'apply', ok: true }),
})
expect('POST client-report 200', posted.status === 200)
const reports = await (await fetch(`${base}/lx-music/client-report`)).json()
expect('GET client-report 读回刚写的那条', Array.isArray(reports.reports) && reports.reports.some((row) => row.stage === 'apply'), JSON.stringify(reports).slice(0, 200))

console.log('\ncontrol 守卫（不碰播放器）:')
const controlGet = await fetch(`${base}/lx-music/control`)
expect('GET control 返回 405', controlGet.status === 405)
const controlBad = await fetch(`${base}/lx-music/control`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'shuffle' }),
})
const controlBadBody = await controlBad.json()
expect('坏 action 返回 400', controlBad.status === 400)
expect('坏 action 带一句人话', typeof controlBadBody.hint === 'string' && controlBadBody.hint.length > 0)
const controlEmpty = await fetch(`${base}/lx-music/control`, { method: 'POST' })
expect('空 body 返回 400', controlEmpty.status === 400)

if (process.env.LX_TEST_CONTROL === '1') {
  console.log('\ncontrol 真打落雪（LX_TEST_CONTROL=1，会暂停/恢复）:')
  const first = await fetch(`${base}/lx-music/control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'toggle' }),
  })
  const firstBody = await first.json()
  console.log('  →', first.status, JSON.stringify(firstBody))
  expect('toggle 200', first.status === 200)
  expect('toggle 报了实际路径', typeof firstBody.path === 'string', String(firstBody.path))
  // 再切一次，把播放状态还原。
  const second = await fetch(`${base}/lx-music/control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'toggle' }),
  })
  expect('再 toggle 一次把状态还原', second.status === 200)
} else {
  console.log('\ncontrol 真打落雪: 跳过（设 LX_TEST_CONTROL=1 才动播放器）')
}

server.close()
for (const dispose of ctx.disposers) dispose()
expect('effect 卸载时释放了路由', disposedHandlers === routes.length, `实际 ${disposedHandlers}`)

if (failures.length > 0) {
  console.log(`\n${failures.length} 项失败`)
  process.exitCode = 1
} else {
  console.log('\n全部通过')
}
