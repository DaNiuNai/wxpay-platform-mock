import assert from 'node:assert/strict'
import {
  constants,
  createDecipheriv,
  createHash,
  privateDecrypt,
} from 'node:crypto'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { Hono } from 'hono'
import { ApiError, defaults, Runtime } from '../src/core.js'
import { CryptoService } from '../src/crypto.js'
import { registerPayments } from '../src/payments.js'
import { registerSettlement } from '../src/settlement.js'
import { Store } from '../src/store.js'
import type { Data, Order } from '../src/types.js'

const crypto = new CryptoService(defaults.apiV3Key)

function fixture(
  options: {
    sharing?: boolean
    total?: number
    subsidy?: number
    autoComplete?: boolean
  } = {},
) {
  const app = new Hono()
  const runtime = new Runtime(
    app,
    new Store(),
    crypto,
    { ...defaults, autoComplete: options.autoComplete ?? false },
    false,
  )
  app.onError((error, context) =>
    error instanceof ApiError
      ? context.json(
          { code: error.code, message: error.message },
          error.status as 400,
        )
      : context.json({ code: 'SYSTEM_ERROR', message: error.message }, 500),
  )
  registerSettlement(runtime)
  const total = options.total ?? 1000
  const sharing = options.sharing ?? true
  const order: Order = {
    sp_appid: defaults.spAppid,
    sp_mchid: defaults.spMchid,
    sub_mchid: defaults.subMchid,
    out_trade_no: 'TRADE01',
    transaction_id: '42000001',
    prepay_id: 'PREPAY01',
    trade_type: 'JSAPI',
    trade_state: 'SUCCESS',
    description: '联调测试商品',
    amount: { total, currency: 'CNY' },
    payer: {},
    notify_url: '',
    settle_info: {
      profit_sharing: sharing,
      subsidy_amount: options.subsidy ?? 0,
    },
    create_time: runtime.now(),
    success_time: runtime.now(),
    refunded: 0,
    remaining: total,
    sharing_finished: false,
  }
  runtime.store.set('orders', `${order.sub_mchid}:${order.out_trade_no}`, order)
  const account = runtime.account(defaults.subMchid)
  if (sharing) account.frozen = total
  else account.available = total
  const request = async (method: string, path: string, body?: Data) => {
    const response = await app.request(path, {
      method,
      ...(body
        ? {
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json' },
          }
        : {}),
    })
    return { response, data: (await response.json()) as Data }
  }
  const shareBody = (number: string, amount: number, finish = false): Data => ({
    sub_mchid: order.sub_mchid,
    transaction_id: order.transaction_id,
    out_order_no: number,
    finish,
    receivers: [
      {
        type: 'MERCHANT_ID',
        receiver_account: defaults.spMchid,
        receiver_name: '测试平台',
        amount,
        description: '平台佣金',
      },
    ],
  })
  const action = async (name: string, body: Data) =>
    (await runtime.actions.get(name)!(body)) as Data
  return { app, runtime, order, account, request, shareBody, action }
}

test('分账预占、超额拒绝、完成解冻和业务单幂等保持金额守恒', async () => {
  const { request, runtime, account, order, shareBody, action } = fixture()
  const body = shareBody('SHARE01', 300, true)
  const first = await request(
    'POST',
    '/v3/ecommerce/profitsharing/orders',
    body,
  )
  assert.equal(first.response.status, 200)
  assert.equal(first.data.status, 'PROCESSING')
  assert.equal(order.remaining, 700)
  assert.equal(account.frozen, 1000)
  assert.equal(
    (await request('POST', '/v3/ecommerce/profitsharing/orders', body)).data
      .order_id,
    first.data.order_id,
  )
  assert.equal(
    (
      await request(
        'POST',
        '/v3/ecommerce/profitsharing/orders',
        shareBody('SHARE01', 301, true),
      )
    ).response.status,
    400,
  )
  await action('complete-profitsharing', {
    sub_mchid: order.sub_mchid,
    out_order_no: 'SHARE01',
  })
  assert.equal(account.frozen, 0)
  assert.equal(account.available, 700)
  assert.equal(runtime.account(defaults.spMchid).available, 300)
  assert.equal(order.remaining, 0)
  await action('complete-profitsharing', {
    sub_mchid: order.sub_mchid,
    out_order_no: 'SHARE01',
  })
  assert.equal(
    account.available + runtime.account(defaults.spMchid).available,
    1000,
  )
  assert.equal(
    (
      await request(
        'POST',
        '/v3/ecommerce/profitsharing/orders',
        shareBody('SHARE02', 1),
      )
    ).response.status,
    400,
  )
})

