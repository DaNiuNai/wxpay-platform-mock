import { join } from 'node:path'
import { randomUUID, X509Certificate } from 'node:crypto'
import { Hono } from 'hono'
import { ApiError, defaults, fail, int, obj, Runtime, str } from './core.js'
import { CryptoService } from './crypto.js'
import { Store } from './store.js'
import { contracts } from './contracts.js'
import { registerPayments } from './payments.js'
import { registerSettlement } from './settlement.js'
import { registerMerchants } from './merchants.js'
import {
  handleConsoleProxy,
  isConsoleProxy,
  registerConsole,
} from './console.js'
import type { MockConfig, Order } from './types.js'
import type { Notification } from './core.js'

export interface AppOptions {
  config?: Partial<MockConfig>
  dataDir?: string | null
  callbacks?: boolean
  validate?: boolean
}

export function createApp(options: AppOptions = {}) {
  const config = { ...defaults, ...options.config }
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535)
    throw new Error('port 必须在 1 到 65535 之间')
  if (
    !Number.isInteger(config.callbackTimeoutMs) ||
    config.callbackTimeoutMs <= 0
  )
    throw new Error('callbackTimeoutMs 必须为正整数')
  if (
    !Array.isArray(config.callbackRetryMs) ||
    config.callbackRetryMs.some(
      (delay) => !Number.isInteger(delay) || delay < 0,
    )
  )
    throw new Error('callbackRetryMs 必须为非负整数数组')
  const app = new Hono({ strict: false })
  const store = new Store(
    options.dataDir ? join(options.dataDir, 'state.json') : undefined,
  )
  const crypto = new CryptoService(
    config.apiV3Key,
    options.dataDir ?? undefined,
  )
  const runtime = new Runtime(
    app,
    store,
    crypto,
    config,
    options.validate ?? true,
  )
  if (!store.get('meta', 'seeded')) {
    runtime.account(config.spMchid).available = 100000000
    runtime.account(config.subMchid)
    store.set('meta', 'seeded', true)
  }

  app.onError((error, c) => {
    if (error instanceof ApiError)
      return new Response(
        JSON.stringify({ code: error.code, message: error.message }),
        {
          status: error.status,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    console.error('模拟服务内部错误：', error)
    return c.json(
      { code: 'SYSTEM_ERROR', message: '模拟服务内部错误，请查看服务日志' },
      500,
    )
  })
  app.notFound((c) =>
    c.json(
      { code: 'RESOURCE_NOT_EXISTS', message: '接口不存在，请查看 /mock/apis' },
      404,
    ),
  )
  app.use('/v3/*', async (c, next) => {
    if (config.strict) {
      const body = (c.req.header('Content-Type') ?? '').includes(
        'multipart/form-data',
      )
        ? await c.req.raw
            .clone()
            .formData()
            .then((form) => String(form.get('meta') ?? ''))
        : await c.req.raw.clone().text()
      try {
        crypto.verifyRequest(c.req.raw, body, config.spMchid)
      } catch (error) {
        fail(
          401,
          'SIGN_ERROR',
          error instanceof Error ? error.message : '签名错误',
        )
      }
      const serial = c.req.header('Wechatpay-Serial')
      if (serial && serial !== crypto.platformSerial)
        fail(400, 'PARAM_ERROR', 'Wechatpay-Serial 与测试平台证书不匹配')
    }
    await next()
  })
  registerMerchants(runtime)
  registerPayments(runtime)
  registerSettlement(runtime)
  const freshStore = new Store()
  const freshRuntime = new Runtime(new Hono(), freshStore, crypto, config)
  freshRuntime.account(config.spMchid).available = 100000000
  freshRuntime.account(config.subMchid)
  freshStore.set('meta', 'seeded', true)
  registerMerchants(freshRuntime)
  const initial = freshStore.snapshot()

  registerConsole(runtime)
  runtime.route('GET', '/mock/info', () => ({
    name: '平台收付通联调模拟服务',
    mode: config.strict ? 'strict' : 'loose',
    console: '/',
    api_catalog: '/mock/apis',
    credentials: '/mock/credentials',
    health: '/health',
  }))
  runtime.route('GET', '/health', () => ({ status: 'ok' }))
  runtime.route('GET', '/mock/apis', () => {
    const supported = new Set(
      runtime.routes.map(
        (route) =>
          `${route.method} ${route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}').replace(/\/$/, '')}`,
      ),
    )
    return {
      total: contracts.length,
      implemented: contracts.filter((item) =>
        supported.has(`${item.method} ${item.path}`),
      ).length,
      apis: contracts.map((item) => ({
        ...item,
        implemented: supported.has(`${item.method} ${item.path}`),
      })),
      actions: [...runtime.actions.keys()],
    }
  })
  runtime.route('GET', '/mock/credentials', () => ({
    sp_mchid: config.spMchid,
    sp_appid: config.spAppid,
    sub_mchid: config.subMchid,
    api_v3_key: config.apiV3Key,
    ...crypto.exportPublic(),
  }))
  const escapeHtml = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character]!,
    )
  app.get('/mock/cashier', (c) => {
    const prepayId = c.req.query('prepay_id') ?? ''
    const orders = store
      .values<Order>('orders')
      .filter((order) => order.prepay_id === prepayId)
    if (!orders.length) fail(404, 'ORDER_NOT_EXIST', '预支付单不存在')
    return c.html(
      `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>模拟收银台</title><body style="font:16px system-ui;max-width:560px;margin:60px auto;padding:20px"><h1>平台收付通模拟收银台</h1><p>${orders.map((order) => escapeHtml(order.description)).join('、')}</p><p>金额：¥${(orders.reduce((sum, order) => sum + order.amount.total, 0) / 100).toFixed(2)}</p><p>订单状态：${orders.map((order) => escapeHtml(order.trade_state)).join('、')}</p><form method="post" action="/mock/cashier/pay"><input type="hidden" name="prepay_id" value="${escapeHtml(prepayId)}"><button type="submit" style="padding:12px 24px">模拟支付成功</button></form></body></html>`,
    )
  })
  app.post('/mock/cashier/pay', async (c) => {
    const body = await c.req.parseBody()
    const prepayId = typeof body.prepay_id === 'string' ? body.prepay_id : ''
    if (!prepayId) fail(400, 'PARAM_ERROR', 'prepay_id 必填')
    await runtime.actions.get('pay')!({ prepay_id: prepayId })
    return c.redirect(
      `/mock/cashier?prepay_id=${encodeURIComponent(prepayId)}`,
      303,
    )
  })
  runtime.route('GET', '/mock/config', () => ({ ...config }))
  runtime.route('PATCH', '/mock/config', ({ body }) => {
    const allowed = ['strict', 'autoPay', 'autoComplete', 'serviceNotifyUrl']
    for (const key of Object.keys(body))
      if (!allowed.includes(key))
        fail(400, 'PARAM_ERROR', `配置 ${key} 不支持运行时修改`)
    for (const key of ['strict', 'autoPay', 'autoComplete'] as const) {
      if (body[key] !== undefined) {
        if (typeof body[key] !== 'boolean')
          fail(400, 'PARAM_ERROR', `${key} 必须为布尔值`)
        config[key] = body[key] as boolean
      }
    }
    if (body.serviceNotifyUrl !== undefined) {
      const url = str(body, 'serviceNotifyUrl', false)
      if (url) {
        try {
          const parsed = new URL(url)
          if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
        } catch {
          fail(400, 'PARAM_ERROR', 'serviceNotifyUrl 无效')
        }
      }
      config.serviceNotifyUrl = url
    }
    return { ...config }
  })
  runtime.route('POST', '/mock/actions/:action', async ({ body, params }) => {
    const action = runtime.actions.get(str(params, 'action'))
    if (!action)
      fail(404, 'RESOURCE_NOT_EXISTS', '控制动作不存在，请查看 /mock/apis')
    return await action(body)
  })
  runtime.route('GET', '/mock/state', () => store.snapshot())
  runtime.route('POST', '/mock/reset', () => {
    store.restore(initial)
    return { status: 'reset' }
  })
  runtime.route('POST', '/mock/accounts', ({ body }) => {
    const account = runtime.account(
      str(body, 'mchid'),
      str(body, 'account_type', false) || 'BASIC',
    )
    if (body.available !== undefined) account.available = int(body, 'available')
    if (body.frozen !== undefined) account.frozen = int(body, 'frozen')
    return account
  })
  runtime.route('POST', '/mock/faults', ({ body }) => {
    const method = str(body, 'method').toUpperCase()
    const path = str(body, 'path')
    if (
      !path.startsWith('/v3/') ||
      !['GET', 'POST', 'DELETE', 'PUT', 'PATCH'].includes(method)
    )
      fail(400, 'PARAM_ERROR', '故障只能应用于官方 /v3/ 接口')
    const status = body.status === undefined ? 500 : int(body, 'status', 400)
    if (status > 599) fail(400, 'PARAM_ERROR', 'status 必须在 400 到 599 之间')
    const fault = {
      id: runtime.id('fault_'),
      method,
      path,
      status,
      code: str(body, 'code', false) || 'SYSTEM_ERROR',
      message: str(body, 'message', false) || '模拟注入故障',
      remaining: body.remaining === undefined ? 1 : int(body, 'remaining', 1),
      delay_ms: body.delay_ms === undefined ? 0 : int(body, 'delay_ms'),
    }
    if (fault.delay_ms > 30000) fail(400, 'PARAM_ERROR', 'delay_ms 最大 30000')
    store.set('faults', fault.id, fault)
    return fault
  })
  runtime.route('GET', '/mock/notifications', () => ({
    data: store.values('notifications'),
  }))
  runtime.route('POST', '/mock/notifications/:id/retry', ({ params }) => {
    const item = store.get<Notification>('notifications', str(params, 'id'))
    if (!item) fail(404, 'RESOURCE_NOT_EXISTS', '通知不存在')
    item.status = 'PENDING'
    item.attempts = 0
    item.next_attempt_at = Date.now()
    return item
  })
  runtime.route('POST', '/mock/receiver', ({ body, request, rawBody }) => {
    if (!crypto.verifyNotification(request.headers, rawBody ?? ''))
      fail(401, 'SIGN_ERROR', '通知签名校验失败')
    store.set('received_callbacks', str(body, 'id'), {
      body,
      headers: Object.fromEntries(request.headers),
      decrypted: crypto.decryptResource(obj(body.resource)),
    })
    return undefined
  })
  runtime.route('GET', '/v3/certificates', () => {
    const certificate = new X509Certificate(crypto.platformCertificate)
    return {
      data: [
        {
          serial_no: crypto.platformSerial,
          effective_time: new Date(certificate.validFrom).toISOString(),
          expire_time: new Date(certificate.validTo).toISOString(),
          encrypt_certificate: crypto.encryptResource(
            crypto.platformCertificate,
            'certificate',
          ),
        },
      ],
    }
  })

  const originalFetch = app.fetch.bind(app)
  app.fetch = ((request: Request, ...args: unknown[]) => {
    // 控制台代理的内层业务调用自行进入事务，外层不能先占有同一把锁。
    if (isConsoleProxy(request)) return handleConsoleProxy(runtime, request)
    return runtime.exclusive(async () => {
      const started = Date.now()
      const url = new URL(request.url)
      const fault = runtime.consumeFault(request.method, url.pathname)
      const snapshot = store.snapshot()
      const configSnapshot = { ...config }
      let response: Response
      try {
        if (fault) {
          if (fault.delay_ms)
            await new Promise((resolve) => setTimeout(resolve, fault.delay_ms))
          response = new Response(
            JSON.stringify({ code: fault.code, message: fault.message }),
            {
              status: fault.status,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        } else response = await originalFetch(request, ...args)
        if (response.status >= 400) {
          store.restore(snapshot)
          Object.assign(config, configSnapshot)
        }
        if (
          url.pathname.startsWith('/v3/') &&
          !response.headers.get('Content-Disposition')
        ) {
          const body = await response.clone().text()
          const headers = new Headers(response.headers)
          for (const [key, value] of Object.entries(crypto.headers(body)))
            headers.set(key, value)
          headers.set('Request-ID', randomUUID())
          response = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          })
        }
        store.set('requests', runtime.id('req_'), {
          method: request.method,
          path: url.pathname,
          query: url.search,
          status: response.status,
          duration_ms: Date.now() - started,
          time: runtime.now(),
        })
        const entries = Object.keys(store.snapshot().requests ?? {})
        for (const key of entries.slice(0, Math.max(0, entries.length - 200)))
          store.delete('requests', key)
        store.save()
        return response
      } catch (error) {
        store.restore(snapshot)
        Object.assign(config, configSnapshot)
        throw error
      }
    })
  }) as typeof app.fetch

  const timer =
    options.callbacks === false
      ? undefined
      : setInterval(() => {
          void runtime
            .flushCallbacks()
            .catch((error) => console.error('通知发送失败：', error))
        }, 1000)
  timer?.unref()
  return {
    app,
    runtime,
    close: () => {
      if (timer) clearInterval(timer)
      store.save()
    },
  }
}
