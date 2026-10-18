/**
 * 落雪音乐（LX Music）开放 API 客户端 + LRC 解析。
 *
 * 设计要点：解析与网络分开，parseLrc / findLineIndex / lyricWindow 都是纯函数，
 * 不碰网络就能测；createLxApi 负责缓存、换歌判定、错误降级。
 *
 * 落雪 API 默认监听 http://127.0.0.1:23330（需要在落雪「设置 → 开放 API」里手动打开）。
 */

const DEFAULT_BASE = 'http://127.0.0.1:23330'
const DEFAULT_RADIUS = 2

// 落雪严格按 filter 裁字段：这里少写一个，返回体里就真的没有它。
// playbackRate 必须列出来，否则「倍速」永远退化成 1，页面按本地时钟外推时会在倍速下漂。
const STATUS_FILTER = [
  'status',
  'name',
  'singer',
  'albumName',
  'duration',
  'progress',
  'lyricLineText',
  'playbackRate',
].join(',')

// [mm:ss]、[mm:ss.ms]、[mm:ss:ms] 三种写法都收。
const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
const META_TAG = /^\[(ti|ar|al|by|offset|re|ve|au|length|kana):(.*)\]$/i

/**
 * 解析 LRC 文本。
 * @param {string} raw
 * @returns {{ lines: Array<{ time: number, text: string }>, offsetMs: number }}
 *   time 为秒（已应用 offset，且不小于 0），lines 按时间升序。
 */
export function parseLrc(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return { lines: [], offsetMs: 0 }

  /** @type {Array<{ time: number, text: string }>} */
  const lines = []
  let offsetMs = 0

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0) continue

    const meta = META_TAG.exec(line)
    if (meta) {
      if (meta[1].toLowerCase() === 'offset') {
        const parsed = Number.parseInt(meta[2].trim(), 10)
        if (Number.isFinite(parsed)) offsetMs = parsed
      }
      continue
    }

    // 一行可能挂多个时间戳：[00:12.00][01:30.00]歌词
    const stamps = []
    let rest = line
    for (;;) {
      TIME_TAG.lastIndex = 0
      const match = TIME_TAG.exec(rest)
      if (match === null || match.index !== 0) break
      stamps.push(tagToSeconds(match))
      rest = rest.slice(match[0].length)
    }
    if (stamps.length === 0) continue

    const text = rest.trim()
    for (const stamp of stamps) lines.push({ time: stamp, text })
  }

  lines.sort((a, b) => a.time - b.time)

  // LRC 约定：offset 为正表示歌词应当提前出现。
  const shift = offsetMs / 1000
  const shifted = shift === 0
    ? lines
    : lines.map((line) => ({ time: Math.max(0, line.time - shift), text: line.text }))

  return { lines: shifted, offsetMs }
}

function tagToSeconds(match) {
  const minutes = Number.parseInt(match[1], 10)
  const seconds = Number.parseInt(match[2], 10)
  const fractionRaw = match[3] ?? ''
  // 两位是百分秒，三位是毫秒。
  const fraction = fractionRaw.length === 0
    ? 0
    : fractionRaw.length === 1
      ? Number.parseInt(fractionRaw, 10) / 10
      : fractionRaw.length === 2
        ? Number.parseInt(fractionRaw, 10) / 100
        : Number.parseInt(fractionRaw, 10) / 1000
  return minutes * 60 + seconds + fraction
}

/**
 * 二分查找当前播放位置落在哪一行。
 * @param {Array<{ time: number }>} lines 已按时间升序
 * @param {number} progressSeconds
 * @returns {number} -1 表示还没到第一行；否则是最后一条 time <= progress 的下标
 */
export function findLineIndex(lines, progressSeconds) {
  if (!Array.isArray(lines) || lines.length === 0) return -1
  if (!Number.isFinite(progressSeconds)) return -1
  if (progressSeconds < lines[0].time) return -1

  let low = 0
  let high = lines.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (lines[mid].time <= progressSeconds) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return found
}