test('分账失败释放预占，回退校验接收方余额和累计已回退金额', async () => {
  const { request, runtime, account, order, shareBody, action } = fixture()
  await request(
    'POST',
    '/v3/ecommerce/profitsharing/orders',
    shareBody('SHARE01', 400),
  )
  assert.equal(
    (
      await request(
        'POST',
        '/v3/ecommerce/profitsharing/orders',
        shareBody('SHARE02', 601),
      )
    ).data.code,
    'NOT_ENOUGH',
  )
  await action('complete-profitsharing', {
    sub_mchid: order.sub_mchid,
    out_order_no: 'SHARE01',
    success: false,
  })
  assert.equal(order.remaining, 1000)
  assert.equal(account.frozen, 1000)
  await request(
    'POST',
    '/v3/ecommerce/profitsharing/orders',
    shareBody('SHARE03', 400),
  )
  await action('complete-profitsharing', {
    sub_mchid: order.sub_mchid,
    out_order_no: 'SHARE03',
  })
  const returnBody = {
    sub_mchid: order.sub_mchid,
    out_order_no: 'SHARE03',
    out_return_no: 'RETURN01',
    return_mchid: defaults.spMchid,
    amount: 250,
    description: '退款回退',
  }
  const first = await request(
    'POST',
    '/v3/ecommerce/profitsharing/returnorders',
    returnBody,
  )
  assert.equal(first.response.status, 200)
  assert.equal(account.available, 250)
  assert.equal(runtime.account(defaults.spMchid).available, 150)
  await request('POST', '/v3/ecommerce/profitsharing/returnorders', returnBody)
  assert.equal(account.available, 250)
  assert.equal(
    (
      await request('POST', '/v3/ecommerce/profitsharing/returnorders', {
        ...returnBody,
        out_return_no: 'RETURN02',
        amount: 151,
      })
    ).data.code,
    'NOT_ENOUGH',
  )
  const remaining = await request(
    'GET',
    `/v3/ecommerce/profitsharing/orders/${order.transaction_id}/amounts`,
  )
  assert.equal(remaining.data.unsplit_amount, 600)
})

test('未支付和未启用分账的订单不能转移资金', async () => {
  const { request, order, shareBody } = fixture({ sharing: false })
  assert.equal(
    (
      await request(
        'POST',
        '/v3/ecommerce/profitsharing/orders',
        shareBody('SHARE01', 1),
      )
    ).data.code,
    'INVALID_REQUEST',
  )
  order.trade_state = 'NOTPAY'
  assert.equal(
    (
      await request(
        'POST',
        '/v3/ecommerce/profitsharing/orders',
        shareBody('SHARE02', 1),
      )
    ).data.code,
    'ORDER_NOT_PAID',
  )
})

test('退款预占后可完结分账，退款关闭归还可用余额，不会重新冻结已完结订单', async () => {
  const { request, runtime, order, account, action } = fixture()
  registerPayments(runtime)
  const refund = await request('POST', '/v3/ecommerce/refunds/apply', {
    sub_mchid: order.sub_mchid,
    sp_appid: order.sp_appid,
    out_trade_no: order.out_trade_no,
    out_refund_no: 'REFUND01',
    amount: { total: 1000, refund: 500, currency: 'CNY' },
  })
  assert.equal(refund.response.status, 200)
  assert.equal(order.trade_state, 'REFUND')
  assert.equal(order.remaining, 500)
  assert.equal(account.frozen, 500)
  const finish = await request(
    'POST',
    '/v3/ecommerce/profitsharing/finish-order',
    {
      sub_mchid: order.sub_mchid,
      transaction_id: order.transaction_id,
      out_order_no: 'FINISH01',
      description: '部分退款后完结',
    },
  )
  assert.equal(finish.response.status, 200)
  assert.equal(account.available, 0)
  assert.equal(account.frozen, 500)
  await action('complete-profitsharing', {
    sub_mchid: order.sub_mchid,
    out_order_no: 'FINISH01',
  })
  assert.equal(account.available, 500)
  assert.equal(account.frozen, 0)
  assert.equal(order.remaining, 0)
  await action('complete-refund', {
    sub_mchid: order.sub_mchid,
    refund_id: refund.data.refund_id,
    status: 'CLOSED',
  })
  assert.equal(account.available, 1000)
  assert.equal(account.frozen, 0)
  assert.equal(order.remaining, 0)
  assert.equal(order.sharing_finished, true)
})

