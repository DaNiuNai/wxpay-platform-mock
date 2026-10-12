import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import type { AddressInfo } from 'node:net'
import { join, resolve } from 'node:path'
import { serve } from '@hono/node-server'
import test from 'node:test'
import { createApp } from '../src/app.js'
import type { Data, Order } from '../src/types.js'

type Instance = ReturnType<typeof createApp>
interface Result {
  status: number
  headers: Record<string, string>
  body: string
  body_encoding: 'text' | 'base64'
  json: Data
  duration_ms: number
  request: {
    method: string
    path: string
    body: Data
    headers: Record<string, string>
  }
}

async function proxy(
  instance: Instance,
  method: string,
  path: string,
  body?: unknown,
  options: Data = {},
): Promise<Result> {
  const response = await instance.app.request('/mock/console/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method,
      path,
      ...(body === undefined ? {} : { body }),
      ...options,
    }),
  })
  const text = await response.text()
  assert.equal(response.status, 200, text)
  return JSON.parse(text) as Result
}

const payment = (out_trade_no: string) => ({
  sp_appid: 'wx_mock_platform',
  sp_mchid: '1900000100',
  sub_mchid: '1900000101',
  description: '网页控制台商品',
  out_trade_no,
  notify_url: 'http://127.0.0.1:1/notify',
  amount: { total: 1000, currency: 'CNY' },
  settle_info: { profit_sharing: true },
})