/**
 * 取「当前行 ± radius 行」，固定返回 2*radius+1 个槽位（空槽 text 为空串），
 * 这样界面高度不会随着歌词行数跳动。
 * @param {Array<{ text: string }>} lines
 * @param {number} index findLineIndex 的结果
 * @param {number} [radius]
 * @returns {Array<{ text: string, role: 'prev' | 'current' | 'next' | 'empty', distance: number }>}
 */
export function lyricWindow(lines, index, radius = DEFAULT_RADIUS) {
  const safeRadius = Math.max(0, Math.floor(radius))
  const slots = []
  for (let offset = -safeRadius; offset <= safeRadius; offset += 1) {
    const target = index + offset
    if (!Array.isArray(lines) || target < 0 || target >= lines.length) {
      slots.push({ text: '', role: 'empty', distance: Math.abs(offset) })
      continue
    }
    const role = offset === 0 ? 'current' : offset < 0 ? 'prev' : 'next'
    slots.push({ text: lines[target].text, role, distance: Math.abs(offset) })
  }
  return slots
}

/**
 * 创建落雪 API 客户端。
 * @param {{
 *   baseUrl?: string,
 *   timeoutMs?: number,
 *   cacheMs?: number,
 *   radius?: number,
 *   fetchImpl?: typeof fetch,
 *   now?: () => number,
 * }} [options]
 */
