import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { format, resolveConfig } from 'prettier'
import type { Contract, ContractField } from '../src/types.js'

const root = join(import.meta.dirname, '..')
const prettierOptions = await resolveConfig(join(root, '.prettierrc.json'))
const documents = join(root, '平台收付通-电商交易解决方案')
const files = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : entry.name.endsWith('.md')
        ? [join(directory, entry.name)]
        : [],
  )
const contracts = new Map<string, Contract>()
for (const file of files(documents)) {
  const text = readFileSync(file, 'utf8').replace(/\\_/g, '_')
  const match = text.match(
    /^请求方式[^\n]*【(GET|POST|DELETE|PUT|PATCH)】[^\n]*?(\/v3\/[^\s`]+)/m,
  )
  if (!match) continue
  const method = match[1]!
  const path = match[2]!.replace(/\/$/, '')
  const key = `${method} ${path}`
  const fields: Contract['fields'] = { body: [], query: [], path: [] }
  const request =
    text.split(/## 请求参数/)[1]?.split(/## (?:应答|响应|错误)/)[0] ?? ''
  let location: keyof Contract['fields'] | undefined
  for (const line of request.split('\n')) {
    const section = line.match(/^### (Body|Query|Path) 参数/)
    if (section)
      location = section[1]!.toLowerCase() as keyof Contract['fields']
    else if (/^### Header/.test(line)) location = undefined
    const row = line.match(
      /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(true|false)\s*\|/,
    )
    if (location && row)
      fields[location].push({
        name: row[1]!.trim(),
        type: row[2]!.trim(),
        required: row[3] === 'true',
        ...(/加密|敏感/.test(line.slice(row[0].length))
          ? { sensitive: true }
          : {}),
      } satisfies ContractField)
  }
  const document = relative(root, file).replace(/\\/g, '/')
  const existing = contracts.get(key)
  if (existing) existing.documents.push(document)
  else
    contracts.set(key, {
      method,
      path,
      documents: [document],
      ...(/^\|\s*Wechatpay-Serial\s*\|[^|]*\|\s*true\s*\|/m.test(request)
        ? { requiresSerial: true }
        : {}),
      fields,
    })
}
contracts.set('GET /v3/billdownload/file', {
  method: 'GET',
  path: '/v3/billdownload/file',
  documents: [
    '平台收付通-电商交易解决方案/09-账单下载/02-API列表/04-下载账单.md',
    '平台收付通-电商交易解决方案/09-账单下载/02-API列表/06-下载单个子商户／二级商户资金账单.md',
  ],
  fields: {
    body: [],
    query: [{ name: 'token', type: 'string', required: true }],
    path: [],
  },
})
const sorted = [...contracts.values()].sort(
  (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
)
const contractsFile = join(root, 'src', 'contracts.ts')
writeFileSync(
  contractsFile,
  await format(
    `// 由 scripts/generate-contracts.ts 从本地官方文档生成，请勿手改。\nimport type { Contract } from './types.js'\nexport const contracts: Contract[] = ${JSON.stringify(sorted, null, 2)}\n`,
    { ...prettierOptions, filepath: contractsFile },
  ),
  'utf8',
)
mkdirSync(join(root, 'docs'), { recursive: true })
const coverageFile = join(root, 'docs', 'api-coverage.md')
writeFileSync(
  coverageFile,
  await format(
    `# 官方文档接口覆盖\n\n由本地文档自动提取 ${sorted.length} 个不同的服务端方法/路径。运行中的注册情况可通过 GET /mock/apis 核对；回归测试会检查每个契约都存在对应路由。\n\n小程序复用 JSAPI，两个下载说明复用账单下载路径。证书下载 GET /v3/certificates 为额外兼容接口。\n\n| 方法 | 路径 | 文档 |\n| --- | --- | --- |\n${sorted.map((item) => `| ${item.method} | \`${item.path}\` | ${item.documents.map((document) => `[${document.split('/').at(-1)}](../${document})`).join('、')} |`).join('\n')}\n`,
    { ...prettierOptions, filepath: coverageFile },
  ),
  'utf8',
)
console.log(`生成 ${sorted.length} 个不同的服务端方法/路径。`)
