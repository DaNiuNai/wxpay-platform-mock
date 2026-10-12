import {
  constants,
  createHash,
  publicEncrypt,
  randomBytes,
  sign,
} from 'node:crypto'
import { readFileSync } from 'node:fs'
import { ApiError, fail, obj, str } from './core.js'
import type { Runtime } from './core.js'
import { contracts } from './contracts.js'
import type { ContractField, Data } from './types.js'

const proxyPaths = new Set(['/mock/console/request', '/mock/console/upload'])
const mediaPaths = new Set([
  '/v3/merchant/media/upload',
  '/v3/ecommerce/account/cancel-applications/media',
])
const staticAssets = new Map([
  ['app.js', 'text/javascript; charset=utf-8'],
  ['styles.css', 'text/css; charset=utf-8'],
  ['templates.js', 'text/javascript; charset=utf-8'],
  ['helpers.js', 'text/javascript; charset=utf-8'],
])
const controlRoutes = [
  { methods: ['GET', 'PATCH'], pattern: /^\/mock\/config$/ },
  {
    methods: ['GET'],
    pattern: /^\/mock\/(state|apis|credentials|notifications)$/,
  },
  { methods: ['POST'], pattern: /^\/mock\/(accounts|faults|reset)$/ },
  { methods: ['POST'], pattern: /^\/mock\/actions\/[A-Za-z0-9_-]+$/ },
  { methods: ['POST'], pattern: /^\/mock\/notifications\/[^/]+\/retry$/ },
  {
    methods: ['GET', 'POST'],
    pattern: /^\/__mock\/(sign|verify|confirm-cancel)\/[^/]+$/,
  },
]

interface ConsoleResult {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  body_encoding: 'text' | 'base64'
  json?: unknown
  duration_ms: number
  request: {
    method: string
    path: string
    headers: Record<string, string>
    body: unknown
  }
}

/** 静态文件在开发和构建目录下使用相同的相对位置。 */
export function consoleHtml(): string {
  return readFileSync(new URL('./web/index.html', import.meta.url), 'utf8')
}

export function registerConsole(runtime: Runtime): void {
  for (const path of ['/', '/console'])
    runtime.app.get(path, (c) => {
      c.header('Cache-Control', 'no-store')
      c.header('X-Content-Type-Options', 'nosniff')
      return c.html(consoleHtml())
    })
  runtime.app.get('/console-assets/:asset', (c) => {
    const asset = c.req.param('asset')
    const type = staticAssets.get(asset)
    if (!type) fail(404, 'RESOURCE_NOT_EXISTS', '控制台资源不存在')
    let contents: string
    try {
      contents = readFileSync(
        new URL(`./web/${asset}`, import.meta.url),
        'utf8',
      )
    } catch {
      fail(404, 'RESOURCE_NOT_EXISTS', '控制台资源不存在')
    }
    return new Response(contents, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  })
}

/** 必须在 Runtime.exclusive 外调用代理，否则内部业务请求会等待自身持有的锁。 */
export function isConsoleProxy(request: Request): boolean {
  return (
    request.method === 'POST' && proxyPaths.has(new URL(request.url).pathname)
  )
}

function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('Origin')
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get('Sec-Fetch-Site') === 'cross-site'
  ) {
    fail(400, 'PARAM_ERROR', '控制台请求必须来自当前服务的同源页面')
  }
}

function booleanOption(data: Data, name: string): boolean {
  if (data[name] === undefined) return true
  if (typeof data[name] !== 'boolean')
    fail(400, 'PARAM_ERROR', `${name} 必须为布尔值`)
  return data[name] as boolean
}

function targetUrl(request: Request, method: string, path: string): URL {
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    /[\\#\r\n\0]/.test(path)
  )
    fail(400, 'PARAM_ERROR', 'path 必须为当前服务的相对接口路径')
  let target: URL
  try {
    target = new URL(path, request.url)
  } catch {
    fail(400, 'PARAM_ERROR', 'path 无效')
  }
  const allowed =
    target.pathname.startsWith('/v3/') ||
    controlRoutes.some(
      (route) =>
        route.methods.includes(method) && route.pattern.test(target.pathname),
    )
  if (target.origin !== new URL(request.url).origin || !allowed)
    fail(400, 'PARAM_ERROR', '控制台仅可调用官方接口和已知模拟控制接口')
  return target
}

function contractMatches(pathname: string, pattern: string): boolean {
  const actual = pathname.split('/')
  const expected = pattern.split('/')
  return (
    actual.length === expected.length &&
    expected.every((part, index) =>
      /^\{[^}]+\}$/.test(part)
        ? Boolean(actual[index])
        : part === actual[index],
    )
  )
}