test('补差从运营账户扣款、冻结入账，回退不能超额，分账前必须处理补差', async () => {
  const { runtime, request, account, order, shareBody } = fixture({
    subsidy: 200,
  })
  const platform = runtime.account(defaults.spMchid, 'OPERATION')
  platform.available = 500
  assert.equal(
    (
      await request(
        'POST',
        '/v3/ecommerce/profitsharing/orders',
        shareBody('SHARE01', 1),
      )
    ).data.code,
    'INVALID_REQUEST',
  )
  const body = {
    sub_mchid: order.sub_mchid,
    transaction_id: order.transaction_id,
    amount: 200,
    description: '优惠补贴',
    out_subsidy_no: 'SUBSIDY01',
  }
  const first = await request('POST', '/v3/ecommerce/subsidies/create', body)
  assert.equal(first.response.status, 200)
  assert.equal(account.frozen, 1200)
  assert.equal(order.remaining, 1200)
  assert.equal(platform.available, 300)
  await request('POST', '/v3/ecommerce/subsidies/create', body)
  assert.equal(platform.available, 300)
  const returnBody = {
    sub_mchid: order.sub_mchid,
    transaction_id: order.transaction_id,
    out_order_no: 'SUBRETURN01',
    amount: 50,
    description: '补贴回退',
    from: [{ account: 'UNAVAILABLE', amount: 50 }],
  }
  assert.equal(
    (await request('POST', '/v3/ecommerce/subsidies/return', returnBody))
      .response.status,
    200,
  )
  assert.equal(order.remaining, 1150)
  assert.equal(platform.available, 350)
  assert.equal(
    (
      await request('POST', '/v3/ecommerce/subsidies/return', {
        ...returnBody,
        out_order_no: 'SUBRETURN02',
        amount: 151,
        from: [{ account: 'UNAVAILABLE', amount: 151 }],
      })
    ).data.code,
    'NOT_ENOUGH',
  )
  assert.equal(account.frozen + platform.available, 1500)
})

test('提现受理冻结资金，失败返还、成功扣款及退票返还只能执行一次', async () => {
  const { runtime, request, account, action } = fixture({ sharing: false })
  const body = {
    sub_mchid: defaults.subMchid,
    out_request_no: 'WITHDRAW01',
    amount: 400,
  }
  const first = await request('POST', '/v3/ecommerce/fund/withdraw', body)
  assert.equal(first.response.status, 200)
  assert.equal(account.available, 600)
  assert.equal(account.frozen, 400)
  await request('POST', '/v3/ecommerce/fund/withdraw', body)
  assert.equal(account.frozen, 400)
  await action('complete-withdrawal', {
    withdraw_id: first.data.withdraw_id,
    status: 'FAIL',
  })
  assert.equal(account.available, 1000)
  assert.equal(account.frozen, 0)
  const second = await request('POST', '/v3/ecommerce/fund/withdraw', {
    ...body,
    out_request_no: 'WITHDRAW02',
    amount: 300,
  })
  await action('complete-withdrawal', { withdraw_id: second.data.withdraw_id })
  assert.equal(account.available, 700)
  await action('complete-withdrawal', {
    withdraw_id: second.data.withdraw_id,
    status: 'REFUND',
  })
  await action('complete-withdrawal', {
    withdraw_id: second.data.withdraw_id,
    status: 'REFUND',
  })
  assert.equal(account.available, 1000)
  const result = await request(
    'GET',
    `/v3/ecommerce/fund/withdraw/${second.data.withdraw_id}?sub_mchid=${defaults.subMchid}`,
  )
  assert.equal(result.data.status, 'REFUND')
  assert.equal(
    (
      await request('POST', '/v3/ecommerce/fund/withdraw', {
        ...body,
        out_request_no: 'WITHDRAW03',
        amount: 1001,
      })
    ).data.code,
    'NOT_ENOUGH',
  )
  assert.equal(runtime.store.values('withdrawals').length, 2)
})