export function createLxApi(options = {}) {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '')
  const timeoutMs = options.timeoutMs ?? 1500
  // 页面每 200ms 来取一帧；缓存只用来合流同一次摸查，不能成为延迟的一部分。
  const cacheMs = options.cacheMs ?? 120
  const radius = options.radius ?? DEFAULT_RADIUS
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const now = options.now ?? Date.now

  let port = 23330
  try {
    const parsed = new URL(baseUrl)
    port = Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80)
  } catch {
    port = 23330
  }

  /** @type {{ at: number, value: any } | null} */
  let cached = null
  /** @type {Promise<any> | null} */
  let pending = null
  /** @type {{ key: string | null, lines: Array<{ time: number, text: string }> }} */
  let lyric = { key: null, lines: [] }

  async function requestText(path) {
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined
    const response = await fetchImpl(`${baseUrl}${path}`, {
      cache: 'no-store',
      signal,
      headers: { accept: 'application/json, text/plain, */*' },
    })
    if (!response.ok) {
      const error = new Error(`LX API ${path} -> HTTP ${response.status}`)
      error.code = `HTTP_${response.status}`
      throw error
    }
    return response.text()
  }

  async function readOnce() {
    const rawStatus = await requestText(`/status?filter=${STATUS_FILTER}`)
    let status
    try {
      status = JSON.parse(rawStatus)
    } catch {
      const error = new Error('LX API /status 返回的不是 JSON')
      error.code = 'BAD_STATUS'
      throw error
    }
    if (!status || typeof status !== 'object') {
      const error = new Error('LX API /status 返回空对象')
      error.code = 'BAD_STATUS'
      throw error
    }

    const name = typeof status.name === 'string' ? status.name : ''
    const singer = typeof status.singer === 'string' ? status.singer : ''
    const songKey = `${name}\u0000${singer}`

    if (songKey !== lyric.key) {
      const raw = await requestText('/lyric')
      lyric = { key: songKey, lines: parseLrc(raw).lines }
    }

    const progress = Number(status.progress)
    const duration = Number(status.duration)
    const index = findLineIndex(lyric.lines, progress)

    return {
      ok: true,
      api: { enabled: true, port, error: null },
      song: {
        name,
        singer,
        album: typeof status.albumName === 'string' ? status.albumName : '',
        duration: Number.isFinite(duration) ? duration : 0,
      },
      play: {
        status: typeof status.status === 'string' ? status.status : 'unknown',
        progress: Number.isFinite(progress) ? progress : 0,
        playbackRate: Number.isFinite(Number(status.playbackRate)) ? Number(status.playbackRate) : 1,
      },
      lyric: {
        index,
        total: lyric.lines.length,
        line: index >= 0 ? lyric.lines[index].text : '',
        slots: lyricWindow(lyric.lines, index, radius),
        // 整首时间轴，让浏览器自己按本地时钟推算当前行：
        // 页面不再等「服务器算好的行」，换行只受本机时钟影响。
        timeline: lyric.lines.map((item) => [item.time, item.text]),
      },
      at: now(),
    }
  }

  function offlineValue(error) {
    const rawCode = typeof error?.code === 'string' ? error.code : ''
    const name = error?.name
    let code = 'API_ERROR'
    if (name === 'TimeoutError' || name === 'AbortError') {
      code = 'TIMEOUT'
    } else if (rawCode.startsWith('HTTP_') || rawCode === 'BAD_STATUS') {
      code = rawCode
    } else if (['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH', 'EAI_AGAIN'].includes(rawCode)) {
      code = 'API_OFFLINE'
    } else if (/ECONNREFUSED|ECONNRESET|fetch failed/i.test(String(error?.message))) {
      code = 'API_OFFLINE'
    }
    return {
      ok: true,
      api: { enabled: false, port, error: code },
      song: null,
      play: null,
      lyric: null,
      at: now(),
    }
  }

  /**
   * 读一帧歌词状态（带缓存与并发合流）。
   * API 没开时不会抛错，而是返回 api.enabled === false 的正常结果，
   * 让浏览器侧可以安静地什么都不画。
   */
  async function read() {
    const at = now()
    if (cached !== null && at - cached.at < cacheMs) return cached.value
    if (pending !== null) return pending

    pending = (async () => {
      let value
      try {
        value = await readOnce()
      } catch (error) {
        value = offlineValue(error)
      }
      // 失败也缓存，避免 API 关着时每 500ms 打一次连接。
      cached = { at: now(), value }
      pending = null
      return value
    })()

    return pending
  }

  function reset() {
    cached = null
    pending = null
    lyric = { key: null, lines: [] }
  }

  /**
   * 播放控制。action: 'prev' | 'next' | 'toggle'。
   * toggle 会先读当前状态（走缓存）再决定发 /play 还是 /pause。
   * 失败不抛错，返回 { ok:false, code }。
   *
   * options.desired: 'playing' | 'paused'。只在「刚把播放器拉起来、重放这次点击」
   * 时传 —— 播放器自己可能恢复了播放，这时再 toggle 一下反而会把音乐关掉。
   */
  async function control(action, options) {
    const normalized = typeof action === 'string' ? action.trim().toLowerCase() : ''
    if (!['prev', 'next', 'toggle'].includes(normalized)) {
      return { ok: false, action: normalized || null, code: 'UNKNOWN_ACTION' }
    }

    try {
      let path
      if (normalized === 'prev') {
        path = '/skip-prev'
      } else if (normalized === 'next') {
        path = '/skip-next'
      } else {
        const frame = await read()
        const playing = Boolean(frame && frame.play && frame.play.status === 'playing')
        const desired = options?.desired
        if ((desired === 'playing' || desired === 'paused') && (desired === 'playing') === playing) {
          // 已经是用户要的状态：再发一次请求只会把它翻回去。
          return { ok: true, action: normalized, path: null, settled: true }
        }
        path = playing ? '/pause' : '/play'
      }

      const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(timeoutMs)
        : undefined
      const response = await fetchImpl(`${baseUrl}${path}`, {
        cache: 'no-store',
        signal,
        headers: { accept: 'application/json, text/plain, */*' },
      })
      if (!response.ok) {
        return { ok: false, action: normalized, code: `HTTP_${response.status}`, path }
      }

      // 刚改过状态，让下一次 read() 重新问一遍落雪。
      cached = null
      return { ok: true, action: normalized, path }
    } catch (error) {
      const rawCode = typeof error?.code === 'string' ? error.code : ''
      const name = error?.name
      let code = 'API_ERROR'
      if (name === 'TimeoutError' || name === 'AbortError') {
        code = 'TIMEOUT'
      } else if (rawCode.startsWith('HTTP_')) {
        code = rawCode
      } else if (['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH', 'EAI_AGAIN'].includes(rawCode)) {
        code = 'API_OFFLINE'
      } else if (/ECONNREFUSED|ECONNRESET|fetch failed/i.test(String(error?.message))) {
        code = 'API_OFFLINE'
      }
      return { ok: false, action: normalized, code }
    }
  }

  return { read, control, reset, baseUrl, port }
}
