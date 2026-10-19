import { randomUUID } from 'node:crypto'
import type { Hono } from 'hono'
import { CryptoService } from './crypto.js'
import { Store } from './store.js'
import { contracts } from './contracts.js'
import { validateFields } from './validation.js'
import type { Account, Data, MockConfig, RequestContext } from './types.js'
export type { Data, MockConfig, Order, RequestContext } from './types.js'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}
export function fail(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message)
}
export function obj(value: unknown): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(400, 'PARAM_ERROR', '参数必须是对象')
  return value as Data
}
export function arr(value: unknown): Data[] {
  if (!Array.isArray(value)) fail(400, 'PARAM_ERROR', '参数必须是数组')
  return value.map(obj)
}
export function str(data: Data, key: string, required = true): string {
  const value = data[key]
  if (!required && (value === undefined || value === null)) return ''
  if (typeof value !== 'string' || (required && !value.trim()))
    fail(400, 'PARAM_ERROR', `${key} 必须是非空字符串`)
  return value as string
}
export function int(data: Data, key: string, min = 0): number {
  const value = data[key]
  if (!Number.isSafeInteger(value) || (value as number) < min)
    fail(400, 'PARAM_ERROR', `${key} 必须是大于等于 ${min} 的安全整数`)
  return value as number
}

export const defaults: MockConfig = {
  host: '127.0.0.1',
  port: 18397,
  baseUrl: 'http://127.0.0.1:18397',
  spMchid: '1900000100',
  spAppid: 'wx_mock_platform',
  subMchid: '1900000101',
  strict: false,
  autoPay: false,
  autoComplete: true,
  apiV3Key: '0123456789abcdef0123456789abcdef',
  serviceNotifyUrl: '',
  callbackTimeoutMs: 5000,
  callbackRetryMs: [1000, 5000, 15000, 30000, 60000],
}

export interface Notification {
  id: string
  url: string
  body: Data
  attempts: number
  next_attempt_at: number
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
  last_status?: number
  last_error?: string
  created_at: string
}
interface Fault {
  id: string
  method: string
  path: string
  status: number
  code: string
  message: string
  remaining: number
  delay_ms: number
}
type Handler = (context: RequestContext) => unknown | Promise<unknown>

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Data)[key])}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

export class Runtime {
  readonly actions = new Map<
    string,
    (body: Data) => unknown | Promise<unknown>
  >()
  readonly routes: { method: string; path: string }[] = []
  private queue = Promise.resolve()
  private callbackRunning = false
  private callbacksStopped = false

  constructor(
    readonly app: Hono,
    readonly store: Store,
    readonly crypto: CryptoService,
    readonly config: MockConfig,
    readonly validate = true,
  ) {}