test('日终余额使用固定快照并遵循留存额和允许当前余额选项', async () => {
  const { request, runtime, account } = fixture({ sharing: false })
  const day = new Date(Date.parse(runtime.now()) - 86_400_000)
    .toISOString()
    .slice(0, 10)
  await request(
    'GET',
    `/v3/ecommerce/fund/enddaybalance/${defaults.subMchid}?date=${day}`,
  )
  account.available = 800
  const body = {
    sub_mchid: defaults.subMchid,
    out_request_no: 'DAY01',
    calculate_amount_type: 'ONLY_DAY_END_BALANCE',
    reserve_amount: 100,
  }
  assert.equal(
    (
      await request(
        'POST',
        '/v3/platsolution/ecommerce/withdraw/day-end-balance-withdraw',
        body,
      )
    ).data.code,
    'NOT_ENOUGH',
  )
  const result = await request(
    'POST',
    '/v3/platsolution/ecommerce/withdraw/day-end-balance-withdraw',
    {
      ...body,
      out_request_no: 'DAY02',
      calculate_amount_type: 'ALLOW_CURRENT_BALANCE',
    },
  )
  assert.equal(result.response.status, 200)
  assert.equal(result.data.total_amount, 700)
  assert.equal(account.available, 100)
  assert.equal(
    (
      await request(
        'GET',
        `/v3/ecommerce/fund/enddaybalance/${defaults.subMchid}?date=2026-02-30`,
      )
    ).data.code,
    'PARAM_ERROR',
  )
})

test('资金出境预占订单额度，失败释放余额和额度，成功扣减额度', async () => {
  const { request, order, account, action } = fixture({ sharing: false })
  const body = {
    sub_mchid: order.sub_mchid,
    transaction_id: order.transaction_id,
    out_order_id: 'ABROAD01',
    amount: 400,
    foreign_currency: 'USD',
    goods_info: [
      {
        goods_name: '商品',
        goods_category: '服饰',
        goods_unit_price: 400,
        goods_quantity: 1,
      },
    ],
    seller_info: {
      oversea_business_name: '测试公司',
      oversea_shop_name: '测试店',
      seller_id: 'SELLER01',
    },
    payee_info: { payee_id: 'PAYEE01' },
    express_info: { courier_number: 'EXPRESS01', express_company_name: 'MOCK' },
  }
  const first = await request('POST', '/v3/funds-to-oversea/orders', body)
  assert.equal(first.response.status, 200)
  assert.equal(first.data.result, 'ACCEPT')
  assert.equal(account.available, 600)
  const path = `/v3/funds-to-oversea/transactions/${order.transaction_id}/available_abroad_amounts?sub_mchid=${order.sub_mchid}`
  assert.equal((await request('GET', path)).data.available_abroad_amount, 600)
  await action('complete-overseas', {
    sub_mchid: order.sub_mchid,
    out_order_id: 'ABROAD01',
    success: false,
  })
  assert.equal(account.available, 1000)
  assert.equal((await request('GET', path)).data.available_abroad_amount, 1000)
  await request('POST', '/v3/funds-to-oversea/orders', {
    ...body,
    out_order_id: 'ABROAD02',
  })
  await action('complete-overseas', {
    sub_mchid: order.sub_mchid,
    out_order_id: 'ABROAD02',
  })
  assert.equal(account.available, 600)
  assert.equal(account.frozen, 0)
  assert.equal((await request('GET', path)).data.available_abroad_amount, 600)
  assert.equal(
    (
      await request('POST', '/v3/funds-to-oversea/orders', {
        ...body,
        out_order_id: 'ABROAD03',
        amount: 601,
      })
    ).data.code,
    'DEPARTURE_AMOUNT_NO_ENOUGH',
  )
})

