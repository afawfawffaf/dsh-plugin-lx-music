/**
 * dsh-plugin-lx-music — 浏览器半边（手写的 __ModuleLoader__ factory 包，无构建步骤）。
 *
 * 三个座位：
 *   · conversation.input.right —— 输入框右侧的「歌词」按钮：临时收起 / 展开内嵌歌词。
 *   · shell.overlay           —— 右侧壁纸带里的内嵌歌词层 + 失败提示卡。
 *   · settings.section        —— 「落雪音乐」设置：内嵌歌词开关、开放 API 状态。
 *
 * 歌词数据全部来自宿主 GET /lx-music/lyric（宿主再去问落雪的开放 API 23330），
 * 浏览器不直接跨域访问落雪。桌面歌词窗的显隐一律 POST /lx-music/lyrics {visible}。
 */
;(() => {
  function makeFactory() {
    return (require) => {
      const module = { exports: {} }
      const react = require('react')
      const jsxRuntime = require('react/jsx-runtime')
      const jsx = jsxRuntime.jsx
      const jsxs = jsxRuntime.jsxs

      const NS = 'lx-music'
      const PREFS_KEY = 'lx-music:prefs'

      const messages = {
        zh: {
          button: '歌词',
          controlGroup: '播放控制',
          controlPrev: '上一首',
          controlNext: '下一首',
          controlPlay: '播放',
          controlPause: '暂停',
          controlFailed: '落雪没答应',
          controlNoAnswer: '请求发出去了，但没有回应。',
          controlPausedHint: '等一两秒再点；还不行就看落雪是不是卡住了。',
          launchTitle: '正在打开落雪音乐',
          launchMessage: '没连上落雪，插件正试着把它启动起来；起来之后就接着放。',
          tipCollapsed: '内嵌歌词已收起，点一下放回来。',
          tipShown: '内嵌歌词显示中，点一下收起。',
          tipDisabled: '内嵌歌词在设置里关着，点一下打开。',
          settingsNav: '落雪音乐',
          settingsTitle: '落雪音乐',
          settingsEmbedded: '在对话背景里显示歌词',
          settingsEmbeddedHint: '关掉后歌词改由落雪的桌面歌词窗显示（内嵌开着时那扇窗会自动藏起来）。',
          apiOn: '开放 API 已连接',
          apiOff: '开放 API 没开',
          apiOffHint: '去落雪「设置 → 开放 API」里打开，端口保持 23330。',
          apiError: '开放 API 没响应',
          apiAfterLaunch: '播放器打开了，但开放 API 没回应',
          apiAfterLaunchHint: '到落雪「设置 → 开放 API」里打开它（端口 23330），再点一次播放。',
          desktopOn: '桌面歌词窗：显示中',
          desktopOff: '桌面歌词窗：已隐藏',
          desktopUnknown: '桌面歌词窗：状态未知',
          desktopToggle: '现在切换桌面歌词窗',
          errTitle: '落雪的桌面歌词没切成',
          notFound: '没找到 LX Music 的程序（lx-music-desktop.exe），它可能没装，或者装在了别处。',
          notFoundHint: '先手动打开一次落雪，或者把它装在哪告诉我，我把它加进搜索列表。',
          noLyricWindow: '落雪在运行，但「桌面歌词」没开着，所以没有可以切换的窗口。',
          noLyricWindowHint: '到落雪里打开「桌面歌词」（设置 → 桌面歌词）。',
          launchFailed: '找到落雪的程序了，但启动时被系统挡了下来。',
          launchFailedHint: '到开始菜单手动打开一次落雪，之后这个按钮还能用。',
          generic: '切歌词的时候出了点意外。',
          genericHint: '稍等一下再试；还不行就重启一次落雪。',
          dismiss: '知道了',
        },
        en: {
          button: 'Lyrics',
          controlGroup: 'Playback',
          controlPrev: 'Previous track',
          controlNext: 'Next track',
          controlPlay: 'Play',
          controlPause: 'Pause',
          controlFailed: "LX Music didn't take it",
          controlNoAnswer: 'The request went out, but nothing came back.',
          controlPausedHint: 'Give it a second and try again; if it keeps failing, check whether LX Music is stuck.',
          launchTitle: 'Starting LX Music',
          launchMessage: "Couldn't reach LX Music, so the plugin is trying to start it; playback picks up as soon as it is up.",
          tipCollapsed: 'In-page lyrics are collapsed. Click to bring them back.',
          tipShown: 'In-page lyrics are showing. Click to collapse them.',
          tipDisabled: 'In-page lyrics are turned off in settings. Click to turn them on.',
          settingsNav: 'LX Music',
          settingsTitle: 'LX Music',
          settingsEmbedded: 'Show lyrics over the chat background',
          settingsEmbeddedHint: 'When off, lyrics come from the LX Music desktop overlay window instead (that window is hidden automatically while this is on).',
          apiOn: 'Open API connected',
          apiOff: 'Open API is off',
          apiOffHint: 'Turn it on inside LX Music under Settings → Open API, keep port 23330.',
          apiError: 'Open API not responding',
          apiAfterLaunch: 'The player opened, but its open API stayed quiet',
          apiAfterLaunchHint: 'Turn on the open API in LX Music (Settings → Open API, port 23330), then click play again.',
          desktopOn: 'Desktop lyric window: showing',
          desktopOff: 'Desktop lyric window: hidden',
          desktopUnknown: 'Desktop lyric window: unknown',
          desktopToggle: 'Toggle the desktop lyric window now',
          errTitle: "Couldn't switch the desktop lyrics",
          notFound: 'lx-music-desktop.exe was not found — it may not be installed, or it lives somewhere unusual.',
          notFoundHint: 'Open LX Music once by hand, or tell me where it is and I will add it to the search list.',
          noLyricWindow: 'LX Music is running, but its desktop lyric overlay is off, so there is no window to switch.',
          noLyricWindowHint: 'Turn on desktop lyrics inside LX Music (Settings → Desktop lyrics).',
          launchFailed: 'Found LX Music but the system blocked the launch.',
          launchFailedHint: 'Open LX Music once from the Start menu; the button keeps working afterwards.',
          generic: 'Something went wrong while switching the lyrics.',
          genericHint: 'Try again in a moment; if it keeps failing, restart LX Music.',
          dismiss: 'Got it',
        },
      }

      /** props.t 是首选；座位没注入 props 时退回内置中文，组件不会因为少个 prop 就哑掉。 */
      const fallbackT = (key) => (messages.zh[key] !== undefined ? messages.zh[key] : key)

      /**
       * 诊断用的自报：告诉宿主「我这一页跑到哪一步了」。
       * 宿主有 GET /lx-music/client-report 可以把这些读回来。失败就算了，不能影响功能。
       */
      const report = (payload) => {
        try {
          fetch('/lx-music/client-report', {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...payload, at: Date.now() }),
            keepalive: true,
          }).catch(() => {})
        } catch {
          /* 自报失败不是功能失败 */
        }
      }

      report({ stage: 'module-eval' })

      // ---------------------------------------------------------------- 偏好 ---

      const prefs = { embedded: true, collapsed: false }
      try {
        const raw = window.localStorage.getItem(PREFS_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (typeof parsed.embedded === 'boolean') prefs.embedded = parsed.embedded
          if (typeof parsed.collapsed === 'boolean') prefs.collapsed = parsed.collapsed
        }
      } catch {
        /* 隐私模式 / 坏 JSON：用默认值 */
      }

      const prefListeners = new Set()
      const setPref = (key, value) => {
        if (prefs[key] === value) return
        prefs[key] = value
        try {
          window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
        } catch {
          /* 存不下就算了，这次运行内仍然生效 */
        }
        for (const listener of prefListeners) {
          try {
            listener()
          } catch {
            /* 一个订阅者炸了不该影响别的 */
          }
        }
      }

      function usePrefs() {
        const [, bump] = react.useState(0)
        react.useEffect(() => {
          const listener = () => bump((value) => value + 1)
          prefListeners.add(listener)
          return () => {
            prefListeners.delete(listener)
          }
        }, [])
        return prefs
      }

      // ---- 提示卡的小总线：任何地方往这里推，shell.overlay 里的 toast 订阅 ----
      const listeners = new Set()
      const emit = (payload) => {
        for (const listener of listeners) {
          try {
            listener(payload)
          } catch {
            /* 同上 */
          }
        }
      }

      // ---------------------------------------------------------------- 样式 ---

      // ---- 换行动效 ----
      // 内联 style 里写不了 @keyframes，所以注入一张只有三帧的小样式表。
      // 每帧只写 from：to 用浏览器算出来的内联值，这样 1 / 0.55 / 0.3 三档亮度
      // 不会被动画抹平，动画结束时也不会「啪」地跳回本色。
      //
      // from 的不透明度不能是 0：整块歌词会随每次换行暗一下再亮回来，看着是「闪」不是「滑」。
      // 起始值各比自己的常驻值暗一档（1→.35、.55→.3、.3→.14），配 9px 上浮，够清楚但不刺眼。
      const MOTION_STYLE_ID = 'lx-music-motion'
      const MOTION_CSS = [
        '@keyframes lx-lyric-in{from{opacity:.35;transform:translateY(9px)}}',
        '@keyframes lx-lyric-near{from{opacity:.3}}',
        '@keyframes lx-lyric-far{from{opacity:.14}}',
      ].join('')

      let motionAllowed = true
      // 顶层是否真的生效只自报一次（诊断用；见 useTopLayer）。
      let topLayerReported = false
      try {
        motionAllowed =
          typeof window.matchMedia !== 'function' ||
          !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      } catch {
        /* 查不了偏好就当能动 */
      }

      const ensureMotionStyle = () => {
        try {
          if (typeof document === 'undefined' || !document.head) return
          if (document.getElementById(MOTION_STYLE_ID) !== null) return
          const style = document.createElement('style')
          style.id = MOTION_STYLE_ID
          style.textContent = MOTION_CSS
          document.head.appendChild(style)
        } catch {
          /* 注入失败就退回「没有动画」，换行照旧只是没过渡 */
        }
      }
      ensureMotionStyle()

      const currentAnim = () => (motionAllowed ? 'lx-lyric-in .24s cubic-bezier(.22,.61,.36,1) both' : undefined)
      const nearAnim = () => (motionAllowed ? 'lx-lyric-near .2s ease-out both' : undefined)
      const farAnim = () => (motionAllowed ? 'lx-lyric-far .2s ease-out both' : undefined)

      const buttonStyle = (busy, hover, collapsed) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height: '28px',
        padding: '0 10px',
        borderRadius: '8px',
        // 容器的 flex 会把它压到 17px（实测），必须拒绝收缩，否则文字被裁掉。
        flex: '0 0 auto',
        minWidth: 'max-content',
        border: '1px solid ' + (hover ? 'currentColor' : 'rgba(127,127,127,0.35)'),
        background: hover ? 'rgba(127,127,127,0.16)' : 'rgba(127,127,127,0.08)',
        color: 'inherit',
        cursor: busy ? 'progress' : 'pointer',
        fontSize: '12px',
        fontFamily: 'inherit',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        opacity: busy ? 0.6 : collapsed ? 0.55 : 1,
        transition: 'background .15s ease, border-color .15s ease, opacity .15s ease',
      })

      const toastOverlayStyle = {
        // 同上：popover 的 UA 样式会补 inset:0，先整块清成 auto 再写我们要的三条边。
        inset: 'auto',
        top: 'auto',
        right: 'auto',
        position: 'fixed',
        left: '50%',
        bottom: '24px',
        transform: 'translateX(-50%)',
        margin: 0,
        padding: 0,
        border: 'none',
        background: 'transparent',
        boxShadow: 'none',
        overflow: 'visible',
        maxWidth: 'min(520px, calc(100vw - 32px))',
        zIndex: 2147483000,
        width: 'max-content',
        pointerEvents: 'none',
      }

      const cardStyle = {
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '12px 14px',
        borderRadius: '12px',
        background: 'rgba(24, 24, 27, 0.96)',
        color: '#fafafa',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        fontFamily: 'inherit',
        fontSize: '12px',
        lineHeight: 1.55,
      }

      const titleStyle = { fontWeight: 600, fontSize: '13px' }
      const mutedStyle = { opacity: 0.72 }
      const actionStyle = {
        alignSelf: 'flex-start',
        marginTop: '2px',
        padding: '3px 10px',
        borderRadius: '7px',
        border: '1px solid rgba(255,255,255,0.22)',
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        cursor: 'pointer',
      }

      /**
       * 舞台：右侧壁纸带里的一条竖列 —— 最上面是控制胶囊，下面紧接歌词。
       * 整体垂直居中、右对齐；舞台本身不吃鼠标事件，只有胶囊可点。
       *
       * 居中不用 translateY(-50%)：百分比位移不参与 transition（计算值一直是同一个
       * 字符串，高度变化只会让「使用值」变），所以歌词行数一变就是硬跳。改成由
       * useStageShift() 量出真实高度、写死成像素位移再过渡，高度变化时整条竖列是
       * 滑过去的。量不到高度之前仍然退回 translateY(-50%)。
       */
      const stageStyle = (shift) => ({
        // 提到 popover 顶层后，UA 会补 inset:0 / margin / border / 背景 / padding /
        // overflow:auto，必须逐项清掉。`inset:'auto'` 必须排在 top/right **之前** ——
        // 它会把四个方向一起写回 auto（第一版把它排在后面，top:50%/right 当场被抹掉，
        // 整条歌词跳到屏幕左上角外面去了）。
        inset: 'auto',
        position: 'fixed',
        top: '50%',
        right: 'clamp(24px, 4vw, 72px)',
        margin: 0,
        padding: 0,
        border: 'none',
        background: 'transparent',
        boxShadow: 'none',
        overflow: 'visible',
        maxWidth: 'none',
        maxHeight: 'none',
        transform: shift === null ? 'translateY(-50%)' : 'translateY(' + shift.toFixed(1) + 'px)',
        transition: 'transform .26s cubic-bezier(.22,.61,.36,1)',
        willChange: 'transform',
        width: 'clamp(200px, 21vw, 330px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '14px',
        pointerEvents: 'none',
        zIndex: 2147482000,
        fontFamily: 'inherit',
        color: 'rgba(255,255,255,0.94)',
        textShadow: '0 1px 2px rgba(0,0,0,0.62), 0 0 14px rgba(0,0,0,0.42)',
        userSelect: 'none',
      })

      const lyricBlockStyle = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '2px',
        textAlign: 'right',
        maxWidth: '100%',
      }

      const songStyle = {
        fontSize: '12px',
        lineHeight: 1.4,
        opacity: 0.5,
        marginBottom: '6px',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        letterSpacing: '0.02em',
      }

      function slotStyle(slot) {
        if (slot.role === 'current') {
          return {
            // 固定两行高（1.45 × 2 = 2.9em）：当前句在 1 行 / 2 行之间来回换时，
            // 整块高度不变，舞台也就不用作垂直重排。文字在框里竖着居中，
            // 所以短句不会贴着框顶留下半行空白。
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            minHeight: '2.9em',
            fontSize: '20px',
            lineHeight: 1.45,
            fontWeight: 600,
            opacity: 1,
            maxWidth: '100%',
            wordBreak: 'break-word',
            animation: currentAnim(),
          }
        }
        const near = slot.distance <= 1
        return {
          fontSize: near ? '14px' : '13px',
          lineHeight: 1.5,
          fontWeight: 400,
          opacity: slot.role === 'empty' ? 0 : near ? 0.55 : 0.3,
          maxWidth: '100%',
          wordBreak: 'break-word',
          // 上下文行只做一亮：从比自己更暗的地方浮上来，不是从全透明闪出来。
          animation: slot.role === 'empty' ? undefined : near ? nearAnim() : farAnim(),
        }
      }

      /** 控制胶囊：贴在歌词正上方，跟歌词共用同一条右边界。 */
      const controlStripStyle = (dim) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        padding: '4px 6px',
        borderRadius: '999px',
        background: 'rgba(24, 24, 27, 0.62)',
        color: 'rgba(255, 255, 255, 0.92)',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        pointerEvents: 'auto',
        opacity: dim ? 0.4 : 1,
        transition: 'opacity .25s ease',
        fontFamily: 'inherit',
        userSelect: 'none',
      })

      const controlButtonStyle = (hover, busy) => ({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '30px',
        height: '30px',
        padding: 0,
        borderRadius: '999px',
        border: 'none',
        background: hover && !busy ? 'rgba(255,255,255,0.10)' : 'transparent',
        color: 'inherit',
        cursor: busy ? 'progress' : 'pointer',
        opacity: busy ? 0.45 : 1,
        transform: busy ? 'scale(0.94)' : 'none',
        transition: 'background .15s ease, transform .12s ease, opacity .15s ease',
        pointerEvents: busy ? 'none' : 'auto',
      })

      const settingsRowStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        padding: '10px 0',
        borderBottom: '1px solid rgba(127,127,127,0.18)',
      }

      const switchStyle = (on) => ({
        position: 'relative',
        flex: '0 0 auto',
        width: '38px',
        height: '22px',
        borderRadius: '999px',
        border: '1px solid ' + (on ? 'rgba(94,160,255,0.85)' : 'rgba(127,127,127,0.45)'),
        background: on ? 'rgba(94,160,255,0.85)' : 'rgba(127,127,127,0.22)',
        cursor: 'pointer',
        padding: 0,
        transition: 'background .15s ease, border-color .15s ease',
      })

      const switchKnobStyle = (on) => ({
        position: 'absolute',
        top: '2px',
        left: on ? '18px' : '2px',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: '#fff',
        transition: 'left .15s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
      })

      /** 八分音符；collapsed 时画一道斜杠，不用靠颜色（深浅主题都不吃色）。 */
      function MusicIcon(props) {
        const children = [
          jsx('path', { d: 'M9 18V5l12-2v13' }, 'stem'),
          jsx('circle', { cx: 6, cy: 18, r: 3 }, 'left'),
          jsx('circle', { cx: 18, cy: 16, r: 3 }, 'right'),
        ]
        if (props && props.collapsed) {
          children.push(jsx('path', { d: 'M3 3l18 18' }, 'slash'))
        }
        return jsx('svg', {
          width: 14,
          height: 14,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          style: { flex: '0 0 auto' },
          children: jsx('g', { children }, 'g'),
        })
      }

      /** 把宿主返回的失败码翻成「发生了什么 / 为什么 / 怎么办」。 */
      function describeFailure(data, t) {
        const code = data && data.code
        if (code === 'NOT_FOUND') return { message: t('notFound'), hint: t('notFoundHint') }
        if (code === 'NO_LYRIC_WINDOW') return { message: t('noLyricWindow'), hint: t('noLyricWindowHint') }
        if (code === 'LAUNCH_FAILED') return { message: t('launchFailed'), hint: t('launchFailedHint') }
        if (code === 'API_OFFLINE_AFTER_LAUNCH') return { message: t('apiAfterLaunch'), hint: t('apiAfterLaunchHint') }
        return {
          message: (data && (data.message || data.code)) || t('generic'),
          hint: (data && data.hint) || t('genericHint'),
        }
      }

      const LYRIC_ENDPOINT = '/lx-music/lyric'
      const LYRICS_ENDPOINT = '/lx-music/lyrics'
      // 页面不再等「服务器算好的行」：拿整首时间轴 + 本地时钟自己推算。
      // 轮询只负责刷新锚点（歌曲/状态/进度基准），200ms 足够，且不影响换行时刻。
      const POLL_MS = 200
      const TICK_MS = 100
      const KEEP_LAST_MS = 3000
      const MIN_WIDTH = 1120

      const postVisibility = (visible) =>
        fetch(LYRICS_ENDPOINT, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ visible }),
        })
          .then((response) => response.json().catch(() => null))
          .catch(() => null)

      const CONTROL_ENDPOINT = '/lx-music/control'

      const postControl = (action, desired) =>
        fetch(CONTROL_ENDPOINT, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify(desired === undefined ? { action } : { action, desired }),
        })
          .then((response) => response.json().catch(() => null))
          .catch(() => null)

      // ---- 播放帧总线：一个轮询器，多个订阅者（歌词层 + 控制条）共用 ----
      // 分开各轮询一份会让落雪那边被问两遍；progress 每 500ms 都在变，但界面只在
      // 「歌 / 行 / 播放状态」真的变了才需要重画，所以这里按签名去重再广播。
      // player.live 每轮都刷新（不触发渲染），供本地时钟取最新锚点。
      const player = {
        frame: null,
        live: null,
        signature: '',
        listeners: new Set(),
        timer: null,
        inFlight: false,
        lastGood: 0,
      }

      // ---- 本地推算：给定锚点（进度 + 服务器时刻 + 倍速），算此刻唱到第几行 ----
      const indexAtTimeline = (timeline, progress) => {
        if (!Array.isArray(timeline) || timeline.length === 0 || !Number.isFinite(progress)) return -1
        let low = 0
        let high = timeline.length - 1
        let found = -1
        while (low <= high) {
          const mid = (low + high) >> 1
          const time = timeline[mid][0]
          if (typeof time !== 'number') break
          if (time <= progress) {
            found = mid
            low = mid + 1
          } else {
            high = mid - 1
          }
        }
        return found
      }

      const slotsAtTimeline = (timeline, index, radius) => {
        const slots = []
        for (let offset = -radius; offset <= radius; offset += 1) {
          const at = index + offset
          const row = index >= 0 && at >= 0 && at < timeline.length ? timeline[at] : null
          slots.push({
            text: row ? row[1] : '',
            role: row === null ? 'empty' : offset === 0 ? 'current' : offset < 0 ? 'prev' : 'next',
            distance: Math.abs(offset),
          })
        }
        return slots
      }

      const progressNow = (frame) => {
        const live = player.live && player.live.play ? player.live : frame
        if (!live || !live.play) return null
        const base = Number(live.play.progress)
        if (!Number.isFinite(base)) return null
        if (live.play.status !== 'playing') return base
        const rate = Number(live.play.playbackRate) || 1
        const anchor = Number(live.at)
        const age = Number.isFinite(anchor) ? Math.max(0, (Date.now() - anchor) / 1000) : 0
        return base + age * rate
      }

      const publishFrame = (next, signature) => {
        player.frame = next
        player.signature = signature
        for (const listener of Array.from(player.listeners)) {
          try {
            listener(next)
          } catch {
            /* 一个订阅者炸了不该影响别的 */
          }
        }
      }

      const dropFrame = () => {
        if (player.frame !== null && Date.now() - player.lastGood > KEEP_LAST_MS) {
          player.live = null
          publishFrame(null, '')
        }
      }

      const pollOnce = () => {
        if (player.inFlight) return
        player.inFlight = true
        fetch(LYRIC_ENDPOINT, {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { accept: 'application/json' },
        })
          .then((response) => response.json().catch(() => null))
          .then((data) => {
            if (!data || !data.api || !data.api.enabled || !data.lyric) {
              dropFrame()
              return
            }
            player.lastGood = Date.now()
            player.live = data
            const signature = JSON.stringify([
              data.play && data.play.status,
              data.song && data.song.name,
              data.song && data.song.singer,
              data.lyric.index,
              (data.lyric.slots || []).map((slot) => slot.text),
            ])
            if (signature !== player.signature) publishFrame(data, signature)
          })
          .catch(() => dropFrame())
          .finally(() => {
            player.inFlight = false
            if (player.listeners.size > 0) {
              player.timer = setTimeout(() => {
                player.timer = null
                pollOnce()
              }, POLL_MS)
            }
          })
      }

      function usePlayerFrame() {
        const [frame, setFrame] = react.useState(player.frame)
        react.useEffect(() => {
          const listener = (next) => setFrame(next)
          player.listeners.add(listener)
          setFrame(player.frame)
          if (player.listeners.size === 1 && player.timer === null && !player.inFlight) pollOnce()
          return () => {
            player.listeners.delete(listener)
            if (player.listeners.size === 0 && player.timer !== null) {
              clearTimeout(player.timer)
              player.timer = null
            }
          }
        }, [])
        return frame
      }

      function useNarrow() {
        const [narrow, setNarrow] = react.useState(() => window.innerWidth < MIN_WIDTH)
        react.useEffect(() => {
          const update = () => setNarrow(window.innerWidth < MIN_WIDTH)
          update()
          window.addEventListener('resize', update)
          return () => window.removeEventListener('resize', update)
        }, [])
        return narrow
      }

      /**
       * 垂直居中用的位移量：量出竖列的真实高度，返回 -高度/2 的像素值。
       * 返回 [挂到舞台节点上的 callback ref, 位移]；量不到时位移是 null，
       * 舞台退回 translateY(-50%)。
       * 用 callback ref 而不是 useEffect([])：首帧还没有播放数据时舞台整个不渲染，
       * 节点是在后面才挂上的，空依赖的 effect 永远等不到它。
       */
      function useStageShift() {
        const [shift, setShift] = react.useState(null)
        const observer = react.useRef(null)
        const setNode = react.useCallback((node) => {
          if (observer.current !== null) {
            observer.current.disconnect()
            observer.current = null
          }
          if (!node) return
          const apply = () => {
            try {
              const height = node.getBoundingClientRect().height
              if (!Number.isFinite(height) || height <= 0) return
              // 差值小于半像素就别 setState，免得和 ResizeObserver 来回抖。
              setShift((prev) => (prev !== null && Math.abs(prev + height / 2) < 0.5 ? prev : -height / 2))
            } catch {
              /* 量不到就保持原样 */
            }
          }
          apply()
          if (typeof ResizeObserver === 'function') {
            observer.current = new ResizeObserver(apply)
            observer.current.observe(node)
          }
        }, [])
        react.useEffect(
          () => () => {
            if (observer.current !== null) {
              observer.current.disconnect()
              observer.current = null
            }
          },
          [],
        )
        return [setNode, shift]
      }

      /**
       * 把节点提到浏览器「顶层」（top layer）——popover 的 manual 模式。
       *
       * 为什么必须这么干：`shell.overlay` 这个座位实测挂在一个 z-index:20 的堆叠上下文
       * 里（`.BynINW_overlayLayer`），里面的 z-index 再大也只在这层里排序。别的插件
       * 的面板（设置页 `.dcu-settings-main`、comfyui 面板 `.dsc-panel{z-index:900}`）
       * 在更高的层，会把歌词和胶囊整个盖住 —— 213万的内联 z-index 一点用都没有。
       * 顶层不受任何 z-index / 堆叠上下文影响，而且节点留在 React 树里（事件委托照旧），
       * 是唯一既不搬 DOM 又能永远压在最上面的正规手段。
       *
       * 不支持 showPopover 的浏览器原地不动，行为和以前完全一样。
       */
      const useTopLayer = (node) => {
        const layout = react.useLayoutEffect || react.useEffect
        layout(() => {
          if (!node || typeof node.showPopover !== 'function') {
            if (node && !topLayerReported) {
              topLayerReported = true
              report({ stage: 'top-layer', ok: false, why: 'no showPopover' })
            }
            return undefined
          }
          let ok = false
          let why = ''
          try {
            if (!node.hasAttribute('popover')) node.setAttribute('popover', 'manual')
            if (typeof node.matches === 'function' && !node.matches(':popover-open')) node.showPopover()
            ok = typeof node.matches === 'function' ? node.matches(':popover-open') : true
          } catch (error) {
            why = String((error && error.message) || error)
          }
          if (!topLayerReported) {
            topLayerReported = true
            report({ stage: 'top-layer', ok, why })
          }
          return () => {
            try {
              if (typeof node.matches === 'function' && node.matches(':popover-open')) node.hidePopover()
            } catch {
              /* 卸载时节点可能已经不在文档里，忽略 */
            }
          }
        }, [node])
      }

      // ------------------------------------------------- 舞台（控制胶囊 + 歌词） ---

      function LxMusicStage(props) {
        const t = props && typeof props.t === 'function' ? props.t : fallbackT
        const state = usePrefs()
        const frame = usePlayerFrame()
        const narrow = useNarrow()
        const synced = react.useRef(null)
        const mounted = react.useRef(false)
        const measured = react.useRef(false)
        const controlsRef = react.useRef(null)
        const lyricsRef = react.useRef(null)
        const [stageRef, shift] = useStageShift()
        const [stageNode, setStageNode] = react.useState(null)
        // 一个 ref 既给 useStageShift 测高，也把节点交给 useTopLayer —— 回调 ref 必须串联，
        // 直接覆盖会让测高失效（高度量不到，居中又退回 translateY(-50%)）。
        const attachStage = react.useCallback(
          (node) => {
            stageRef(node)
            setStageNode(node)
          },
          [stageRef],
        )
        const [busy, setBusy] = react.useState(null)
        const [optimistic, setOptimistic] = react.useState(null)
        const [hover, setHover] = react.useState(null)

        // 交给浏览器顶层：只有这样才能压过别的插件的面板（见 useTopLayer 注释）。
        useTopLayer(stageNode)

        react.useEffect(() => {
          if (mounted.current) return
          mounted.current = true
          report({ stage: 'stage-mount' })
        }, [])

        // 一次性实测：胶囊和歌词到底在屏幕上的哪个位置、谁在上面。
        // 看不见页面时，这是唯一能证明「布局对」的证据（17px 空壳那次就是靠几何数据抓到的）。
        react.useEffect(() => {
          if (measured.current) return
          const control = controlsRef.current
          const lyric = lyricsRef.current
          if (!control || !lyric) return
          measured.current = true
          const rect = (node) => {
            const box = node.getBoundingClientRect()
            return { x: Math.round(box.left), y: Math.round(box.top), w: Math.round(box.width), h: Math.round(box.height) }
          }
          report({
            stage: 'stage-rect',
            controls: rect(control),
            lyrics: rect(lyric),
            viewport: { w: window.innerWidth, h: window.innerHeight },
          })
        }, [frame])

        // 一次性自检：顶层到底提上去了没有、胶囊还能不能点到。
        // 看不见页面的时候，这是唯一能证明「歌词压过了别人的面板」的证据。
        // 必须延后 600ms：提顶层的 layout effect 要等 stageNode 落到 state 之后才跑。
        const measureStage = (stage) => {
          const desc = (el) => {
            if (!el) return null
            const css = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null
            return {
              tag: el.tagName.toLowerCase(),
              cls: String(el.getAttribute('class') || '').slice(0, 48),
              z: css ? css.zIndex : '',
            }
          }
          const center = (node) => {
            if (!node || typeof document.elementFromPoint !== 'function') return null
            const box = node.getBoundingClientRect()
            return document.elementFromPoint(Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2))
          }
          const hit = center(controlsRef.current)
          const parent = stage.parentElement
          report({
            stage: 'top-layer-hit',
            open: typeof stage.matches === 'function' ? stage.matches(':popover-open') : null,
            others: typeof document.querySelectorAll === 'function' ? document.querySelectorAll(':popover-open').length : null,
            // 胶囊中心命中的是不是我们自己（是 path/svg 也算，事件照样冒泡到 button）
            own: !!stage.contains(hit),
            hit: desc(hit),
            // 提上去了就看不到父亲的层；没提上去才有意义（查为什么压不住时用）
            parent: desc(parent),
          })
        }

        const probed = react.useRef(false)
        react.useEffect(() => {
          if (probed.current) return
          // 不在这里 clearTimeout：frame 每换一行就变一次，cleanup 会把定时器掐掉，
          // 而 probed 已经置位 → 永远不会再安排，探针就静悄悄消失了（踩过一次）。
          setTimeout(() => {
            if (probed.current) return
            const stage = typeof document !== 'undefined' ? document.querySelector('[data-lx-stage]') : null
            if (!stage || typeof getComputedStyle !== 'function') return
            probed.current = true
            measureStage(stage)
          }, 600)
        }, [frame])

        // 一次性自报：换行动效到底有没有生效、量出来的居中位移是多少。
        // 看不见页面的时候，这是唯一能证明「这次改动真的跑起来了」的证据 ——
        // 报里出现 stage-shift 且 motion=true，就说明新 bundle 已在页面里求值。
        const reportedShift = react.useRef(false)
        react.useEffect(() => {
          if (reportedShift.current || shift === null) return
          reportedShift.current = true
          report({ stage: 'stage-shift', motion: motionAllowed, shift: Math.round(shift * 10) / 10 })
        }, [shift])

        // 互斥：内嵌歌词开着 → 桌面歌词窗藏起来；关掉 → 放回来。只在偏好变化时发一次。
        // 藏失败不用管（桌面歌词本来就可以是关的）；放回来失败要告诉用户，
        // 否则他会以为「关掉内嵌，浮窗自己会回来」。
        react.useEffect(() => {
          const desired = !state.embedded
          const key = String(desired)
          if (synced.current === key) return
          synced.current = key
          postVisibility(desired).then((data) => {
            if (!desired || !data || data.ok === true) return
            const failure = describeFailure(data, t)
            emit({ title: t('errTitle'), message: failure.message, hint: failure.hint })
          })
        }, [state.embedded])

        const live = frame && frame.play ? frame.play.status : null
        const playing = optimistic !== null ? optimistic === 'playing' : live === 'playing'

        // 真状态追上来后清掉乐观值，免得图标一直骗自己。
        react.useEffect(() => {
          if (optimistic === null || live === null) return
          if ((live === 'playing') === (optimistic === 'playing')) setOptimistic(null)
        }, [live, optimistic])

        const send = (action, nextPlaying) => {
          if (busy !== null) return
          if (nextPlaying !== undefined) setOptimistic(nextPlaying ? 'playing' : 'paused')
          setBusy(action)
          // 连一帧数据都没有，说明播放器根本没在跑：宿主会顺手把它拉起来，
          // 这一步可能要几秒，先说一声，别让人以为点了没反应。
          if (frame === null) emit({ title: t('launchTitle'), message: t('launchMessage') })
          const fail = (failure) => {
            setOptimistic(null)
            emit({ title: t('controlFailed'), message: failure.message, hint: failure.hint })
          }
          postControl(action, nextPlaying === undefined ? undefined : nextPlaying ? 'playing' : 'paused')
            .then((data) => {
              if (!data) {
                fail({ message: t('controlNoAnswer'), hint: t('controlPausedHint') })
                return
              }
              if (!data.ok) fail(describeFailure(data, t))
            })
            .catch(() => fail({ message: t('controlNoAnswer'), hint: t('controlPausedHint') }))
            .finally(() => {
              setTimeout(() => setBusy(null), 350)
            })
        }

        // 本地推算当前行：整首时间轴只随「换歌」变；每 100ms 用本机时钟对一次锚点。
        // 换行时刻因此不再受轮询节奏影响（以前最坏要多等 500ms 轮询 + 700ms 缓存）。
        const timeline = frame && frame.lyric && Array.isArray(frame.lyric.timeline) && frame.lyric.timeline.length > 0
          ? frame.lyric.timeline
          : null
        const [localIndex, setLocalIndex] = react.useState(frame && frame.lyric ? frame.lyric.index : -1)

        // 本地推算当前行：整首时间轴只随「换歌」变；每一帧用本机时钟对一次锚点。
        // 用 requestAnimationFrame 而不是 100ms 定时器：换行落在离真实时刻最近的那一帧
        // （误差 ≤ 一帧，定时器最坏要等 100ms 才反应过来），而且换行和 CSS 动画用的是
        // 同一个时钟，不会再出现「字先变、动效后到」的错拍。标签页隐藏时 rAF 自己停，
        // 回到前台重算一次即可。
        react.useEffect(() => {
          if (timeline === null) {
            setLocalIndex(frame && frame.lyric ? frame.lyric.index : -1)
            return undefined
          }
          let last = -2
          const sync = () => {
            const progress = progressNow(frame)
            const next = progress === null ? -1 : indexAtTimeline(timeline, progress)
            if (next !== last) {
              last = next
              setLocalIndex(next)
            }
          }
          sync()
          if (!frame || !frame.play || frame.play.status !== 'playing') return undefined
          if (typeof requestAnimationFrame === 'function') {
            let raf = 0
            const frameLoop = () => {
              sync()
              raf = requestAnimationFrame(frameLoop)
            }
            raf = requestAnimationFrame(frameLoop)
            return () => cancelAnimationFrame(raf)
          }
          const id = setInterval(sync, TICK_MS)
          return () => clearInterval(id)
        }, [frame, timeline])

        // 一次性自报：把每一行「实际生效」的样式读回来。keyframes 有没有被浏览器认下来
        // （animationName 不是 none）、当前句是不是真的定高两行，都在这里看得见 ——
        // 光看源码证明不了 CSS 真的挂上了，这个仓库吃过太多次「代码对、页面没跑」的亏。
        // 必须放在 localIndex 声明之后（它的依赖里有 localIndex）。
        const styleReports = react.useRef(0)
        react.useEffect(() => {
          if (styleReports.current >= 2) return
          const block = lyricsRef.current
          if (!block) return
          styleReports.current += 1
          const rows = []
          for (const node of block.children) {
            if (!node || node.tagName !== 'DIV') continue
            const css = typeof getComputedStyle === 'function' ? getComputedStyle(node) : null
            rows.push({
              animation: css ? css.animationName : null,
              opacity: css ? Number(css.opacity) : null,
              minHeight: css ? css.minHeight : null,
              height: Math.round(node.getBoundingClientRect().height),
            })
          }
          report({
            stage: 'lyric-style',
            index: localIndex,
            block: Math.round(block.getBoundingClientRect().height),
            rows,
          })
        }, [localIndex, frame])

        if (narrow || frame === null || !frame.play) return null

        const showLyrics = state.embedded && !state.collapsed && frame.lyric !== null
        const slots = timeline !== null && localIndex >= 0
          ? slotsAtTimeline(timeline, localIndex, 2)
          : (frame.lyric && frame.lyric.slots) || []
        const song = frame.song || {}
        const label = [song.name, song.singer].filter(Boolean).join(' · ')

        const controlButton = (kind, title, icon, onClick) =>
          jsx(
            'button',
            {
              type: 'button',
              title,
              'aria-label': title,
              disabled: busy !== null ? true : undefined,
              onClick,
              onMouseEnter: () => setHover(kind),
              onMouseLeave: () => setHover(null),
              // children 必须放在 props 里（第三参是 key）。
              style: controlButtonStyle(hover === kind, busy === kind),
              children: jsx(icon, {}),
            },
            kind,
          )

        return jsx('div', {
          ref: attachStage,
          'data-lx-stage': 'stage',
          style: stageStyle(shift),
          children: [
            jsx(
              'div',
              {
                ref: controlsRef,
                style: controlStripStyle(!playing),
                role: 'group',
                'aria-label': label ? `${t('controlGroup')} — ${label}` : t('controlGroup'),
                children: [
                  controlButton('prev', t('controlPrev'), PrevIcon, () => send('prev')),
                  controlButton(
                    'toggle',
                    playing ? t('controlPause') : t('controlPlay'),
                    playing ? PauseIcon : PlayIcon,
                    () => send('toggle', !playing),
                  ),
                  controlButton('next', t('controlNext'), NextIcon, () => send('next')),
                ],
              },
              'controls',
            ),
            showLyrics
              ? jsx(
                'div',
                {
                  ref: lyricsRef,
                  style: lyricBlockStyle,
                  children: [
                    label ? jsx('div', { style: songStyle, children: label }, 'song') : null,
                    ...slots.map((slot, index) =>
                      jsx(
                        'div',
                        {
                          style: slotStyle(slot),
                          children: slot.text || '\u00a0',
                        },
                        // key 里必须带文本：以前只用 slot-序号 当 key，换行时 React 复用
                        // 同一个节点、只把文本换掉，节点上没有任何属性变化 —— 于是
                        // opacity/transform 的 transition 一次也触发不了，看到的就是硬切。
                        // 带上文本，换行时整行重建，入场动画才有机会播。
                        'slot:' + index + ':' + slot.text,
                      ),
                    ),
                  ],
                },
                'lyrics',
              )
              : null,
          ],
        })
      }

      // ------------------------------------------------------------- 控制条 ---

      const iconProps = {
        width: 16,
        height: 16,
        viewBox: '0 0 24 24',
        fill: 'currentColor',
        'aria-hidden': 'true',
        focusable: 'false',
      }

      function PrevIcon() {
        return jsxs('svg', {
          ...iconProps,
          children: [
            jsx('path', { d: 'M6.6 5h2.2v14H6.6z' }, 'bar'),
            jsx('path', { d: 'M19 5.4v13.2L9.2 12z' }, 'tri'),
          ],
        })
      }

      function NextIcon() {
        return jsxs('svg', {
          ...iconProps,
          children: [
            jsx('path', { d: 'M15.2 5h2.2v14h-2.2z' }, 'bar'),
            jsx('path', { d: 'M5 5.4v13.2L14.8 12z' }, 'tri'),
          ],
        })
      }

      function PlayIcon() {
        return jsx('svg', {
          ...iconProps,
          children: jsx('path', { d: 'M8 5.2v13.6L19.4 12z' }, 'tri'),
        })
      }

      function PauseIcon() {
        return jsxs('svg', {
          ...iconProps,
          children: [
            jsx('path', { d: 'M8.2 5h3v14h-3z' }, 'left'),
            jsx('path', { d: 'M12.8 5h3v14h-3z' }, 'right'),
          ],
        })
      }

      // ------------------------------------------------------------- 按钮 ---

      function LxMusicButton(props) {
        const t = props && typeof props.t === 'function' ? props.t : fallbackT
        const state = usePrefs()
        const [hover, setHover] = react.useState(false)
        const mounted = react.useRef(false)
        const nodeRef = react.useRef(null)

        react.useEffect(() => {
          if (mounted.current) return
          mounted.current = true
          report({ stage: 'button-mount' })
          // 诊断：按钮的实际几何，肉眼看不见时能分辨「没渲染」还是「渲染了但看不见」。
          const timer = setTimeout(() => {
            const node = nodeRef.current
            const info = { stage: 'button-rect' }
            if (!node) {
              info.missing = true
              report(info)
              return
            }
            const rect = node.getBoundingClientRect()
            info.rect = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
            info.text = String(node.textContent || '')
            info.viewport = { w: window.innerWidth, h: window.innerHeight }
            report(info)
          }, 400)
          return () => clearTimeout(timer)
        }, [])

        const collapsed = state.collapsed || !state.embedded
        const onClick = react.useCallback(() => {
          if (!prefs.embedded) {
            // 设置里关掉了：这个按钮当成「现在打开」用。
            setPref('embedded', true)
            setPref('collapsed', false)
            return
          }
          setPref('collapsed', !prefs.collapsed)
        }, [])

        const tip = !state.embedded ? t('tipDisabled') : state.collapsed ? t('tipCollapsed') : t('tipShown')

        return jsx('button', {
          type: 'button',
          title: tip,
          'aria-label': tip,
          'aria-pressed': collapsed ? 'true' : 'false',
          ref: nodeRef,
          onClick,
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
          style: buttonStyle(false, hover, collapsed),
          // children 必须放在 props 里：jsx(type, props, key) 的第三个参数是 key，不是子节点。
          children: jsxs(
            'span',
            {
              style: { display: 'inline-flex', alignItems: 'center', gap: '6px' },
              children: [
                jsx(MusicIcon, { collapsed }, 'icon'),
                jsx('span', { children: t('button') }, 'label'),
              ],
            },
            'inner',
          ),
        })
      }

      // ------------------------------------------------------------- 设置页 ---

      function LxMusicSettings(props) {
        const t = props && typeof props.t === 'function' ? props.t : fallbackT
        const state = usePrefs()
        const [api, setApi] = react.useState(null)
        const [desktop, setDesktop] = react.useState(null)

        react.useEffect(() => {
          let cancelled = false
          const load = () => {
            fetch(LYRIC_ENDPOINT, { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } })
              .then((response) => response.json().catch(() => null))
              .then((data) => {
                if (!cancelled && data && data.api) setApi(data.api)
              })
              .catch(() => {})
            fetch(LYRICS_ENDPOINT, { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } })
              .then((response) => response.json().catch(() => null))
              .then((data) => {
                if (!cancelled && data && typeof data.visible === 'boolean') setDesktop(data.visible)
              })
              .catch(() => {})
          }
          load()
          const timer = setInterval(load, 5000)
          return () => {
            cancelled = true
            clearInterval(timer)
          }
        }, [])

        const toggleEmbedded = () => {
          const next = !prefs.embedded
          setPref('embedded', next)
          if (next) setPref('collapsed', false)
        }

        const apiLine = api === null
          ? t('apiError')
          : api.enabled
            ? `${t('apiOn')}（127.0.0.1:${api.port}）`
            : `${t('apiOff')}（${api.port}${api.error ? ` · ${api.error}` : ''}）`

        const desktopLine = desktop === null
          ? t('desktopUnknown')
          : desktop
            ? t('desktopOn')
            : t('desktopOff')

        return jsxs('div', {
          children: [
            jsx('div', { style: { fontWeight: 600, marginBottom: '4px' }, children: t('settingsTitle') }, 'title'),
            jsxs(
              'div',
              {
                style: settingsRowStyle,
                children: [
                  jsxs(
                    'div',
                    {
                      children: [
                        jsx('div', { children: t('settingsEmbedded') }, 'label'),
                        jsx('div', { style: { ...mutedStyle, marginTop: '2px', maxWidth: '46ch' }, children: t('settingsEmbeddedHint') }, 'hint'),
                      ],
                    },
                    'text',
                  ),
                  jsx(
                    'button',
                    {
                      type: 'button',
                      role: 'switch',
                      'aria-checked': state.embedded ? 'true' : 'false',
                      'aria-label': t('settingsEmbedded'),
                      onClick: toggleEmbedded,
                      style: switchStyle(state.embedded),
                      children: jsx('span', { style: switchKnobStyle(state.embedded) }, 'knob'),
                    },
                    'switch',
                  ),
                ],
              },
              'row',
            ),
            jsxs(
              'div',
              {
                style: { ...mutedStyle, display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '10px' },
                children: [
                  jsx('div', { children: apiLine }, 'api'),
                  jsx('div', { children: desktopLine }, 'desktop'),
                  api !== null && !api.enabled
                    ? jsx('div', { children: t('apiOffHint') }, 'apihint')
                    : null,
                ],
              },
              'status',
            ),
          ],
        })
      }

      // -------------------------------------------------------------- 提示卡 ---

      function LxMusicToast(props) {
        const t = props && typeof props.t === 'function' ? props.t : fallbackT
        const [toast, setToast] = react.useState(null)
        const [overlayNode, setOverlayNode] = react.useState(null)

        // 提示卡也挂在同一个 z-index:20 的座位里，同样会被插件面板盖住 —— 一起提到顶层。
        useTopLayer(overlayNode)

        react.useEffect(() => {
          report({ stage: 'toast-mount' })
        }, [])

        react.useEffect(() => {
          const listener = (payload) => setToast(payload)
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        }, [])

        react.useEffect(() => {
          if (!toast) return undefined
          const timer = setTimeout(() => setToast(null), 8000)
          return () => clearTimeout(timer)
        }, [toast])

        if (!toast) return null

        return jsx('div', {
          style: toastOverlayStyle,
          ref: setOverlayNode,
          children: jsxs('div', {
            style: cardStyle,
            role: 'status',
            children: [
              jsx('div', { style: titleStyle, children: toast.title }, 'title'),
              jsx('div', { children: toast.message }, 'message'),
              toast.hint ? jsx('div', { style: mutedStyle, children: toast.hint }, 'hint') : null,
              jsx(
                'button',
                {
                  type: 'button',
                  style: actionStyle,
                  onClick: () => setToast(null),
                  children: toast.dismiss || t('dismiss'),
                },
                'dismiss',
              ),
            ],
          }),
        })
      }

      const name = 'lx-music'
      const inject = ['slots', 'locale']

      function apply(ctx) {
        try {
          ctx.effect(() => ctx.locale.register(NS, messages), 'lx-music: dictionaries')
          const t = ctx.locale.bind(NS)

          ctx.slots.inject('conversation.input.right', () =>
            ctx.slots.register(
              {
                name: 'conversation.input.right',
                id: 'lx-music',
                order: 10,
                inject: () => ({ t }),
              },
              LxMusicButton,
            ),
          )

          // 一个 overlay 同时管控制胶囊和歌词：胶囊在上、歌词在下，共用同一条右边界。
          // 合成一个组件是为了让两者永远一起出现/消失，也省掉一次独立轮询订阅。
          ctx.slots.inject('shell.overlay', () =>
            ctx.slots.register(
              {
                name: 'shell.overlay',
                id: 'lx-music-stage',
                order: 20,
                label: () => 'lx-music-stage',
                inject: () => ({ t }),
              },
              LxMusicStage,
            ),
          )

          ctx.slots.inject('shell.overlay', () =>
            ctx.slots.register(
              {
                name: 'shell.overlay',
                id: 'lx-music-toast',
                order: 999,
                label: () => 'lx-music-toast',
                inject: () => ({ t }),
              },
              LxMusicToast,
            ),
          )

          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              {
                name: 'settings.section',
                id: 'lx-music',
                order: 60,
                label: () => t('settingsNav'),
                locale: NS,
                inject: () => ({ t }),
              },
              LxMusicSettings,
            ),
          )

          report({ stage: 'apply', ok: true })
        } catch (error) {
          report({
            stage: 'apply',
            ok: false,
            message: String((error && error.message) || error),
            stack: String((error && error.stack) || '').slice(0, 1200),
          })
          throw error
        }
      }

      // __lxTest 只给 test/client-bundle.mjs 用：把「本地推算」这两个纯函数、以及
      // 换行用的样式与关键帧暴露出来，好在不依赖浏览器定时器/DOM 的前提下验证换行边界
      // 和动效是否真的挂上了。宿主只读 apply / inject / name。
      module.exports = {
        apply,
        inject,
        name,
        __lxTest: { indexAtTimeline, slotsAtTimeline, slotStyle, motionCss: MOTION_CSS },
      }
      return module.exports
    }
  }

  window.__ModuleLoader__.load({
    id: 'dsh-plugin-lx-music',
    factory: makeFactory(),
  })
})()
