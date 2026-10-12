import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sign,
  verify,
  publicEncrypt,
  constants,
  createPublicKey,
  X509Certificate,
} from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createApp } from '../src/app.js'
import type { Data } from '../src/types.js'
import type { Notification } from '../src/core.js'
import { validateFields } from '../src/validation.js'

const post = (
  app: ReturnType<typeof createApp>['app'],
  path: string,
  body: unknown,
) =>
  app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
const payment = (out_trade_no = 'CORE_ORDER') => ({
  sp_appid: 'wx_mock_platform',
  sp_mchid: '1900000100',
  sub_mchid: '1900000101',
  description: '联调商品',
  out_trade_no,
  notify_url: 'http://127.0.0.1:1/notify',
  amount: { total: 1000, currency: 'CNY' },
  settle_info: { profit_sharing: true },
})
function verified(
  instance: ReturnType<typeof createApp>,
  headers: Headers,
  body: string,
): boolean {
  return verify(
    'RSA-SHA256',
    Buffer.from(
      `${headers.get('Wechatpay-Timestamp')}\n${headers.get('Wechatpay-Nonce')}\n${body}\n`,
    ),
    instance.runtime.crypto.platformPublicKey,
    Buffer.from(headers.get('Wechatpay-Signature')!, 'base64'),
  )
}

test('本地文档的全部74个服务端方法/路径均已注册', async () => {
  const instance = createApp({ callbacks: false })
  const result = (await (await instance.app.request('/mock/apis')).json()) as {
    total: number
    implemented: number
    apis: Data[]
  }
  assert.equal(result.total, 74)
  assert.equal(
    result.implemented,
    result.total,
    JSON.stringify(result.apis.filter((item) => !item.implemented)),
  )
  instance.close()
})

test('宽松模式仍校验文档必填、类型、嵌套参数，错误与204应答可验签', async () => {
  const instance = createApp({ callbacks: false })
  const bad = await post(instance.app, '/v3/pay/partner/transactions/native', {
    ...payment(),
    amount: { total: '1000' },
  })
  assert.equal(bad.status, 400)
  assert.equal(verified(instance, bad.headers, await bad.text()), true)
  const malformed = await instance.app.request(
    '/v3/pay/partner/transactions/native',
    { method: 'POST', body: '{' },
  )
  assert.equal(malformed.status, 400)
  await post(instance.app, '/v3/pay/partner/transactions/native', payment())
  const closed = await post(
    instance.app,
    '/v3/pay/partner/transactions/out-trade-no/CORE_ORDER/close',
    { sp_mchid: '1900000100', sub_mchid: '1900000101' },
  )
  assert.equal(closed.status, 204)
  assert.equal(verified(instance, closed.headers, await closed.text()), true)
  instance.close()
})

test('严格模式检查原始请求签名和时间，平台证书AES解密得到真实PEM', async () => {
  const instance = createApp({ config: { strict: true }, callbacks: false })
  const path = '/v3/ecommerce/fund/balance/1900000101'
  assert.equal((await instance.app.request(path)).status, 401)
  const authorize = (
    route: string,
    body = '',
    timestamp = Math.floor(Date.now() / 1000),
  ) => {
    const nonce = 'test_nonce'
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(`GET\n${route}\n${timestamp}\n${nonce}\n${body}\n`),
      instance.runtime.crypto.merchantPrivateKey,
    ).toString('base64')
    return `WECHATPAY2-SHA256-RSA2048 mchid="1900000100",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${instance.runtime.crypto.merchantSerial}",signature="${signature}"`
  }
  const ok = await instance.app.request(path, {
    headers: { Authorization: authorize(path) },
  })
  assert.equal(ok.status, 200)
  assert.equal(verified(instance, ok.headers, await ok.text()), true)
  assert.equal(
    (
      await instance.app.request(`${path}?account_type=BASIC`, {
        headers: { Authorization: authorize(path) },
      })
    ).status,
    401,
  )
  assert.equal(
    (
      await instance.app.request(path, {
        headers: { Authorization: authorize(path, '', 1) },
      })
    ).status,
    401,
  )
  const certificateResponse = await instance.app.request('/v3/certificates', {
    headers: { Authorization: authorize('/v3/certificates') },
  })
  const certificates = (await certificateResponse.json()) as {
    data: { encrypt_certificate: Data }[]
  }
  const pem = instance.runtime.crypto.decryptResource(
    certificates.data[0]!.encrypt_certificate,
  ) as string
  assert.equal(
    new X509Certificate(pem).serialNumber,
    instance.runtime.crypto.platformSerial,
  )
  assert.equal(
    new X509Certificate(pem).verify(
      createPublicKey(instance.runtime.crypto.platformPublicKey),
    ),
    true,
  )
  instance.close()
})