test('交易账单提供真实 CSV 下载和解压后 SHA1 校验', async () => {
  const { app, request, runtime } = fixture({ sharing: false })
  const result = await request(
    'GET',
    `/v3/bill/tradebill?bill_date=${runtime.now().slice(0, 10)}&tar_type=GZIP`,
  )
  assert.equal(result.response.status, 200)
  const download = await app.request(String(result.data.download_url))
  assert.equal(download.headers.get('Content-Type'), 'application/gzip')
  const raw = gunzipSync(Buffer.from(await download.arrayBuffer()))
  assert.equal(
    createHash('sha1').update(raw).digest('hex'),
    result.data.hash_value,
  )
  assert.match(raw.toString('utf8'), /TRADE01/)
  assert.match(raw.toString('utf8'), /总交易单数/)
  const url = new URL(String(result.data.download_url))
  const bill = runtime.store.get<{ expires_at: number }>(
    'bills',
    url.searchParams.get('token')!,
  )!
  bill.expires_at = 0
  assert.equal(
    (await request('GET', url.pathname + url.search)).data.code,
    'INVALID_REQUEST',
  )
})

test('二级商户资金账单密钥可经商户 RSA 私钥解密，AES-GCM 解密后金额和摘要一致', async () => {
  const { app, request, runtime } = fixture({ sharing: false })
  const result = await request(
    'GET',
    `/v3/ecommerce/bill/fundflowbill?bill_date=${runtime.now().slice(0, 10)}&account_type=ALL&algorithm=AEAD_AES_256_GCM&tar_type=GZIP`,
  )
  assert.equal(result.response.status, 200)
  assert.equal(result.data.download_bill_count, 1)
  const file = (result.data.download_bill_list as Data[])[0]
  const key = privateDecrypt(
    {
      key: crypto.merchantPrivateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha1',
    },
    Buffer.from(String(file.encrypt_key), 'base64'),
  )
  const download = await app.request(String(file.download_url))
  const encrypted = Buffer.from(await download.arrayBuffer())
  const decipher = createDecipheriv('aes-256-gcm', key, String(file.nonce))
  decipher.setAuthTag(encrypted.subarray(-16))
  const raw = gunzipSync(
    Buffer.concat([
      decipher.update(encrypted.subarray(0, -16)),
      decipher.final(),
    ]),
  )
  assert.equal(createHash('sha1').update(raw).digest('hex'), file.hash_value)
  assert.match(raw.toString('utf8'), /交易,收入,10.00/)
})

test('垫付退款资金账单记实际平台出资，并包含回补双方流水', async () => {
  const { app, request, runtime, order, account, action } = fixture({
    sharing: false,
  })
  registerPayments(runtime)
  account.available = 0
  runtime.account(defaults.spMchid).available = 1000
  const refund = await request('POST', '/v3/ecommerce/refunds/apply', {
    sub_mchid: order.sub_mchid,
    sp_appid: order.sp_appid,
    out_trade_no: order.out_trade_no,
    out_refund_no: 'ADVANCE01',
    refund_account: 'REFUND_SOURCE_PARTNER_ADVANCE',
    amount: { total: 1000, refund: 500, currency: 'CNY' },
  })
  assert.equal(refund.response.status, 200)
  await action('complete-refund', {
    sub_mchid: order.sub_mchid,
    refund_id: refund.data.refund_id,
  })
  const date = runtime.now().slice(0, 10)
  const first = await request('GET', `/v3/bill/fundflowbill?bill_date=${date}`)
  const raw = await (await app.request(String(first.data.download_url))).text()
  assert.match(raw, /退款,支出,5.00/)
  account.available = 500
  assert.equal(
    (
      await request(
        'POST',
        `/v3/ecommerce/refunds/${refund.data.refund_id}/return-advance`,
        { sub_mchid: order.sub_mchid },
      )
    ).response.status,
    200,
  )
  const second = await request('GET', `/v3/bill/fundflowbill?bill_date=${date}`)
  const reimbursed = await (
    await app.request(String(second.data.download_url))
  ).text()
  assert.match(reimbursed, /垫付退款回补,收入,5.00/)
  assert.equal(runtime.account(defaults.spMchid).available, 1000)
  assert.equal(account.available, 0)
})
