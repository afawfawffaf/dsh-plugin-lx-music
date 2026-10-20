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

      // 歌词视口：固定高度 + 藏起滚动条。滚轮在这块区域里滚时只动歌词窗口，
      // 底下的对话不跟着滚 —— 舞台整体是 pointerEvents: none，所以滚轮是在
      // window 上按坐标截下来的（见 useLyricBrowse），不是靠 native 命中。
      // 高度定死还有个附带好处：滚动时整块高度不变，舞台不用跟着重排。
      const lyricListStyle = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '2px',
        textAlign: 'right',
        maxWidth: '100%',
        height: '150px',
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'none',
        overscrollBehavior: 'contain',
        // 上下边缘淡出：句子是化进背景里，不是被视口硬切一刀。
        maskImage: 'linear-gradient(to bottom, transparent 0, #000 18%, #000 82%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 18%, #000 82%, transparent 100%)',
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
        const mid = slot.distance <= 4
        return {
          fontSize: near ? '14px' : mid ? '13px' : '12px',
          lineHeight: 1.5,
          fontWeight: 400,
          opacity: slot.role === 'empty' ? 0 : near ? 0.55 : mid ? 0.34 : 0.2,
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
      // 滚动看词：窗口里上下各多备 12 句（滚得到，但不会把整首歌塞进 DOM），
      // 停止滚动 2 秒后自己滑回正在唱的那一句。
      const BROWSE_SPAN = 12
      const BROWSE_IDLE_MS = 2000
      // 兜底轮询的间隔：真正的触发源是 ResizeObserver（挤窄/拖分栏）、pointerup（点开
      // 抽屉）和挤窄翻转，轮询只负责「什么都没发生但状态其实变了」的极端情况。所以
      // 从 400ms 放到 1 秒，省下来的都是一帧里同步布局读的时间。
      const PAGE_SCOPE_MS = 1000
      // 算是「浮层面板」的最低 z-index。右侧抽屉/分栏这类东西不会盖住输入框，
      // 但会盖到歌词那一块，所以用「歌词底下压着的浮层」来判断。阈值只要「比正常
      // 内容高一层」就行：定在 100 时实测右侧抽屉（十几甚至个位数）一个都没抓到。
      const PANEL_Z = 2

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
       * 「现在还在不在对话页」——决定歌词条和胶囊该不该显示。
       *
       * 为什么要问这个：`shell.overlay` 是 frame 级座位，切到设置页、插件页、别人的
       * 面板时我们的组件并不会卸载（组件活得好好的，只是盖在别人页面上），歌词就跟着
       * 飘到那儿去了。要的是「只在对话页显示」，所以得自己判断页面。
       *
       * 判据只用自己家的节点：`conversation.input.right` 里那个按钮（`[data-lx-input]`）。
       * 它在对话页才有；而且中心点必须真命中它 —— 设置页那类面板是**盖**在对话页上
       * 面的，composer 还在 DOM 里，只看「节点存在」会误判成「还在对话页」。
       * 被对话框、popover 这类临时浮层盖住不算离开（那时用户正要点我们）。
       */
      const pageScope = {
        onChat: true,
        listeners: new Set(),
        timer: null,
        last: null,
        reports: 0,
        seenSeat: false,
        misses: 0,
        point: null,
        viewport: 0,
        baseRight: 0,
        narrowTicks: 0,
        narrowed: false,
        lastRight: null,
        flipReports: 0,
        seatNode: null,
        seatObserver: null,
        seatWatched: [],
        seatBox: null,
      }

      /**
       * 「歌词底下压着的到底是谁」。
       *
       * 右侧抽屉、分栏、窄面板不会盖住输入框，所以 composer 那条判据对它们无感：
       * 用户拉开一个抽屉，歌词照旧飘在抽屉上面。这里换个角度 —— 看歌词自己的位置
       * 底下是什么。`elementsFromPoint` 把顶层 popover 里的我们排在第一位，跳过自己
       * 之后的第一名就是「歌词实际压着的东西」；它是 fixed/absolute 且 z-index >=
       * PANEL_Z 的浮层面板，就说明用户正在看面板，而不是在看对话。
       *
       * 舞台收起时 `[data-lx-stage]` 就不在了，所以探针点记在 `pageScope.point`：
       * 否则「藏起来 → 测不到位置 → 又显示」会每 800ms 闪一次。
       */
      function stageProbePoint() {
        const stage =
          typeof document !== 'undefined' && typeof document.querySelector === 'function'
            ? document.querySelector('[data-lx-stage]')
            : null
        if (stage && typeof stage.getBoundingClientRect === 'function') {
          const box = stage.getBoundingClientRect()
          if (box.width > 1 && box.height > 1) {
            pageScope.point = {
              x: Math.round(box.left + box.width / 2),
              y: Math.round(box.top + box.height / 2),
            }
          }
        }
        return pageScope.point
      }

      function foreignAt(point) {
        if (
          typeof document === 'undefined' ||
          typeof document.elementsFromPoint !== 'function' ||
          !point
        ) {
          return null
        }
        if (
          point.x < 0 ||
          point.y < 0 ||
          point.x >= window.innerWidth ||
          point.y >= window.innerHeight
        ) {
          return null
        }
        const stack = document.elementsFromPoint(point.x, point.y)
        for (const el of stack) {
          if (!el || el === document.documentElement || el === document.body) return null
          // 我们自己的两块（歌词舞台 + 提示卡）本来就压在这个点上，跳过继续看下一层。
          if (typeof el.closest === 'function' && el.closest('[data-lx-stage], [data-lx-toast]')) continue
          return el
        }
        return null
      }

      function foreignPanelAt(point) {
        let node = foreignAt(point)
        if (!node || typeof getComputedStyle !== 'function') return null
        // 往上看几层：抽屉真正的那块「浮层」往往不是最上面那颗文字/图标，
        // 而是它 1~3 层之外的定位容器。命中任何一层就算面板。
        for (let depth = 0; node && depth < 4; depth += 1) {
          const hit = panelish(node)
          if (hit) return hit
          node = node.parentElement
          if (!node || node === document.body || node === document.documentElement) break
        }
        return null
      }

      function panelish(el) {
        if (!el || typeof getComputedStyle !== 'function') return null
        const css = getComputedStyle(el)
        const z = Number.parseInt(css.zIndex, 10)
        const floating =
          css.position === 'fixed' || css.position === 'absolute' || css.position === 'sticky'
        // 浮层（定位过 + 自己的一份叠层）算面板。阈值定在「比正常内容高一层」就够：
        // 曾经用 100，实测右侧抽屉普遍只有十几甚至个位数，直接漏判。
        if (floating && Number.isFinite(z) && z >= PANEL_Z) return el
        // 第三种写法：不给 z-index，只 position: relative + 整块挪到输入框右边。
        // 这时叠层帮不上忙，看几何 —— 它整个身子都在输入框右边界之外，且是面板尺寸。
        if (css.position === 'static' || typeof el.getBoundingClientRect !== 'function') return null
        // 座位矩形用采样时缓存下来的那一份：这里每判定一个祖先都要用，
        // 而 querySelector + getBoundingClientRect 每层各来一次是要花掉一帧的。
        let box = pageScope.seatBox
        if (!box && typeof document.querySelector === 'function') {
          const seat = document.querySelector('[data-lx-input]')
          if (seat && typeof seat.getBoundingClientRect === 'function') box = seat.getBoundingClientRect()
        }
        if (!box) return null
        const rect = el.getBoundingClientRect()
        if (rect.width > 120 && rect.height > 120 && rect.left >= Math.round(box.right) - 8) {
          return el
        }
        return null
      }

      /**
       * 歌词底下那个元素，和输入框按钮还属不属于「同一栏」？
       *
       * 右侧抽屉有两种实现：浮层（被 `foreignPanelAt` 抓住）和**占位的分栏**
       * （`position: static`，只是把对话列挤窄）。后者压不住输入框、也不算浮层，
       * 但它确实把歌词那一块占了 —— 判据改用结构：从歌词底下那个元素往上走，
       * 两跳之内如果碰不到「包含输入框按钮」的祖先，说明它跟对话栏不是同一支
       * （中间已经跨到 frame/右上那一列去了）。
       *
       * 正常对话页实测：歌词底下第一个就是 `xz4KEq_scroll`（对话滚动容器，直接
       * 包含按钮），第 0 跳命中，不会误伤。
       */
      function sharesSeatColumn(under, seat, maxDepth = 2) {
        if (!under || !seat) return true
        let node = under
        let depth = 0
        while (node && depth <= maxDepth) {
          if (node === seat || (typeof node.contains === 'function' && node.contains(seat))) return true
          node = node.parentElement
          depth += 1
        }
        return false
      }

      function probeOnChat(full = true) {
        // `narrowed` 一路带出去：采样器靠它做**边沿触发**（只有翻转那一拍才动作），
        // 而不是每拍都重新决定一次要不要显示。
        let narrowed = false
        if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return { onChat: true, hit: null, narrowed }
        const seat = document.querySelector('[data-lx-input]')
        if (!seat) {
          // 座位还没挂上（刚启动、切换会话的瞬间）就先别判定「离开了对话页」，
          // 否则每次加载歌词都会闪一下。连续 5 次采样（现在 1 秒一拍，约 5 秒）都找不到，才算真不在。
          pageScope.misses += 1
          const certain = pageScope.seenSeat || pageScope.misses >= 5
          return { onChat: certain ? false : true, hit: null, narrowed }
        }
        pageScope.seenSeat = true
        pageScope.misses = 0
        if (typeof document.elementFromPoint !== 'function') return { onChat: true, hit: null, narrowed }
        const box = seat.getBoundingClientRect()
        pageScope.seatBox = box
        if (!(box.width > 1 && box.height > 1)) return { onChat: false, hit: null, narrowed }
        const x = Math.round(box.left + box.width / 2)
        const y = Math.round(box.top + box.height / 2)
        // 滚出视口、页面在后台（elementFromPoint 返回 null）时不拿它当证据，保持现状。
        if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return { onChat: true, hit: null, narrowed }
        // 几何判据：右侧面板（抽屉/分栏）把对话列挤窄时，输入框那一条的右边界会
        // 明显左移。浮层式的抽屉不改几何，那一条交给 foreignPanelAt；两条并联。
        const viewport = window.innerWidth
        if (pageScope.viewport !== viewport) {
          pageScope.viewport = viewport
          pageScope.baseRight = 0
          pageScope.narrowTicks = 0
        }
        const right = Math.round(box.right)
        pageScope.lastRight = right
        // 基线只升不降：记的是「这一栏最宽时右边界在哪」。去掉「小于视口-8」那道筛
        // 是因为输入框常常顶到视口右边，一旦被筛掉基线就永远停在 0，第一次挤窄反而
        // 把窄的那个宽度记成基线，于是永远判不出挤窄。
        if (right > pageScope.baseRight) pageScope.baseRight = right
        narrowed = pageScope.baseRight - right > 40
        pageScope.narrowTicks = narrowed ? pageScope.narrowTicks + 1 : 0
        // 一发现被挤窄就收起，不等第二次采样：宽度变化不会像下拉框那样瞬时抖动，
        // 而「慢半拍」在观感上是「歌词又飘在面板上」，比偶尔闪一下更糟。
        if (narrowed) return { onChat: false, hit: null, narrowed }
        // 廉价模式：拖动分栏时每帧都会进来一次，这里只量了一条边就收工。
        // 命中测试、祖先遍历、getComputedStyle 全部留到「手松开」后的完整采样，
        // 否则一帧里十几次同步布局读会把主线程拖住，用户看到的就是「一卡一卡」。
        if (!full) return { onChat: pageScope.onChat, hit: null, narrowed }
        const hit = document.elementFromPoint(x, y)
        if (!hit) return { onChat: true, hit: null, narrowed }
        if (seat === hit || seat.contains(hit)) {
          const point = stageProbePoint()
          const panel = foreignPanelAt(point)
          if (panel) return { onChat: false, hit: panel, narrowed }
          // 注意：结构判据（歌词底下那颗元素跟按钮同不同栏）现在**只记录不动作**。
          // 它在真实页面里误伤过（歌词直接不见），阈值还没校准，等实测数据说话。
          return { onChat: true, hit, narrowed }
        }
        if (typeof hit.closest === 'function' && hit.closest('dialog, [role="dialog"], [popover]')) {
          return { onChat: true, hit, narrowed }
        }
        return { onChat: false, hit, narrowed }
      }

      function publishOnChat(onChat, hit) {
        pageScope.onChat = onChat
        // 只在状态变化时报，而且限条数：这是诊断，不是日志洪水。
        if (pageScope.reports < 8) {
          pageScope.reports += 1
          report({
            stage: 'page-scope',
            onChat,
            hit: hit
              ? { tag: hit.tagName.toLowerCase(), cls: String(hit.getAttribute('class') || '').slice(0, 40) }
              : null,
          })
        }
        for (const listener of pageScope.listeners) {
          try {
            listener(onChat)
          } catch {
            /* 一个订阅者出错不影响其他订阅者 */
          }
        }
      }

      function ensurePageScopeWatch() {
        // 没有 document 的环境（离线自测）什么都不做，免得留下定时器把进程吊住。
        if (typeof document === 'undefined' || pageScope.timer !== null) return
        // 挤窄是布局事件，轮询最多晚半拍。直接在输入框上挂 ResizeObserver：面板一拉开、
        // 输入框宽度一变就立刻重采样，观感上等于「同时」收起。
        const sample = (full = true) => {
          const next = probeOnChat(full)
          const flipped = next.narrowed !== pageScope.narrowed
          pageScope.narrowed = next.narrowed
          // 边沿触发：每拍只负责「量」，只有挤窄状态**翻转**的那一拍才「动作」。
          // 撞上翻转就直接升级成完整采样 —— 翻转不常发生，值这一次；平时拖动过程中
          // 就只量一条右边界，一个 DOM 属性都不改。
          if (flipped && !full) {
            sample(true)
            return
          }
          if (flipped && pageScope.flipReports < 8) {
            pageScope.flipReports += 1
            report({
              stage: 'narrow-flip',
              narrowed: next.narrowed,
              right: pageScope.lastRight,
              baseRight: pageScope.baseRight,
              vp: window.innerWidth,
            })
          }
          if (pageScope.last === next.onChat) return
          pageScope.last = next.onChat
          publishOnChat(next.onChat, next.hit)
        }
        // 交互期间的开环测量：点一下、拖一下之后的几百毫秒里，每帧量一次右边界。
        // 不指望 ResizeObserver 报不报 —— 面板出现的瞬间就藏，这是最重要的观感，
        // 而每帧只读一个 rect，和之前的「每帧做命中测试」不是一个量级。
        let burstUntil = 0
        let burstRaf = null
        const burst = (ms = 400) => {
          if (typeof requestAnimationFrame !== 'function') return
          burstUntil = Date.now() + ms
          if (burstRaf !== null) return
          const tick = () => {
            burstRaf = null
            sample(false)
            if (Date.now() < burstUntil) burstRaf = requestAnimationFrame(tick)
          }
          burstRaf = requestAnimationFrame(tick)
        }
        // 拖分栏时 ResizeObserver 每帧都来一次。一次完整采样要量几何 + 做命中测试 +
        // 往上遍历祖先读 computed style，一帧里同步来十几次同步布局读会把主线程拖住
        // —— 用户看到的就是「挤窄时一卡一卡」。所以分两档：拖动期间一帧最多一次
        // 「只量几何」的廉价采样；手松开 120ms 再补一次完整采样。
        let cheapQueued = false
        let settleTimer = null
        const scheduleCheap = () => {
          if (cheapQueued) return
          cheapQueued = true
          const run = () => {
            cheapQueued = false
            sample(false)
          }
          if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
          else setTimeout(run, 16)
        }
        // 完整采样用「尾随防抖」：拖动期间上游一直有事件，计时器就一直被重置，
        // 于是只会在手真正松开之后 120ms 跑一次 —— 拖动时既不卡，松手后又立刻定案。
        const scheduleSettle = (delay = 120) => {
          if (settleTimer !== null) clearTimeout(settleTimer)
          settleTimer = setTimeout(() => {
            settleTimer = null
            sample(true)
          }, delay)
        }
        // 挤窄是布局事件，轮询最多晚半拍。挂 ResizeObserver 让它在布局阶段就重采样。
        //
        // 但只盯按钮本身没用：分栏把对话列挤窄时，按钮**尺寸一点没变**，只是整体挪了
        // 个位置，而 ResizeObserver 只报尺寸变化 —— 于是挤窄只能等 400ms 轮询发现，
        // 观感就是「收得太慢」。真正随列宽变化的是 composer 的外框，所以把按钮往上
        // 六层一起盯：哪一层变了（列宽变化一定落在某一层的外框上）都能立刻重采样。
        const watchSeat = () => {
          if (typeof ResizeObserver !== 'function') return
          const seat = document.querySelector('[data-lx-input]')
          if (!seat || seat === pageScope.seatNode) return
          if (pageScope.seatObserver !== null) pageScope.seatObserver.disconnect()
          const observer = new ResizeObserver(() => {
            scheduleCheap()
            scheduleSettle()
          })
          const watched = []
          let node = seat
          for (let depth = 0; node && depth < 6; depth += 1) {
            observer.observe(node)
            watched.push(node)
            node = node.parentElement
          }
          pageScope.seatObserver = observer
          pageScope.seatNode = seat
          pageScope.seatWatched = watched
        }
        watchSeat()
        sample()
        // 抽屉/面板大多是「点一下才出来」的。点完这一下补一次完整采样（120ms 后），
        // 比等 400ms 轮询快得多；代价只是每次点击多跑一次探针。
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
          // 交互期间的每帧测量：点一下、拖一下之后的几百毫秒里，burst() 自己按帧量右边界，
          // 不依赖 ResizeObserver 到底报不报 —— 面板出现的瞬间就藏，这是最要紧的观感。
          // 每帧只读一个 rect，和之前「每帧做命中测试」不是一个量级。
          window.addEventListener('pointerdown', () => { burst(500); scheduleSettle() }, true)
          window.addEventListener('pointermove', (event) => { if (event.buttons !== 0) burst(200) }, true)
          window.addEventListener('pointerup', () => { burst(500); scheduleSettle() }, true)
          window.addEventListener('keydown', () => burst(300), true)
          window.addEventListener('resize', () => { burst(300); scheduleCheap() })
        }
        pageScope.timer = setInterval(() => {
          // 座位可能被换掉（切会话、换窗口），每次采样都顺手重挂一次观察者。
          watchSeat()
          sample()
        }, PAGE_SCOPE_MS)
        // 诊断：每 3 秒拍一张「页面归属快照」。用户说「还看得到」时，光看状态变化
        // 证明不了当时压着歌词的是谁 —— 把那一瞬间的命中栈和舞台挂没挂上拍下来，
        // 才能判断是「判定没生效」还是「这个页面其实没盖住按钮中心」。
        let snapshots = 0
        let ticks = 0
        const snapshot = () => {
          if (snapshots >= 120 || typeof document.elementFromPoint !== 'function') return
          const seat = document.querySelector('[data-lx-input]')
          if (!seat) return
          const box = seat.getBoundingClientRect()
          if (!(box.width > 1 && box.height > 1)) return
          const x = Math.round(box.left + box.width / 2)
          const y = Math.round(box.top + box.height / 2)
          if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return
          const describe = (els) =>
            els.slice(0, 5).map((el) => {
              const css = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null
              return {
                tag: el.tagName.toLowerCase(),
                cls: String(el.getAttribute('class') || '').slice(0, 44),
                z: css ? css.zIndex : '',
                pos: css ? css.position : '',
              }
            })
          const stack =
            typeof document.elementsFromPoint === 'function' ? describe(document.elementsFromPoint(x, y)) : []
          // 歌词自己那一块底下压着谁 —— 抽屉/分栏判据看的就是这个点。
          const point = stageProbePoint()
          const stageStack =
            point && typeof document.elementsFromPoint === 'function'
              ? describe(document.elementsFromPoint(point.x, point.y))
              : []
          const panel = foreignPanelAt(point)
          const under = foreignAt(point)
          const sameColumn = !under || sharesSeatColumn(under, seat)
          // 校准用的祖先链：歌词底下那颗元素往上 4 层。有了它才能看出「抽屉」和
          // 「对话栏」在结构上从哪一层分家，而不是靠 z-index 瞎猜。
          const underChain = []
          let walk = under
          let guard = 0
          while (walk && guard < 4) {
            underChain.push({
              tag: walk.tagName ? walk.tagName.toLowerCase() : '?',
              cls: String(walk.getAttribute ? walk.getAttribute('class') || '' : '').slice(0, 40),
            })
            walk = walk.parentElement
            guard += 1
          }
          ticks += 1
          const narrowed = pageScope.baseRight > 0 && pageScope.baseRight - Math.round(box.right) > 40
          // 只在「值得看」的时候报：抓到了面板、或者歌词那一块已经不跟按钮同一栏、
          // 或者对话列被挤窄了，外加每 10 拍一张心跳（证明探针活着）。
          if (!panel && sameColumn && !narrowed && ticks % 10 !== 0) return
          if (snapshots >= 120) return
          snapshots += 1
          report({
            stage: 'page-snapshot',
            n: snapshots,
            onChat: pageScope.onChat,
            mounted: document.querySelector('[data-lx-stage]') !== null,
            sameColumn,
            narrowed,
            seatRight: Math.round(box.right),
            baseRight: pageScope.baseRight,
            vp: window.innerWidth,
            underChain,
            panel: panel
              ? {
                tag: panel.tagName.toLowerCase(),
                cls: String(panel.getAttribute('class') || '').slice(0, 44),
                z: typeof getComputedStyle === 'function' ? getComputedStyle(panel).zIndex : '',
              }
              : null,
            stack,
            stageStack,
          })
        }
        pageScope.snap = setInterval(snapshot, 3000)
        snapshot()
      }

      function usePageScope() {
        const [onChat, setOnChat] = react.useState(pageScope.onChat)
        react.useEffect(() => {
          const listener = (next) => setOnChat(next)
          pageScope.listeners.add(listener)
          setOnChat(pageScope.onChat)
          return () => pageScope.listeners.delete(listener)
        }, [])
        return onChat
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

      /**
       * 滚动看词。
       *
       * 舞台整体是 pointerEvents: none（不然会吃掉底下界面的点击），所以这里不能靠
       * native 滚动：滚轮事件在 window 上按坐标截下来，落在歌词框里才 preventDefault，
       * 把 deltaY 交给滚动容器。停手 2 秒滑回正在唱的那句 —— 用户要的是「翻一下看看
       * 后面唱什么」，不是把歌词变回一个需要自己维护滚动位置的列表。
       */
      function useLyricBrowse(localIndex) {
        const listRef = react.useRef(null)
        const browseTimer = react.useRef(null)
        const browsing = react.useRef(false)
        const centerOnCurrent = react.useCallback((smooth) => {
          const list = listRef.current
          if (!list || typeof list.querySelector !== 'function') return
          const row = list.querySelector('[data-lx-current]')
          if (!row) return
          const target = Math.max(0, Math.round(row.offsetTop - (list.clientHeight - row.offsetHeight) / 2))
          if (smooth && typeof list.scrollTo === 'function') list.scrollTo({ top: target, behavior: 'smooth' })
          else list.scrollTop = target
        }, [])
        // 换行时把当前句拉回视口中间 —— 但用户正在翻的时候别抢他的位置。
        react.useEffect(() => {
          if (browsing.current) return
          centerOnCurrent(false)
        }, [localIndex, centerOnCurrent])
        react.useEffect(() => {
          if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined
          const onWheel = (event) => {
            const list = listRef.current
            if (!list || typeof list.getBoundingClientRect !== 'function') return
            const box = list.getBoundingClientRect()
            if (box.width < 1 || box.height < 1) return
            if (event.clientX < box.left || event.clientX > box.right) return
            if (event.clientY < box.top || event.clientY > box.bottom) return
            event.preventDefault()
            browsing.current = true
            list.scrollTop += event.deltaY
            if (browseTimer.current !== null) clearTimeout(browseTimer.current)
            browseTimer.current = setTimeout(() => {
              browseTimer.current = null
              browsing.current = false
              centerOnCurrent(true)
            }, BROWSE_IDLE_MS)
          }
          window.addEventListener('wheel', onWheel, { passive: false, capture: true })
          return () => {
            window.removeEventListener('wheel', onWheel, true)
            if (browseTimer.current !== null) {
              clearTimeout(browseTimer.current)
              browseTimer.current = null
            }
          }
        }, [centerOnCurrent])
        return listRef
      }

      function LxMusicStage(props) {
        const t = props && typeof props.t === 'function' ? props.t : fallbackT
        const state = usePrefs()
        const frame = usePlayerFrame()
        const narrow = useNarrow()
        // 只在对话页露脸：切到设置页/插件页/别人的面板时收起来（见 usePageScope）。
        const onChat = usePageScope()
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

        // 持续盯「胶囊是不是又被人盖住了」：每秒在胶囊中心做一次命中测试，
        // 一旦命中的不是自己就报一条 occlusion（最多 5 条）。顶层到底有没有压过
        // 别人的面板，光看 :popover-open 证明不了 —— 只有命中测试说了算。
        const occlusions = react.useRef(0)
        react.useEffect(() => {
          if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return undefined
          // 不在对话页时舞台本来就收起来了，这时的「被盖住」是我们自己造成的，
          // 不能算数 —— 否则设置页每开一次就消耗一条诊断配额。
          if (!onChat) return undefined
          const timer = setInterval(() => {
            if (occlusions.current >= 5) return
            const stage = document.querySelector('[data-lx-stage]')
            const target = controlsRef.current || stage
            if (!stage || !target) return
            const box = target.getBoundingClientRect()
            if (box.width < 2 || box.height < 2) return
            const x = Math.round(box.left + box.width / 2)
            const y = Math.round(box.top + box.height / 2)
            const hit = document.elementFromPoint(x, y)
            if (!hit || stage.contains(hit)) return
            occlusions.current += 1
            const stack =
              typeof document.elementsFromPoint === 'function' ? document.elementsFromPoint(x, y).slice(0, 5) : [hit]
            report({
              stage: 'occlusion',
              n: occlusions.current,
              open: typeof stage.matches === 'function' ? stage.matches(':popover-open') : null,
              dialogs: typeof document.querySelectorAll === 'function' ? document.querySelectorAll('dialog[open]').length : null,
              pops: typeof document.querySelectorAll === 'function' ? document.querySelectorAll(':popover-open').length : null,
              stack: stack.map((el) => {
                const css = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null
                const dialog = typeof el.closest === 'function' ? el.closest('dialog') : null
                return {
                  tag: el.tagName.toLowerCase(),
                  cls: String(el.getAttribute('class') || '').slice(0, 40),
                  z: css ? css.zIndex : '',
                  pos: css ? css.position : '',
                  dlg: dialog ? (typeof dialog.matches === 'function' && dialog.matches(':modal') ? 'modal' : 'dialog') : '',
                }
              }),
            })
          }, 1000)
          return () => clearInterval(timer)
        }, [onChat])

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
        // 滚轮翻歌词：停手 2 秒自己滑回正在唱的那句（见 useLyricBrowse）。
        const lyricListRef = useLyricBrowse(localIndex)

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
          const nodes = typeof block.querySelectorAll === 'function' ? block.querySelectorAll('[data-lx-row]') : []
          for (const node of nodes) {
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

        if (!onChat || narrow || frame === null || !frame.play) return null

        const showLyrics = state.embedded && !state.collapsed && frame.lyric !== null
        // 有整首时间轴就按「当前行 ± BROWSE_SPAN」铺一窗（滚得到上下文），
        // 没有就退回服务器给的那 5 句。
        const browsingTimeline = timeline !== null && localIndex >= 0
        const lyricSpan = browsingTimeline ? BROWSE_SPAN : 2
        const slots = browsingTimeline
          ? slotsAtTimeline(timeline, localIndex, BROWSE_SPAN)
          : (frame.lyric && frame.lyric.slots) || []
        const firstIndex = localIndex >= 0 ? localIndex - lyricSpan : 0
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
                    jsx(
                      'div',
                      {
                        ref: lyricListRef,
                        style: lyricListStyle,
                        'data-lx-lyric-list': 'list',
                        children: slots.map((slot, index) =>
                          jsx(
                            'div',
                            {
                              style: slotStyle(slot),
                              'data-lx-current': slot.role === 'current' ? 'current' : undefined,
                              'data-lx-row': 'row',
                              children: slot.text || '\u00a0',
                            },
                            // key 里必须带文本：以前只用 slot-序号 当 key，换行时 React 复用
                            // 同一个节点、只把文本换掉，节点上没有任何属性变化 —— 于是
                            // opacity/transform 的 transition 一次也触发不了，看到的就是硬切。
                            // 带上文本，换行时整行重建，入场动画才有机会播。
                            'slot:' + (firstIndex + index) + ':' + slot.text,
                          ),
                        ),
                      },
                      'list',
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
          // 给 usePageScope 当锚点：这个按钮只在对话页存在，据此判断「还在不在对话页」。
          'data-lx-input': 'button',
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
        // 提示卡同样只在对话页显示：它也是 frame 级的，切页后留着会挡别人的界面。
        const onChat = usePageScope()

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

        if (!onChat || !toast) return null

        return jsx('div', {
          style: toastOverlayStyle,
          ref: setOverlayNode,
          'data-lx-toast': 'toast',
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

          // 页面归属的采样器：舞台和提示卡都靠它决定露不露脸，所以在这里起一次就够。
          ensurePageScopeWatch()

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
