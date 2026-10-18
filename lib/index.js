/**
 * dsh-plugin-lx-music — 宿主半边。
 *
 * 两件事：
 *   1. 把浏览器边的请求转成一次 PowerShell 调用，操作落雪的桌面歌词窗；
 *   2. 把落雪开放 API（127.0.0.1:23330）的歌词读出来，整理成浏览器边直接能画的数据。
 *
 *   GET  /lx-music/lyric          → 一帧歌词：歌名、播放位置、当前行 ± 2 行
 *   POST /lx-music/control        → body {action:'prev'|'next'|'toggle', desired?}，播放控制；
 *                                   播放器没开时先把它拉起来，再重放这次点击
 *   POST /lx-music/lyrics         → body {visible:boolean}，把桌面歌词窗设为显示/隐藏
 *   GET  /lx-music/lyrics         → 只读状态（installed / running / visible / windows）
 *   POST /lx-music/lyrics/toggle  → 兼容旧页面：翻转桌面歌词窗
 *   GET  /lx-music/debug          → 诊断：当前 profile 的插件条目与客户端图
 *   GET|POST /lx-music/client-report → 诊断：浏览器半边的自报
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createLxApi } from './lx-api.js'

const SCRIPT_PATH = join(dirname(fileURLToPath(import.meta.url)), 'lx-music.ps1')
const MARKER = 'LXMUSIC_JSON:'
const TIMEOUT_MS = 30000

/**
 * powershell.exe 是系统自带的 5.1；pwsh.exe 是 PowerShell 7。
 * 脚本刻意写成纯 ASCII，两者都能跑，所以谁先能起来就用谁。
 */
const SHELLS = ['powershell.exe', 'pwsh.exe']

const HINTS = {
  NOT_FOUND: '没找到 LX Music 的程序。先手动打开一次落雪，或者告诉我它装在哪，我把它加进搜索列表。',
  NO_LYRIC_WINDOW: '落雪在运行，但桌面歌词没开——到落雪里打开「桌面歌词」，再点这个按钮。',
  LAUNCH_FAILED: '找到落雪的程序了，但启动被系统挡了下来。到开始菜单手动打开一次，之后这个按钮还能用。',
  API_OFFLINE: '落雪的「开放 API」没开——到落雪设置里打开它（默认端口 23330），播放控制才有用。',
  API_OFFLINE_AFTER_LAUNCH: '播放器已经打开了，但它的「开放 API」还没回应——到落雪设置里打开开放 API（默认端口 23330）。',
  TIMEOUT: '落雪回应太慢，这次操作没确认。再点一次试试。',
  CONTROL_FAILED: '落雪那边拒绝了这次操作。',
  UNKNOWN_ACTION: '不认识这个动作（只支持 prev / next / toggle）。',
}

/** 拉起播放器之后，等它把开放 API 起好的上限。启动实测 <1s 就有响应，留足余量。 */
const LAUNCH_WAIT_MS = 15000
const LAUNCH_POLL_MS = 250

/** 浏览器半边的自报（诊断用，进程内存里留最近 50 条）。 */
const REPORTS = []

/** 落雪开放 API 客户端：默认 23330 端口，可用 LX_MUSIC_API 环境变量覆盖。 */
const lxApi = createLxApi(
  process.env.LX_MUSIC_API ? { baseUrl: process.env.LX_MUSIC_API } : {},
)

/** 挂在服务端状态上的失败码 → 一句人话。 */
function hintFor(code) {
  return HINTS[code]
}

/**
 * 把播放器拉起来。默认走 lx-music.ps1 -Mode launch；
 * 自测会换掉它 —— 谁都不想跑一次 npm test 就把自己的播放器叫醒。
 */
const defaultLauncher = () => invoke('launch')
let launcher = defaultLauncher

/** 测试座位：只给自测用，运行时不碰。 */
export const __hostTest = {
  setLauncher(fn) {
    launcher = typeof fn === 'function' ? fn : defaultLauncher
  },
}

function sendJson(res, status, body) {
  if (res.headersSent) return
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

/** 读一个 JSON 请求体；空 body 或坏 JSON 时 body 为 null。 */
async function readJson(req, limit = 16384) {
  let raw = ''
  let size = 0
  await new Promise((resolve) => {
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        req.destroy()
        resolve()
        return
      }
      raw += chunk.toString('utf8')
    })
    req.on('end', resolve)
    req.on('error', resolve)
  })
  try {
    return { body: JSON.parse(raw) }
  } catch {
    return { body: null, raw }
  }
}

/** 脚本只保证最后一行带 MARKER；把那一行之后的 JSON 抠出来。 */
function parseOutput(raw) {
  const text = String(raw || '')
  const index = text.lastIndexOf(MARKER)
  if (index < 0) return null
  const payload = text.slice(index + MARKER.length).trim()
  const end = payload.lastIndexOf('}')
  if (end < 0) return null
  try {
    return JSON.parse(payload.slice(0, end + 1))
  } catch {
    return null
  }
}