test('敏感字段按解密后明文长度校验，正常RSA密文可通过文档契约', async () => {
  const instance = createApp({ callbacks: false })
  const encrypted = publicEncrypt(
    {
      key: instance.runtime.crypto.platformPublicKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha1',
    },
    Buffer.from('联调测试有限公司'),
  ).toString('base64')
  const response = await post(
    instance.app,
    '/v3/apply4sub/sub_merchants/1900000101/modify-settlement',
    {
      account_type: 'ACCOUNT_TYPE_BUSINESS',
      account_bank: '工商银行',
      account_name: encrypted,
      account_number: '6222021234567890123',
    },
  )
  assert.equal(response.status, 200, await response.text())
  instance.runtime.config.strict = true
  const path = '/v3/apply4sub/sub_merchants/1900000101/modify-settlement'
  const body = JSON.stringify({
    account_type: 'ACCOUNT_TYPE_BUSINESS',
    account_bank: '工商银行',
    account_name: encrypted,
    account_number: encrypted,
  })
  const timestamp = String(Math.floor(Date.now() / 1000)),
    nonce = 'serial-test'
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(`POST\n${path}\n${timestamp}\n${nonce}\n${body}\n`),
    instance.runtime.crypto.merchantPrivateKey,
  ).toString('base64')
  const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="1900000100",serial_no="${instance.runtime.crypto.merchantSerial}",timestamp="${timestamp}",nonce_str="${nonce}",signature="${signature}"`
  const missing = await instance.app.request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
    },
    body,
  })
  assert.equal(missing.status, 400)
  assert.match(await missing.text(), /Wechatpay-Serial/)
  instance.close()
})

test('并发支付只入账一次；并发退款预占不能超过原交易金额', async () => {
  const instance = createApp({
    config: { autoComplete: false },
    callbacks: false,
  })
  await post(instance.app, '/v3/pay/partner/transactions/native', payment())
  const paid = await Promise.all(
    Array.from({ length: 5 }, () =>
      post(instance.app, '/mock/actions/pay', {
        sub_mchid: '1900000101',
        out_trade_no: 'CORE_ORDER',
      }),
    ),
  )
  assert.equal(
    paid.every((response) => response.status === 200),
    true,
  )
  assert.equal(instance.runtime.account('1900000101').frozen, 1000)
  const refunds = await Promise.all(
    ['RF001', 'RF002'].map((out_refund_no) =>
      post(instance.app, '/v3/ecommerce/refunds/apply', {
        sp_appid: 'wx_mock_platform',
        sub_mchid: '1900000101',
        out_trade_no: 'CORE_ORDER',
        out_refund_no,
        amount: { refund: 700, total: 1000, currency: 'CNY' },
      }),
    ),
  )
  assert.deepEqual(
    refunds.map((response) => response.status).sort(),
    [200, 400],
  )
  instance.close()
})

test('请求失败回滚业务状态，一次性故障不会污染重试或重复入账', async () => {
  const instance = createApp({ callbacks: false })
  await post(instance.app, '/mock/faults', {
    method: 'POST',
    path: '/v3/pay/partner/transactions/native',
    status: 500,
  })
  assert.equal(
    (await post(instance.app, '/v3/pay/partner/transactions/native', payment()))
      .status,
    500,
  )
  assert.equal(instance.runtime.store.values('orders').length, 0)
  assert.equal(
    (await post(instance.app, '/v3/pay/partner/transactions/native', payment()))
      .status,
    200,
  )
  instance.runtime.actions.set('rollback-test', () => {
    instance.runtime.account('1900000101').available = 999
    instance.runtime.notify('invalid-url', 'TEST', {})
    return {}
  })
  assert.equal(
    (await post(instance.app, '/mock/actions/rollback-test', {})).status,
    400,
  )
  assert.equal(instance.runtime.account('1900000101').available, 0)
  instance.close()
})

test('H5返回的本地收银台可打开、确认支付并重复确认不重复入账', async () => {
  const instance = createApp({ callbacks: false })
  const body = {
    ...payment('H5_CORE'),
    description: '<script>bad()</script>',
    scene_info: { payer_client_ip: '127.0.0.1', h5_info: { type: 'Wap' } },
  }
  const response = await post(
    instance.app,
    '/v3/pay/partner/transactions/h5',
    body,
  )
  assert.equal(response.status, 200)
  const h5Url = new URL(String(((await response.json()) as Data).h5_url))
  const page = await instance.app.request(h5Url.pathname + h5Url.search)
  const html = await page.text()
  assert.equal(page.status, 200)
  assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'))
  for (let index = 0; index < 2; index++) {
    const paid = await instance.app.request('/mock/cashier/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        prepay_id: h5Url.searchParams.get('prepay_id')!,
      }).toString(),
    })
    assert.equal(paid.status, 303)
  }
  assert.equal(instance.runtime.account('1900000101').frozen, 1000)
  assert.equal(
    (await post(instance.app, '/mock/receiver', { id: 'fake', resource: {} }))
      .status,
    401,
  )
  instance.close()
})

test('状态和测试密钥重启后保留，重复订单不创建第二份', async () => {
  const directory = mkdtempSync(join(resolve('tests'), '.state-'))
  try {
    const first = createApp({ dataDir: directory, callbacks: false })
    await post(first.app, '/v3/pay/partner/transactions/native', payment())
    const serial = first.runtime.crypto.platformSerial
    first.close()
    const second = createApp({ dataDir: directory, callbacks: false })
    assert.equal(second.runtime.crypto.platformSerial, serial)
    assert.equal(
      (await post(second.app, '/v3/pay/partner/transactions/native', payment()))
        .status,
      200,
    )
    assert.equal(second.runtime.store.values('orders').length, 1)
    await post(second.app, '/mock/reset', {})
    assert.equal(second.runtime.store.values('orders').length, 0)
    assert.equal(second.runtime.account('1900000100').available, 100000000)
    second.close()
  } finally {
    assert.ok(directory.startsWith(join(resolve('tests'), '.state-')))
    rmSync(directory, { recursive: true, force: true })
  }
})

test('文档数组类型和元素类型均检查，嵌套必填不能通过字符串绕过', () => {
  const fields = [
    { name: 'materials', type: 'array[object]', required: false },
    { name: 'materials.name', type: 'string(128)', required: true },
    { name: 'media', type: 'array[string]', required: false },
  ]
  assert.throws(
    () => validateFields({ materials: 'invalid' }, fields, 'body'),
    /必须是数组/,
  )
  assert.throws(
    () => validateFields({ materials: [123] }, fields, 'body'),
    /必须是对象/,
  )
  assert.throws(
    () => validateFields({ materials: [{}] }, fields, 'body'),
    /必填/,
  )
  assert.throws(
    () => validateFields({ media: [123] }, fields, 'body'),
    /必须是非空字符串/,
  )
  assert.doesNotThrow(() =>
    validateFields(
      { materials: [{ name: 'proof' }], media: ['media-id'] },
      fields,
      'body',
    ),
  )
})

test('重置后的旧队列不会继续发送尚未开始的通知', async () => {
  const instance = createApp({ callbacks: false })
  let release!: () => void
  let accepted!: () => void
  const firstAccepted = new Promise<void>((resolve) => {
    accepted = resolve
  })
  let received = 0
  const server = createServer(async (req, res) => {
    for await (const _chunk of req) {
      /* 消费请求体 */
    }
    received += 1
    accepted()
    await new Promise<void>((resolve) => {
      release = resolve
    })
    res.writeHead(204)
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const port = (server.address() as { port: number }).port
    instance.runtime.notify(`http://127.0.0.1:${port}`, 'TEST', { sequence: 1 })
    instance.runtime.notify(`http://127.0.0.1:${port}`, 'TEST', { sequence: 2 })
    const flush = instance.runtime.flushCallbacks()
    await firstAccepted
    await post(instance.app, '/mock/reset', {})
    release()
    await flush
    assert.equal(received, 1)
    assert.equal(instance.runtime.store.values('notifications').length, 0)
  } finally {
    release?.()
    instance.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('真实HTTP回调使用AES-GCM与RSA签名，失败重试保持同一通知ID和业务内容', async () => {
  const instance = createApp({
    config: { callbackRetryMs: [0] },
    callbacks: false,
  })
  const received: { body: string; headers: Headers }[] = []
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    received.push({
      body: Buffer.concat(chunks).toString('utf8'),
      headers: new Headers(
        Object.entries(req.headers).flatMap(([name, value]) =>
          value === undefined
            ? []
            : [[name, Array.isArray(value) ? value.join(',') : value]],
        ),
      ),
    })
    res.writeHead(received.length === 1 ? 500 : 204)
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address() as { port: number }
    instance.runtime.notify(
      `http://127.0.0.1:${address.port}/notify`,
      'TRANSACTION.SUCCESS',
      { out_trade_no: 'CALLBACK_ORDER', amount: { total: 1000 } },
    )
    await instance.runtime.flushCallbacks()
    await instance.runtime.flushCallbacks()
    assert.equal(received.length, 2)
    assert.equal(received[0]!.body, received[1]!.body)
    for (const item of received)
      assert.equal(verified(instance, item.headers, item.body), true)
    const notification =
      instance.runtime.store.values<Notification>('notifications')[0]!
    assert.equal(notification.status, 'SUCCESS')
    assert.equal(notification.attempts, 2)
    assert.deepEqual(
      instance.runtime.crypto.decryptResource(
        notification.body.resource as Data,
      ),
      { out_trade_no: 'CALLBACK_ORDER', amount: { total: 1000 } },
    )
  } finally {
    instance.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