  async exclusive<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.queue
    let release!: () => void
    this.queue = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await work()
    } finally {
      release()
    }
  }

  id(prefix: string): string {
    const previous = this.store.get<number>('meta', 'id') ?? 0
    const next = Math.max(Date.now() * 100, previous + 1)
    this.store.set('meta', 'id', next)
    return `${prefix}${next}`
  }
  now(): string {
    return new Date(Date.now() + 8 * 3600000)
      .toISOString()
      .replace('Z', '+08:00')
  }

  account(mchid: string, accountType = 'BASIC'): Account {
    const key = `${mchid}:${accountType}`
    let account = this.store.get<Account>('accounts', key)
    if (!account) {
      account = { mchid, account_type: accountType, available: 0, frozen: 0 }
      this.store.set('accounts', key, account)
    }
    return account
  }

  idempotent<T>(scope: string, key: string, body: unknown, create: () => T): T {
    const storageKey = `${scope}:${key}`
    const hash = canonical(body)
    const existing = this.store.get<{ hash: string; result: T }>(
      'idempotency',
      storageKey,
    )
    if (existing) {
      if (existing.hash !== hash)
        fail(400, 'PARAM_ERROR', '相同业务单号的请求参数不一致')
      return structuredClone(existing.result)
    }
    const result = create()
    this.store.set('idempotency', storageKey, {
      hash,
      result: structuredClone(result),
    })
    return result
  }

  decryptSensitive(value: string): string {
    try {
      return this.crypto.decryptSensitive(value)
    } catch {
      if (this.config.strict)
        fail(400, 'PARAM_ERROR', '敏感字段 RSA-OAEP 解密失败')
      return value
    }
  }
  encryptSensitive(value: string): string {
    return this.crypto.encryptSensitive(value)
  }

  route(method: string, path: string, handler: Handler): void {
    this.routes.push({ method: method.toUpperCase(), path })
    this.app.on(method, path, async (c) => {
      const contentType = c.req.header('Content-Type') ?? ''
      let body: Data = {}
      let rawBody = ''
      if (
        method !== 'GET' &&
        method !== 'DELETE' &&
        !contentType.includes('multipart/form-data')
      ) {
        const text = await c.req.text()
        rawBody = text
        if (text) {
          try {
            body = obj(JSON.parse(text))
          } catch (error) {
            if (error instanceof ApiError) throw error
            fail(400, 'PARAM_ERROR', '请求体不是有效 JSON 对象')
          }
        }
      }
      const query = Object.fromEntries(new URL(c.req.url).searchParams)
      const params = c.req.param()
      const contractPath = path
        .replace(/:([A-Za-z0-9_]+)/g, '{$1}')
        .replace(/\/$/, '')
      const contract = contracts.find(
        (item) => item.method === method && item.path === contractPath,
      )
      if (
        this.config.strict &&
        contract?.requiresSerial &&
        c.req.header('Wechatpay-Serial') !== this.crypto.platformSerial
      )
        fail(
          400,
          'PARAM_ERROR',
          '此接口要求测试平台证书对应的 Wechatpay-Serial',
        )
      if (
        this.validate &&
        contract &&
        !contentType.includes('multipart/form-data')
      ) {
        validateFields(body, contract.fields.body, 'body', (value) =>
          this.decryptSensitive(value),
        )
        validateFields(query, contract.fields.query, 'query')
        validateFields(params, contract.fields.path, 'path')
      }
      const result = await handler({
        body,
        query,
        params,
        request: c.req.raw,
        rawBody,
      })
      return result instanceof Response
        ? result
        : result === undefined
          ? c.body(null, 204)
          : c.json(result)
    })
  }

  notify(
    url: string | undefined,
    eventType: string,
    resource: unknown,
    originalType = 'transaction',
  ): void {
    if (!url) return
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      fail(400, 'PARAM_ERROR', '回调 URL 无效')
    }
    if (!['http:', 'https:'].includes(parsed.protocol))
      fail(400, 'PARAM_ERROR', '回调 URL 仅支持 http/https')
    const id = randomUUID()
    const createdAt = this.now()
    const notification: Notification = {
      id,
      url,
      created_at: createdAt,
      attempts: 0,
      next_attempt_at: Date.now(),
      status: 'PENDING',
      body: {
        id,
        create_time: createdAt,
        event_type: eventType,
        resource_type: 'encrypt-resource',
        summary: eventType,
        resource: this.crypto.encryptResource(resource, originalType),
      },
    }
    this.store.set('notifications', id, notification)
  }

  async flushCallbacks(): Promise<Data> {
    if (this.callbacksStopped) return { delivered: 0, stopped: true }
    if (this.callbackRunning) return { delivered: 0, running: true }
    this.callbackRunning = true
    let delivered = 0
    try {
      const pending = this.store
        .values<Notification>('notifications')
        .filter(
          (item) =>
            item.status === 'PENDING' && item.next_attempt_at <= Date.now(),
        )
      for (const candidate of pending) {
        if (this.callbacksStopped) break
        const pendingDelivery = await this.exclusive(async () => {
          if (this.callbacksStopped) return undefined
          const current = this.store.get<Notification>(
            'notifications',
            candidate.id,
          )
          return current?.status === 'PENDING' &&
            current.next_attempt_at <= Date.now()
            ? {
                item: structuredClone(current),
                revision:
                  this.store.record('notifications', current.id)?.revision ??
                  null,
              }
            : undefined
        })
        if (!pendingDelivery) continue
        const { item, revision } = pendingDelivery
        let status: number | undefined
        let error: string | undefined
        try {
          const body = JSON.stringify(item.body)
          const response = await fetch(item.url, {
            method: 'POST',
            redirect: 'error',
            headers: {
              'Content-Type': 'application/json',
              ...this.crypto.headers(body),
            },
            body,
            signal: AbortSignal.timeout(this.config.callbackTimeoutMs),
          })
          status = response.status
          await response.body?.cancel()
          if (status !== 200 && status !== 204)
            error = `回调响应 HTTP ${status}`
        } catch (cause) {
          error = cause instanceof Error ? cause.message : String(cause)
        }
        await this.exclusive(async () => {
          if (this.callbacksStopped) return
          const current = this.store.get<Notification>('notifications', item.id)
          if (!current || current.status !== 'PENDING') return
          if (
            (revision !== null &&
              this.store.record('notifications', item.id)?.revision !==
                revision) ||
            canonical(current) !== canonical(item)
          )
            return
          current.attempts += 1
          current.last_status = status
          current.last_error = error
          if (!error) {
            current.status = 'SUCCESS'
            delivered += 1
          } else if (current.attempts > this.config.callbackRetryMs.length)
            current.status = 'FAILED'
          else
            current.next_attempt_at =
              Date.now() + this.config.callbackRetryMs[current.attempts - 1]!
          this.store.save()
        })
      }
      return {
        delivered,
        pending: this.callbacksStopped
          ? 0
          : this.store
              .values<Notification>('notifications')
              .filter((item) => item.status === 'PENDING').length,
      }
    } finally {
      this.callbackRunning = false
    }
  }

  stopCallbacks(): void {
    this.callbacksStopped = true
  }

  consumeFault(method: string, path: string): Fault | undefined {
    const fault = this.store
      .values<Fault>('faults')
      .find(
        (item) =>
          item.remaining > 0 && item.method === method && item.path === path,
      )
    if (fault) fault.remaining -= 1
    return fault
  }
}