function runShell(shell, mode) {
  return new Promise((resolve) => {
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_PATH, '-Mode', mode]
    let child
    try {
      child = spawn(shell, args, { windowsHide: true })
    } catch (error) {
      resolve({ spawnError: error })
      return
    }
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* 已经退出了 */
      }
    }, TIMEOUT_MS)

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ spawnError: error })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

/** 统一补上人话提示，顺便把「跑通了但没成功」的形态归一。 */
function decorate(result) {
  if (!result || result.ok !== false) return result
  return { ...result, hint: hintFor(result.code) }
}

async function invoke(mode) {
  let lastError = null
  for (const shell of SHELLS) {
    const outcome = await runShell(shell, mode)
    if (outcome.spawnError) {
      // 这个 shell 不在机器上，换下一个。
      lastError = outcome.spawnError
      continue
    }
    const parsed = parseOutput(outcome.stdout)
    if (parsed) return decorate(parsed)
    lastError = new Error(
      `lx-music.ps1 (${shell} -Mode ${mode}) 没有吐出结果，退出码 ${outcome.code}` +
        (outcome.stderr ? `：${outcome.stderr.trim().split('\n').slice(-3).join(' ')}` : ''),
    )
    break
  }
  return decorate({
    ok: false,
    code: 'SCRIPT_FAILED',
    message: lastError ? String(lastError.message || lastError) : '无法运行 PowerShell',
    hint: '插件没拿到落雪的窗口状态；用 pwsh 或 powershell 手动跑一次 lib/lx-music.ps1 -Mode state 看看。',
  })
}

export const name = 'lx-music'
export const inject = ['webServer']