test(
  '本地网页、固定静态资源及真实 HTTP 严格签名代理可访问且不会锁死',
  { timeout: 15000 },
  async () => {
    const instance = createApp({ config: { strict: true }, callbacks: false })
    const server = serve({
      fetch: instance.app.fetch,
      hostname: '127.0.0.1',
      port: 0,
    })
    try {
      if (!server.listening) await once(server, 'listening')
      const address = server.address() as AddressInfo
      const base = `http://127.0.0.1:${address.port}`
      const page = await fetch(base)
      assert.equal(page.status, 200)
      assert.match(page.headers.get('Content-Type')!, /text\/html/)
      assert.match(await page.text(), /console-assets\/app\.js/)
      for (const file of [
        'app.js',
        'styles.css',
        'templates.js',
        'helpers.js',
      ]) {
        const response = await fetch(`${base}/console-assets/${file}`)
        assert.equal(response.status, 200, file)
        assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
        assert.ok((await response.text()).length > 0)
      }
      assert.equal(
        (await fetch(`${base}/console-assets/console.ts`)).status,
        404,
      )
      const response = await fetch(`${base}/mock/console/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: base },
        body: JSON.stringify({
          method: 'GET',
          path: '/v3/ecommerce/fund/balance/1900000101?account_type=BASIC',
        }),
        signal: AbortSignal.timeout(5000),
      })
      assert.equal(response.status, 200)
      const result = (await response.json()) as Result
      assert.equal(result.status, 200, result.body)
      assert.match(
        result.request.headers.authorization!,
        /^WECHATPAY2-SHA256-RSA2048 /,
      )
      instance.runtime.crypto.verifyRequest(
        new Request(base + result.request.path, {
          headers: result.request.headers,
        }),
        '',
        '1900000100',
      )
      assert.equal(
        instance.runtime.crypto.verifyNotification(
          new Headers(result.headers),
          result.body,
        ),
        true,
      )
      assert.equal(JSON.stringify(result).includes('PRIVATE KEY'), false)
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
      instance.close()
    }
  },
)

test(
  '严格模式通过网页完成支付、查询、分账并保持真实业务状态',
  { timeout: 10000 },
  async () => {
    const instance = createApp({ config: { strict: true }, callbacks: false })
    try {
      const create = await proxy(
        instance,
        'POST',
        '/v3/pay/partner/transactions/native',
        payment('CONSOLEPAY01'),
      )
      assert.equal(create.status, 200, create.body)
      assert.equal(
        (
          await proxy(
            instance,
            'POST',
            '/v3/pay/partner/transactions/native',
            payment('CONSOLEPAY01'),
          )
        ).status,
        200,
      )
      assert.equal(instance.runtime.store.values('orders').length, 1)
      const paid = await proxy(instance, 'POST', '/mock/actions/pay', {
        sub_mchid: '1900000101',
        out_trade_no: 'CONSOLEPAY01',
      })
      assert.equal(paid.status, 200, paid.body)
      const query = await proxy(
        instance,
        'GET',
        '/v3/pay/partner/transactions/out-trade-no/CONSOLEPAY01?sp_mchid=1900000100&sub_mchid=1900000101',
      )
      assert.equal(query.status, 200, query.body)
      assert.equal(query.json.trade_state, 'SUCCESS')
      const order = instance.runtime.store.values<Order>('orders')[0]!
      const body = {
        sub_mchid: order.sub_mchid,
        transaction_id: order.transaction_id,
        out_order_no: 'CONSOLESHARE01',
        finish: true,
        receivers: [
          {
            type: 'MERCHANT_ID',
            receiver_account: '1900000100',
            receiver_name: '测试平台',
            amount: 200,
            description: '平台佣金',
          },
        ],
      }
      const share = await proxy(
        instance,
        'POST',
        '/v3/ecommerce/profitsharing/orders',
        body,
      )
      assert.equal(share.status, 200, share.body)
      const receiver = (share.request.body.receivers as Data[])[0]!
      assert.equal(
        instance.runtime.crypto.decryptSensitive(
          String(receiver.receiver_name),
        ),
        '测试平台',
      )
      assert.equal(instance.runtime.account('1900000101').available, 800)
      assert.equal(instance.runtime.account('1900000101').frozen, 0)
      const repeated = await proxy(
        instance,
        'POST',
        '/v3/ecommerce/profitsharing/orders',
        body,
      )
      assert.equal(repeated.status, 200, repeated.body)
      assert.equal(
        repeated.request.body.receivers &&
          (repeated.request.body.receivers as Data[])[0]!.receiver_name,
        receiver.receiver_name,
      )
      assert.equal(instance.runtime.account('1900000101').available, 800)
    } finally {
      instance.close()
    }
  },
)

test(
  '敏感明文自动加密并保留已有平台密文，关闭加密可模拟严格模式错误',
  { timeout: 10000 },
  async () => {
    const instance = createApp({ config: { strict: true }, callbacks: false })
    try {
      const body = {
        account_type: 'ACCOUNT_TYPE_BUSINESS',
        account_bank: '工商银行',
        account_name: '联调测试有限公司',
        account_number: '6222021234567890123',
      }
      const path = '/v3/apply4sub/sub_merchants/1900000101/modify-settlement'
      const result = await proxy(instance, 'POST', path, body)
      assert.equal(result.status, 200, result.body)
      assert.notEqual(result.request.body.account_name, body.account_name)
      assert.equal(
        instance.runtime.crypto.decryptSensitive(
          String(result.request.body.account_name),
        ),
        body.account_name,
      )
      assert.equal(
        instance.runtime.store.get<Data>('settlements', '1900000101')!
          .account_number,
        body.account_number,
      )
      const encrypted = await proxy(instance, 'POST', path, result.request.body)
      assert.equal(encrypted.status, 200, encrypted.body)
      assert.equal(
        encrypted.request.body.account_number,
        result.request.body.account_number,
      )
      const plain = await proxy(instance, 'POST', path, body, {
        encryptSensitive: false,
      })
      assert.equal(plain.status, 400)
      assert.match(plain.json.message as string, /解密失败/)
      const unsigned = await proxy(
        instance,
        'GET',
        '/v3/ecommerce/fund/balance/1900000101',
        undefined,
        { signed: false },
      )
      assert.equal(unsigned.status, 401)
      assert.equal(unsigned.json.code, 'SIGN_ERROR')
    } finally {
      instance.close()
    }
  },
)

test('代理只允许内部已知路径，拒绝外部 URL、穿越、跨站和递归代理', async () => {
  const instance = createApp({ callbacks: false })
  try {
    for (const path of [
      'https://example.com/v3/certificates',
      '//example.com/v3/certificates',
      '/mock/console/request',
      '/v3/../mock/console/request',
      '/mock/receiver',
      '/mock/unknown',
      '/__mock/unknown/1',
      '/v3/certificates#fragment',
      '/v3/\\example.com',
    ]) {
      const response = await instance.app.request('/mock/console/request', {
        method: 'POST',
        body: JSON.stringify({ method: 'GET', path }),
      })
      assert.equal(response.status, 400, path)
    }
    const crossSite = await instance.app.request('/mock/console/request', {
      method: 'POST',
      headers: { Origin: 'https://example.com' },
      body: JSON.stringify({ method: 'GET', path: '/v3/certificates' }),
    })
    assert.equal(crossSite.status, 400)
    const badHeader = await instance.app.request('/mock/console/request', {
      method: 'POST',
      body: JSON.stringify({
        method: 'GET',
        path: '/v3/certificates',
        headers: { Host: 'example.com' },
      }),
    })
    assert.equal(badHeader.status, 400)
    const badFlag = await instance.app.request('/mock/console/request', {
      method: 'POST',
      body: JSON.stringify({
        method: 'GET',
        path: '/v3/certificates',
        signed: 'true',
      }),
    })
    assert.equal(badFlag.status, 400)
    assert.equal(instance.runtime.store.values('orders').length, 0)
  } finally {
    instance.close()
  }
})

test(
  '官方故障保留真实状态与签名，重试恢复，账单二进制支持无损下载',
  { timeout: 10000 },
  async () => {
    const instance = createApp({ config: { strict: true }, callbacks: false })
    try {
      const path = '/v3/pay/partner/transactions/native'
      assert.equal(
        (
          await proxy(instance, 'POST', '/mock/faults', {
            method: 'POST',
            path,
            status: 503,
            code: 'SYSTEM_ERROR',
            remaining: 1,
          })
        ).status,
        200,
      )
      const failed = await proxy(
        instance,
        'POST',
        path,
        payment('CONSOLEFAULT01'),
      )
      assert.equal(failed.status, 503)
      assert.equal(
        instance.runtime.crypto.verifyNotification(
          new Headers(failed.headers),
          failed.body,
        ),
        true,
      )
      assert.equal(instance.runtime.store.values('orders').length, 0)
      assert.equal(
        (await proxy(instance, 'POST', path, payment('CONSOLEFAULT01'))).status,
        200,
      )
      const bill = await proxy(
        instance,
        'GET',
        `/v3/bill/tradebill?bill_date=${instance.runtime.now().slice(0, 10)}&tar_type=GZIP`,
      )
      assert.equal(bill.status, 200, bill.body)
      const url = new URL(String(bill.json.download_url))
      const download = await proxy(instance, 'GET', url.pathname + url.search)
      assert.equal(download.status, 200)
      assert.equal(download.body_encoding, 'base64')
      assert.match(download.headers['content-disposition']!, /attachment/)
      const raw = gunzipSync(Buffer.from(download.body, 'base64'))
      assert.equal(
        createHash('sha1').update(raw).digest('hex'),
        bill.json.hash_value,
      )
      assert.match(raw.toString('utf8'), /总交易单数/)
    } finally {
      instance.close()
    }
  },
)

test(
  '文件上传计算真实 SHA256、使用 meta 严格签名、兼容两个媒体接口',
  { timeout: 10000 },
  async () => {
    const instance = createApp({ config: { strict: true }, callbacks: false })
    try {
      const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3])
      const digest = createHash('sha256').update(bytes).digest('hex')
      for (const path of [
        '/v3/merchant/media/upload',
        '/v3/ecommerce/account/cancel-applications/media',
      ]) {
        const form = new FormData()
        form.set(
          'file',
          new Blob([bytes], { type: 'image/png' }),
          'console.png',
        )
        form.set('path', path)
        const response = await instance.app.request('/mock/console/upload', {
          method: 'POST',
          body: form,
        })
        assert.equal(response.status, 200)
        const result = (await response.json()) as Result
        assert.equal(result.status, 200, result.body)
        assert.equal(result.json.media_id, `mock_media_${digest}`)
        instance.runtime.crypto.verifyRequest(
          new Request('http://localhost' + path, {
            method: 'POST',
            headers: result.request.headers,
          }),
          JSON.stringify(result.request.body.meta),
          '1900000100',
        )
        assert.equal(
          instance.runtime.store.get<Data>(
            'media',
            String(result.json.media_id),
          )!.sha256,
          digest,
        )
        const json = await proxy(instance, 'POST', path, {
          meta: { sha256: 'incorrect-is-replaced' },
          file: {
            name: 'console.png',
            type: 'image/png',
            content_base64: Buffer.from(bytes).toString('base64'),
          },
        })
        assert.equal(json.status, 200, json.body)
        assert.equal(json.json.media_id, result.json.media_id)
      }
      const external = new FormData()
      external.set('file', new Blob([bytes]), 'console.png')
      external.set('path', 'https://example.com/v3/merchant/media/upload')
      assert.equal(
        (
          await instance.app.request('/mock/console/upload', {
            method: 'POST',
            body: external,
          })
        ).status,
        400,
      )
      const invalid = new FormData()
      invalid.set('file', new Blob([bytes]), 'console.exe')
      const result = (await (
        await instance.app.request('/mock/console/upload', {
          method: 'POST',
          body: invalid,
        })
      ).json()) as Result
      assert.equal(result.status, 400)
      assert.equal(result.json.code, 'PARAM_ERROR')
    } finally {
      instance.close()
    }
  },
)

test(
  '敏感字段的网页重复请求跨服务重启仍幂等且不会重复入账',
  { timeout: 10000 },
  async () => {
    const directory = mkdtempSync(join(resolve('tests'), '.console-state-'))
    let instance = createApp({
      dataDir: directory,
      config: { strict: true },
      callbacks: false,
    })
    try {
      assert.equal(
        (
          await proxy(
            instance,
            'POST',
            '/v3/pay/partner/transactions/native',
            payment('CONSOLERESTART01'),
          )
        ).status,
        200,
      )
      assert.equal(
        (
          await proxy(instance, 'POST', '/mock/actions/pay', {
            sub_mchid: '1900000101',
            out_trade_no: 'CONSOLERESTART01',
          })
        ).status,
        200,
      )
      const order = instance.runtime.store.values<Order>('orders')[0]!
      const body = {
        sub_mchid: order.sub_mchid,
        transaction_id: order.transaction_id,
        out_order_no: 'CONSOLERESTARTSHARE01',
        finish: true,
        receivers: [
          {
            type: 'MERCHANT_ID',
            receiver_account: '1900000100',
            receiver_name: '跨重启测试平台',
            amount: 200,
            description: '平台佣金',
          },
        ],
      }
      const first = await proxy(
        instance,
        'POST',
        '/v3/ecommerce/profitsharing/orders',
        body,
      )
      assert.equal(first.status, 200, first.body)
      instance.close()
      instance = createApp({
        dataDir: directory,
        config: { strict: true },
        callbacks: false,
      })
      const repeated = await proxy(
        instance,
        'POST',
        '/v3/ecommerce/profitsharing/orders',
        body,
      )
      assert.equal(repeated.status, 200, repeated.body)
      assert.deepEqual(repeated.request.body, first.request.body)
      assert.equal(instance.runtime.account('1900000101').available, 800)
      assert.equal(instance.runtime.account('1900000100').available, 100000200)
      assert.equal(instance.runtime.store.values('profitsharing').length, 1)
    } finally {
      instance.close()
      assert.ok(directory.startsWith(join(resolve('tests'), '.console-state-')))
      rmSync(directory, { recursive: true, force: true })
    }
  },
)

test(
  '严格模式主体查询自动加密敏感 query 并按最终 URL 签名',
  { timeout: 10000 },
  async () => {
    const instance = createApp({ config: { strict: true }, callbacks: false })
    try {
      const path =
        '/v3/ecommerce/subject-sub-merchants?organization_type=SUBJECT_TYPE_ENTERPRISE&cert_number=91440300MA5MOCK001&limit=20&offset=0'
      const result = await proxy(instance, 'GET', path)
      assert.equal(result.status, 200, result.body)
      const merchants = result.json.data as Data[]
      assert.equal(merchants.length, 1)
      assert.equal(merchants[0]!.sub_mchid, instance.runtime.config.subMchid)
      const url = new URL(result.request.path, 'http://localhost')
      assert.equal(
        instance.runtime.crypto.decryptSensitive(
          url.searchParams.get('cert_number')!,
        ),
        '91440300MA5MOCK001',
      )
      assert.equal(url.searchParams.get('limit'), '20')
      instance.runtime.crypto.verifyRequest(
        new Request(url, { headers: result.request.headers }),
        '',
        instance.runtime.config.spMchid,
      )
      assert.equal(
        (
          await proxy(instance, 'GET', path, undefined, {
            encryptSensitive: false,
          })
        ).status,
        400,
      )
      const repeated = await proxy(instance, 'GET', result.request.path)
      assert.equal(repeated.status, 200, repeated.body)
      assert.equal(repeated.request.path, result.request.path)
    } finally {
      instance.close()
    }
  },
)