function encryptFields(
  runtime: Runtime,
  body: unknown,
  fields: ContractField[],
): unknown {
  const result: unknown = structuredClone(body)
  for (const field of fields.filter((item) => item.sensitive)) {
    const parts = field.name.split('.')
    let parents: unknown[] = [result]
    for (const part of parts.slice(0, -1))
      parents = parents.flatMap((parent) => {
        if (!parent || typeof parent !== 'object' || Array.isArray(parent))
          return []
        const child = (parent as Data)[part]
        return Array.isArray(child)
          ? child
          : child === undefined || child === null
            ? []
            : [child]
      })
    for (const parent of parents) {
      if (!parent || typeof parent !== 'object' || Array.isArray(parent))
        continue
      const key = parts.at(-1)!
      const value = (parent as Data)[key]
      if (typeof value !== 'string' || !value) continue
      // 只保留能被当前平台密钥成功解密的密文，避免把普通 Base64 当作密文。
      try {
        runtime.crypto.decryptSensitive(value)
        continue
      } catch {
        /* 按明文加密 */
      }
      try {
        // 本地重发使用同一密文，兼容业务层按原始参数判断的幂等逻辑。
        const cacheKey = createHash('sha256')
          .update(runtime.crypto.platformSerial + '\n' + value)
          .digest('hex')
        let ciphertext = runtime.store.get<{ ciphertext: string }>(
          'console_ciphertexts',
          cacheKey,
        )?.ciphertext
        if (!ciphertext) {
          ciphertext = publicEncrypt(
            {
              key: runtime.crypto.platformPublicKey,
              padding: constants.RSA_PKCS1_OAEP_PADDING,
              oaepHash: 'sha1',
            },
            Buffer.from(value, 'utf8'),
          ).toString('base64')
          runtime.store.set('console_ciphertexts', cacheKey, { ciphertext })
        }
        ;(parent as Data)[key] = ciphertext
      } catch {
        fail(400, 'PARAM_ERROR', `敏感字段 ${field.name} 超过 RSA 可加密长度`)
      }
    }
  }
  const entries = Object.keys(
    runtime.store.snapshot().console_ciphertexts ?? {},
  )
  for (const key of entries.slice(0, Math.max(0, entries.length - 1000)))
    runtime.store.delete('console_ciphertexts', key)
  runtime.store.save()
  return result
}

function signedHeaders(
  runtime: Runtime,
  method: string,
  target: URL,
  body: string,
  headers: Headers,
): void {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = randomBytes(16).toString('hex')
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(
      `${method}\n${target.pathname}${target.search}\n${timestamp}\n${nonce}\n${body}\n`,
    ),
    runtime.crypto.merchantPrivateKey,
  ).toString('base64')
  headers.set(
    'Authorization',
    `WECHATPAY2-SHA256-RSA2048 mchid="${runtime.config.spMchid}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${runtime.crypto.merchantSerial}",signature="${signature}"`,
  )
  headers.set('Wechatpay-Serial', runtime.crypto.platformSerial)
}

function inputHeaders(value: unknown): Headers {
  if (value === undefined) return new Headers()
  const data = obj(value)
  const headers = new Headers()
  for (const [name, item] of Object.entries(data)) {
    if (typeof item !== 'string')
      fail(400, 'PARAM_ERROR', 'headers 的值必须为字符串')
    if (
      /^(host|connection|content-length|transfer-encoding|upgrade|proxy-authorization|proxy-connection)$/i.test(
        name,
      )
    )
      fail(400, 'PARAM_ERROR', `不允许设置请求头 ${name}`)
    try {
      headers.set(name, item)
    } catch {
      fail(400, 'PARAM_ERROR', '请求头名称或值无效')
    }
  }
  return headers
}

async function execute(
  runtime: Runtime,
  target: URL,
  method: string,
  headers: Headers,
  body: BodyInit | undefined,
  preview: unknown,
): Promise<ConsoleResult> {
  const started = performance.now()
  const request = new Request(target, { method, headers, body })
  // 仅进程内分发；不会 fetch 客户端提供的地址或绕过业务验签、故障、回滚。
  const response = await runtime.app.fetch(request)
  const type = response.headers.get('Content-Type') ?? ''
  const binary =
    response.headers.has('Content-Disposition') ||
    (!/^(text\/|application\/(json|[^;]+\+json))/i.test(type) && type !== '')
  const bytes = Buffer.from(await response.arrayBuffer())
  const result: ConsoleResult = {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers),
    body: binary ? bytes.toString('base64') : bytes.toString('utf8'),
    body_encoding: binary ? 'base64' : 'text',
    duration_ms: Math.round((performance.now() - started) * 100) / 100,
    request: {
      method,
      path: target.pathname + target.search,
      headers: Object.fromEntries(request.headers),
      body: preview,
    },
  }
  if (!binary && result.body)
    try {
      result.json = JSON.parse(result.body) as unknown
    } catch {
      /* 文本和空响应不要求 JSON */
    }
  return result
}

