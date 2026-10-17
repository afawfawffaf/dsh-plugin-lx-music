/**
 * dsh-plugin-lx-music — 打包卫生检查。
 *
 * 为什么会有这个测试：`package.json` 带 UTF-8 BOM 时，DSH 用 JSON.parse 读它
 * 会直接抛错，而 app-boot 对这一类失败是「静默跳过」（进 skippedBundles，不打印、
 * 不进客户端图）。表现是：插件装了、依赖在、链接也在，但宿主路由 404、按钮不出现，
 * 重启多少次都一样，日志里一个字都没有。所以这里把「文件开头必须是 {」钉死。
 *
 * 跑法：node test/no-bom.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const check = (label, condition, detail) => {
  if (condition) {
    console.log('  ok   ' + label)
    return
  }
  failures.push(label + (detail ? ' — ' + detail : ''))
  console.log('  FAIL ' + label + (detail ? ' — ' + detail : ''))
}

const hasBom = (path) => {
  const bytes = readFileSync(path)
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
}

const tracked = [
  'package.json',
  'cordis.patch.yml',
  'README.md',
  ...readdirSync(join(root, 'lib')).filter((name) => name.endsWith('.js') || name.endsWith('.ps1')).map((name) => join('lib', name)),
  ...readdirSync(join(root, 'test')).filter((name) => name.endsWith('.mjs')).map((name) => join('test', name)),
]

for (const relative of tracked) {
  check(`${relative} 没有 BOM`, hasBom(join(root, relative)) === false)
}

// 最关键的一条：DSH 会 JSON.parse 它，BOM 会让整个 bundle 被静默跳过。
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
check('package.json 能被 JSON.parse 读通', typeof manifest.name === 'string', typeof manifest.name)
check('声明了 dsh.bundle.patch', typeof manifest.dsh?.bundle?.patch === 'string', String(manifest.dsh?.bundle?.patch))
check('声明了 dsh.client', manifest.dsh?.client?.platform === 'web', String(manifest.dsh?.client?.platform))

console.log('')
if (failures.length > 0) {
  console.error(failures.length + ' 项没过：')
  for (const failure of failures) console.error('  · ' + failure)
  process.exit(1)
}
console.log('全部通过。')