export function apply(ctx) {
  const disposers = []
  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) {
      try {
        dispose()
      } catch {
        /* 卸载失败就别再炸一次 */
      }
    }
  })

  let inFlight = null

  /** 连点两下不该排队执行两次切换：合并成一次。 */
  const toggling = () => {
    if (inFlight) return inFlight
    inFlight = invoke('toggle').finally(() => {
      inFlight = null
    })
    return inFlight
  }

  /** 同方向的连续请求合并（hide / hide / hide → 只跑一次）。 */
  const applying = new Map()
  const setVisible = (visible) => {
    const mode = visible ? 'show' : 'hide'
    const running = applying.get(mode)
    if (running !== undefined) return running
    const promise = invoke(mode).finally(() => {
      applying.delete(mode)
    })
    applying.set(mode, promise)
    return promise
  }

  /** 拉起播放器后，等开放 API 真的能答话。返回 true 表示可以重放这次点击了。 */
  const waitForApi = async () => {
    const deadline = Date.now() + LAUNCH_WAIT_MS
    lxApi.reset()
    while (Date.now() < deadline) {
      const frame = await lxApi.read()
      if (frame && frame.api && frame.api.enabled === true) return true
      await new Promise((resolve) => setTimeout(resolve, LAUNCH_POLL_MS))
    }
    return false
  }

  /**
   * 「点了播放但落雪没开」时的一次性补救：拉起播放器 + 等 API。
   * 连点几下只该启动一个实例，所以整个过程合并成同一个 promise。
   */
  let booting = null
  const ensurePlayer = () => {
    if (booting !== null) return booting
    booting = (async () => {
      const started = await launcher()
      if (started.ok !== true || started.action !== 'launched') {
        // 已经在跑（那就是开放 API 的问题），或者根本拉不起来 —— 都别等。
        return { launched: false, reason: started }
      }
      const ready = await waitForApi()
      return { launched: true, ready, pid: started.pid }
    })().finally(() => {
      booting = null
    })
    return booting
  }

  /** 控制失败的统一出口：状态码 + 人话，顺带把「顺手拉了播放器」这件事带上。 */
  const sendControlFailure = (res, result, extra) => {
    const code = result.code === 'API_OFFLINE' && extra && extra.launched ? 'API_OFFLINE_AFTER_LAUNCH' : result.code
    const status = code === 'NOT_FOUND' ? 404
      : code === 'LAUNCH_FAILED' ? 409
        : code === 'API_OFFLINE' || code === 'API_OFFLINE_AFTER_LAUNCH' || code === 'TIMEOUT' ? 503
          : 502
    sendJson(res, status, {
      ok: false,
      action: result.action,
      code,
      hint: HINTS[code] ?? HINTS.CONTROL_FAILED,
      ...extra,
    })
  }

  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/lx-music/lyrics/toggle',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: '这个地址只接 POST。' })
          return
        }
        const result = await toggling()
        const status = result.ok === true ? 200 : result.code === 'NOT_FOUND' ? 404 : 409
        sendJson(res, status, result)
      },
    }),
  )

  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/lx-music/debug',
      handler: async (req, res) => {
        const report = { ok: true }
        try {
          report.packageName = 'dsh-plugin-lx-music'
          report.entries = [...ctx.loader.entries()].map((entry) => entry.options.name)
        } catch (error) {
          report.entriesError = String(error)
        }
        try {
          const clientModules = ctx.get('clientModules')
          report.hasClientModules = clientModules !== undefined
          if (clientModules !== undefined) {
            const graph = clientModules.graph()
            report.graph = { plugins: graph.plugins, batches: graph.batches }
            report.clientPath = clientModules.clientPath('dsh-plugin-lx-music')
          }
        } catch (error) {
          report.graphError = String(error)
        }
        sendJson(res, 200, report)
      },
    }),
  )

  /**
   * 浏览器半边把「我加载到哪一步了」记在这里。
   * 诊断用：页面里跑得到哪一步，这边就有一条；一条都没有，说明脚本没被求值。
   */
  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/lx-music/client-report',
      handler: async (req, res) => {
        if (req.method === 'GET') {
          sendJson(res, 200, { ok: true, reports: REPORTS.slice(-30) })
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' })
          return
        }
        let raw = ''
        let size = 0
        await new Promise((resolve) => {
          req.on('data', (chunk) => {
            size += chunk.length
            if (size > 16384) {
              req.destroy()
              resolve()
              return
            }
            raw += chunk.toString('utf8')
          })
          req.on('end', resolve)
          req.on('error', resolve)
        })
        let body = null
        try {
          body = JSON.parse(raw)
        } catch {
          body = { unparsed: raw.slice(0, 500) }
        }
        REPORTS.push({ at: new Date().toISOString(), ...body })
        if (REPORTS.length > 50) REPORTS.splice(0, REPORTS.length - 50)
        sendJson(res, 200, { ok: true })
      },
    }),
  )

  /** 一帧歌词。API 没开时也是 200，body 里 api.enabled === false。 */
  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/lx-music/lyric',
      handler: async (req, res) => {
        if (req.method !== 'GET') {
          sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: '这个地址只接 GET。' })
          return
        }
        const value = await lxApi.read()
        sendJson(res, 200, value)
      },
    }),
  )

  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/lx-music/lyrics',
      handler: async (req, res) => {
        if (req.method === 'GET') {
          const result = await invoke('state')
          sendJson(res, result.ok === true ? 200 : 409, result)
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, {
            ok: false,
            code: 'METHOD_NOT_ALLOWED',
            message: 'GET 读状态，POST {visible} 设置显示/隐藏。',
          })
          return
        }

        const { body } = await readJson(req)
        if (body === null || typeof body?.visible !== 'boolean') {
          sendJson(res, 400, {
            ok: false,
            code: 'BAD_REQUEST',
            message: 'body 需要 JSON：{"visible": true|false}',
          })
          return
        }

        const result = await setVisible(body.visible)
        const status = result.ok === true ? 200 : result.code === 'NOT_FOUND' ? 404 : 409
        sendJson(res, status, result)
      },
    }),
  )

  /** 播放控制。走落雪开放 API，不碰窗口，所以不会打断播放。 */
  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/lx-music/control',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, {
            ok: false,
            code: 'METHOD_NOT_ALLOWED',
            message: 'POST {"action":"prev"|"next"|"toggle"}',
          })
          return
        }

        const { body } = await readJson(req)
        const action = typeof body?.action === 'string' ? body.action.trim().toLowerCase() : ''
        if (!['prev', 'next', 'toggle'].includes(action)) {
          sendJson(res, 400, {
            ok: false,
            action: action || null,
            code: 'BAD_REQUEST',
            hint: HINTS.UNKNOWN_ACTION,
          })
          return
        }
        // 用户这次点击想要的状态。只在「拉起播放器之后重放点击」时用得上。
        const desired = body?.desired === 'playing' || body?.desired === 'paused' ? body.desired : null

        const result = await lxApi.control(action)
        if (result.ok === true) {
          sendJson(res, 200, { ok: true, action: result.action, path: result.path, ...(result.settled ? { settled: true } : {}) })
          return
        }

        // 连不上开放 API：可能是播放器没开，也可能是开了但 API 没开。
        // 先试一次「把它拉起来」，只有真的拉起了新实例才值得重放这次点击。
        if (result.code === 'API_OFFLINE') {
          const boot = await ensurePlayer()
          if (boot.launched && boot.ready) {
            const retry = await lxApi.control(action, desired ? { desired } : undefined)
            if (retry.ok === true) {
              sendJson(res, 200, {
                ok: true,
                action: retry.action,
                path: retry.path,
                launched: true,
                pid: boot.pid,
                ...(retry.settled ? { settled: true } : {}),
              })
              return
            }
            sendControlFailure(res, retry, { launched: true, pid: boot.pid })
            return
          }
          if (boot.launched) {
            // 拉起来了，但 API 一直没答话 —— 多半是开放 API 没开。
            sendControlFailure(res, result, { launched: true, pid: boot.pid })
            return
          }
          const reason = boot.reason || {}
          if (reason.code) {
            sendControlFailure(res, { ...result, code: reason.code, message: reason.message })
            return
          }
          // 进程本来就在跑：不是「没开」，而是「开了但 API 没开」，普通失败即可。
          sendControlFailure(res, result, { running: true })
          return
        }

        sendControlFailure(res, result)
      },
    }),
  )
}