async function jsonRequest(
  runtime: Runtime,
  request: Request,
): Promise<ConsoleResult> {
  let data: Data
  try {
    data = obj(await request.json())
  } catch {
    fail(400, 'PARAM_ERROR', '控制台请求体必须为 JSON 对象')
  }
  const method = str(data, 'method').toUpperCase()
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method))
    fail(400, 'PARAM_ERROR', 'HTTP method 不支持')
  const target = targetUrl(request, method, str(data, 'path'))
  const signed = booleanOption(data, 'signed')
  const encryptSensitive = booleanOption(data, 'encryptSensitive')
  if (
    (method === 'GET' || method === 'DELETE') &&
    data.body !== undefined &&
    data.body !== null
  )
    fail(400, 'PARAM_ERROR', `${method} 请求请使用路径中的 query，不传请求体`)
  const headers = inputHeaders(data.headers)
  if (mediaPaths.has(target.pathname) && method === 'POST') {
    const upload = obj(data.body)
    const file = obj(upload.file)
    const name = str(file, 'name')
    const type = str(file, 'type', false) || 'application/octet-stream'
    const content = str(file, 'content_base64')
    if (
      content.length > 10 * 1024 * 1024 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        content,
      )
    )
      fail(
        400,
        'PARAM_ERROR',
        'file.content_base64 必须为不超过 10 MiB 的标准 Base64',
      )
    const blob = new Blob([new Uint8Array(Buffer.from(content, 'base64'))], {
      type,
    })
    const meta = upload.meta === undefined ? {} : obj(upload.meta)
    return forwardUpload(
      runtime,
      target,
      new File([blob], name, { type }),
      signed,
      headers,
      meta,
    )
  }
  const contract = contracts.find(
    (item) =>
      item.method === method && contractMatches(target.pathname, item.path),
  )
  let body: unknown =
    data.body === undefined || data.body === null ? undefined : data.body
  if (encryptSensitive && contract)
    await runtime.exclusive(async () => {
      if (body !== undefined)
        body = encryptFields(runtime, body, contract.fields.body)
      if (contract.fields.query.some((field) => field.sensitive)) {
        const query = obj(
          encryptFields(
            runtime,
            Object.fromEntries(target.searchParams),
            contract.fields.query,
          ),
        )
        for (const field of contract.fields.query.filter(
          (item) => item.sensitive,
        )) {
          if (typeof query[field.name] === 'string')
            target.searchParams.set(field.name, query[field.name] as string)
        }
      }
    })
  const text = body === undefined ? '' : JSON.stringify(body)
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  if (signed && target.pathname.startsWith('/v3/'))
    signedHeaders(runtime, method, target, text, headers)
  return execute(
    runtime,
    target,
    method,
    headers,
    body === undefined ? undefined : text,
    body ?? null,
  )
}

async function uploadRequest(
  runtime: Runtime,
  request: Request,
): Promise<ConsoleResult> {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    fail(400, 'PARAM_ERROR', '请提交有效 multipart/form-data')
  }
  const file = form.get('file')
  if (!file || typeof file === 'string')
    fail(400, 'PARAM_ERROR', '请选择 file 文件')
  const path = form.get('path') ?? '/v3/merchant/media/upload'
  if (typeof path !== 'string' || !mediaPaths.has(path))
    fail(400, 'PARAM_ERROR', '上传仅支持两个官方媒体接口')
  const signed = form.get('signed')
  if (signed !== null && signed !== 'true' && signed !== 'false')
    fail(400, 'PARAM_ERROR', 'signed 必须为 true 或 false')
  return forwardUpload(
    runtime,
    targetUrl(request, 'POST', path),
    file,
    signed !== 'false',
    new Headers(),
  )
}

async function forwardUpload(
  runtime: Runtime,
  target: URL,
  file: File,
  shouldSign: boolean,
  headers: Headers,
  additionalMeta: Data = {},
): Promise<ConsoleResult> {
  if (!file.size || file.size > 7.5 * 1024 * 1024)
    fail(400, 'PARAM_ERROR', '上传文件大小必须为 1 至 7864320 字节')
  const digest = createHash('sha256')
    .update(Buffer.from(await file.arrayBuffer()))
    .digest('hex')
  const meta =
    target.pathname === '/v3/merchant/media/upload'
      ? { ...additionalMeta, filename: file.name, sha256: digest }
      : { ...additionalMeta, file_name: file.name, file_digest: digest }
  const metaText = JSON.stringify(meta)
  if (shouldSign) signedHeaders(runtime, 'POST', target, metaText, headers)
  headers.delete('Content-Type')
  const forwarded = new FormData()
  forwarded.set('meta', metaText)
  forwarded.set('file', file, file.name)
  return execute(runtime, target, 'POST', headers, forwarded, {
    meta,
    file: { name: file.name, size: file.size, type: file.type },
  })
}

export async function handleConsoleProxy(
  runtime: Runtime,
  request: Request,
): Promise<Response> {
  try {
    assertSameOrigin(request)
    const result =
      new URL(request.url).pathname === '/mock/console/upload'
        ? await uploadRequest(runtime, request)
        : await jsonRequest(runtime, request)
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof ApiError)
      return Response.json(
        { code: error.code, message: error.message },
        { status: error.status },
      )
    return Response.json(
      { code: 'SYSTEM_ERROR', message: '控制台请求处理失败' },
      { status: 500 },
    )
  }
}
