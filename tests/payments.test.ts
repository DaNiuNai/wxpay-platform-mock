import assert from 'node:assert/strict'
import test from 'node:test'
import { createApp } from '../src/app.js'
import type { Data, Order } from '../src/types.js'

type Mock = ReturnType<typeof createApp>

async function request(
  mock: Mock,
  method: string,
  path: string,
  body?: Data,
  expected = 200,
): Promise<Data> {
  const response = await mock.app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const result =
    response.status === 204 ? {} : ((await response.json()) as Data)
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: ${JSON.stringify(result)}`,
  )
  return result
}

function orderBody(mock: Mock, number: string, extra: Data = {}): Data {
  return {
    sp_mchid: mock.runtime.config.spMchid,
    sp_appid: mock.runtime.config.spAppid,
    sub_mchid: mock.runtime.config.subMchid,
    out_trade_no: number,
    description: '联调商品',
    notify_url: 'http://127.0.0.1:9000/payment-notify',
    amount: { total: 1000, currency: 'CNY' },
    payer: { sp_openid: 'openid-test' },
    attach: '业务附加数据',
    ...extra,
  }
}

function queryPath(
  mock: Mock,
  number: string,
  mchid = mock.runtime.config.subMchid,
): string {
  return `/v3/pay/partner/transactions/out-trade-no/${number}?sp_mchid=${mock.runtime.config.spMchid}&sub_mchid=${mchid}`
}

function refundBody(
  mock: Mock,
  number: string,
  refundNumber: string,
  refund = 500,
  extra: Data = {},
): Data {
  return {
    sub_mchid: mock.runtime.config.subMchid,
    sp_appid: mock.runtime.config.spAppid,
    out_trade_no: number,
    out_refund_no: refundNumber,
    amount: { total: 1000, refund, currency: 'CNY' },
    notify_url: 'http://127.0.0.1:9000/refund-notify',
    ...extra,
  }
}

test('四种普通支付场景、幂等支付、资金入账、查询隔离和关单', async (t) => {
  const mock = createApp({
    dataDir: null,
    callbacks: false,
    config: { autoPay: false },
  })
  t.after(() => mock.close())
  const before = mock.runtime.account(mock.runtime.config.subMchid).available
  for (const kind of ['jsapi', 'app', 'native', 'h5']) {
    const number = `single-${kind}`
    const body = orderBody(
      mock,
      number,
      kind === 'h5'
        ? {
            scene_info: {
              payer_client_ip: '127.0.0.1',
              h5_info: { type: 'Wap' },
            },
          }
        : {},
    )
    const created = await request(
      mock,
      'POST',
      `/v3/pay/partner/transactions/${kind}`,
      body,
    )
    assert.ok(
      created[
        kind === 'native' ? 'code_url' : kind === 'h5' ? 'h5_url' : 'prepay_id'
      ],
    )
    assert.deepEqual(
      await request(mock, 'POST', `/v3/pay/partner/transactions/${kind}`, body),
      created,
    )
    assert.equal(
      (await request(mock, 'GET', queryPath(mock, number))).trade_state,
      'NOTPAY',
    )
    const changed = await mock.app.request(
      `/v3/pay/partner/transactions/${kind}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, amount: { total: 900 } }),
      },
    )
    assert.notEqual(changed.status, 200)
    await mock.runtime.actions.get('pay')!({ out_trade_no: number })
    await mock.runtime.actions.get('pay')!({ out_trade_no: number })
    const queried = await request(mock, 'GET', queryPath(mock, number))
    assert.equal(queried.trade_state, 'SUCCESS')
    assert.equal(queried.attach, '业务附加数据')
    assert.ok(queried.success_time)
    assert.equal(
      (
        await request(
          mock,
          'GET',
          `/v3/pay/partner/transactions/id/${queried.transaction_id}?sp_mchid=${mock.runtime.config.spMchid}&sub_mchid=${mock.runtime.config.subMchid}`,
        )
      ).out_trade_no,
      number,
    )
    await request(
      mock,
      'GET',
      queryPath(mock, number, 'other-merchant'),
      undefined,
      404,
    )
    await request(
      mock,
      'GET',
      queryPath(mock, number).replace(
        mock.runtime.config.spMchid,
        'another-platform',
      ),
      undefined,
      403,
    )
    await request(
      mock,
      'POST',
      `/v3/pay/partner/transactions/out-trade-no/${number}/close`,
      {
        sp_mchid: mock.runtime.config.spMchid,
        sub_mchid: mock.runtime.config.subMchid,
      },
      400,
    )
  }
  assert.equal(
    mock.runtime.account(mock.runtime.config.subMchid).available,
    before + 4000,
  )
  const notifications = mock.runtime.store.values<{ body: Data }>(
    'notifications',
  )
  assert.equal(notifications.length, 4)
  assert.ok(
    notifications.every(
      (notification) => notification.body.event_type === 'TRANSACTION.SUCCESS',
    ),
  )
  const resource = mock.runtime.crypto.decryptResource(
    notifications[0]!.body.resource as Data,
  ) as Data
  assert.equal(resource.trade_state, 'SUCCESS')
  assert.equal((resource.amount as Data).payer_total, 1000)
  await request(
    mock,
    'POST',
    '/v3/pay/partner/transactions/jsapi',
    orderBody(mock, 'close-me'),
  )
  await request(
    mock,
    'POST',
    '/v3/pay/partner/transactions/out-trade-no/close-me/close',
    {
      sp_mchid: mock.runtime.config.spMchid,
      sub_mchid: mock.runtime.config.subMchid,
    },
    204,
  )
  assert.equal(
    (await request(mock, 'GET', queryPath(mock, 'close-me'))).trade_state,
    'CLOSED',
  )
  assert.throws(() =>
    mock.runtime.actions.get('pay')!({ out_trade_no: 'close-me' }),
  )
})

test('支付参数、过期支付和注销商户校验不会产生资金变动', async (t) => {
  const mock = createApp({ dataDir: null, callbacks: false })
  t.after(() => mock.close())
  await request(
    mock,
    'POST',
    '/v3/pay/partner/transactions/jsapi',
    orderBody(mock, 'bad-zero', { amount: { total: 0 } }),
    400,
  )
  await request(
    mock,
    'POST',
    '/v3/pay/partner/transactions/jsapi',
    orderBody(mock, 'bad-float', { amount: { total: 1.5 } }),
    400,
  )
  await request(
    mock,
    'POST',
    '/v3/pay/partner/transactions/jsapi',
    orderBody(mock, 'bad-currency', {
      amount: { total: 1000, currency: 'USD' },
    }),
    400,
  )
  await request(
    mock,
    'POST',
    '/v3/pay/partner/transactions/jsapi',
    orderBody(mock, 'bad-payer', { payer: {} }),
    400,
  )
  await request(
    mock,
    'POST',
    '/v3/pay/partner/transactions/jsapi',
    orderBody(mock, 'bad-sub-payer', { payer: { sub_openid: 'sub-openid' } }),
    400,
  )
  await request(
    mock,
    'POST',
    '/v3/pay/partner/transactions/jsapi',
    orderBody(mock, 'expire-me'),
  )
  const order = mock.runtime.store.get<Order & { time_expire: string }>(
    'orders',
    `${mock.runtime.config.subMchid}:expire-me`,
  )!
  order.time_expire = '2000-01-01T00:00:00Z'
  const before = mock.runtime.account(mock.runtime.config.subMchid).available
  assert.throws(() =>
    mock.runtime.actions.get('pay')!({ out_trade_no: 'expire-me' }),
  )
  assert.equal(
    mock.runtime.account(mock.runtime.config.subMchid).available,
    before,
  )
  mock.runtime.store.set('merchants', 'cancelled-merchant', {
    merchant_state: 'HAS_BEEN_CANCELLED',
  })
  await request(
    mock,
    'POST',
    '/v3/pay/partner/transactions/jsapi',
    orderBody(mock, 'cancelled-order', { sub_mchid: 'cancelled-merchant' }),
    403,
  )
})

test('退款处理中预占、超额拦截、关闭释放和异常退款处理', async (t) => {
  const mock = createApp({
    dataDir: null,
    callbacks: false,
    config: { autoComplete: false },
  })
  t.after(() => mock.close())
  const mchid = mock.runtime.config.subMchid
  const frozenBefore = mock.runtime.account(mchid).frozen
  await request(
    mock,
    'POST',
    '/v3/pay/partner/transactions/jsapi',
    orderBody(mock, 'refund-order', { settle_info: { profit_sharing: true } }),
  )
  await mock.runtime.actions.get('pay')!({ out_trade_no: 'refund-order' })
  assert.equal(mock.runtime.account(mchid).frozen, frozenBefore + 1000)
  const body = refundBody(mock, 'refund-order', 'refund-pending', 800)
  const refund = await request(
    mock,
    'POST',
    '/v3/ecommerce/refunds/apply',
    body,
  )
  assert.equal(refund.status, 'PROCESSING')
  assert.deepEqual(
    await request(mock, 'POST', '/v3/ecommerce/refunds/apply', body),
    refund,
  )
  assert.equal(mock.runtime.account(mchid).frozen, frozenBefore + 200)
  assert.equal(
    mock.runtime.store.get<Order>('orders', `${mchid}:refund-order`)!.remaining,
    200,
  )
  await request(
    mock,
    'POST',
    '/v3/ecommerce/refunds/apply',
    refundBody(mock, 'refund-order', 'refund-over', 300),
    400,
  )
  await request(
    mock,
    'GET',
    `/v3/ecommerce/refunds/id/${refund.refund_id}?sub_mchid=another-merchant`,
    undefined,
    404,
  )
  await mock.runtime.actions.get('complete-refund')!({
    refund_id: refund.refund_id,
    status: 'CLOSED',
  })
  assert.equal(mock.runtime.account(mchid).frozen, frozenBefore + 1000)
  assert.equal(
    mock.runtime.store.get<Order>('orders', `${mchid}:refund-order`)!.remaining,
    1000,
  )
  assert.equal(
    (await request(mock, 'POST', '/v3/ecommerce/refunds/apply', body)).status,
    'CLOSED',
  )
  const abnormal = await request(
    mock,
    'POST',
    '/v3/ecommerce/refunds/apply',
    refundBody(mock, 'refund-order', 'refund-abnormal'),
  )
  await mock.runtime.actions.get('complete-refund')!({
    refund_id: abnormal.refund_id,
    status: 'ABNORMAL',
  })
  await request(
    mock,
    'POST',
    `/v3/ecommerce/refunds/${abnormal.refund_id}/apply-abnormal-refund`,
    {
      sub_mchid: mchid,
      out_refund_no: 'refund-abnormal',
      type: 'MERCHANT_BANK_CARD',
    },
  )
  await mock.runtime.actions.get('complete-refund')!({
    refund_id: abnormal.refund_id,
  })
  await mock.runtime.actions.get('complete-refund')!({
    refund_id: abnormal.refund_id,
  })
  const result = await request(
    mock,
    'GET',
    `/v3/ecommerce/refunds/out-refund-no/refund-abnormal?sub_mchid=${mchid}`,
  )
  assert.equal(result.status, 'SUCCESS')
  assert.equal(result.channel, 'OTHER_BANKCARD')
  assert.equal(mock.runtime.account(mchid).frozen, frozenBefore + 500)
  assert.equal(
    mock.runtime.store.get<Order>('orders', `${mchid}:refund-order`)!.refunded,
    500,
  )
  const notifications = mock.runtime.store.values<{ body: Data }>(
    'notifications',
  )
  const successNotification = notifications.find(
    (notification) => notification.body.event_type === 'REFUND.SUCCESS',
  )!
  const resource = mock.runtime.crypto.decryptResource(
    successNotification.body.resource as Data,
  ) as Data
  assert.equal(resource.sp_mchid, mock.runtime.config.spMchid)
  assert.equal(resource.sub_mchid, mchid)
  assert.equal(resource.refund_status, 'SUCCESS')
  assert.equal((resource.amount as Data).payer_total, 1000)
})

test('退款可指定两个出资账户，金额不匹配或重复账户会拒绝', async (t) => {
  const mock = createApp({ dataDir: null, callbacks: false })
  t.after(() => mock.close())
  const mchid = mock.runtime.config.subMchid
  mock.runtime.account(mchid).available = 1000
  await request(
    mock,
    'POST',
    '/v3/pay/partner/transactions/jsapi',
    orderBody(mock, 'split-refund', { settle_info: { profit_sharing: true } }),
  )
  await mock.runtime.actions.get('pay')!({ out_trade_no: 'split-refund' })
  await request(
    mock,
    'POST',
    '/v3/ecommerce/refunds/apply',
    refundBody(mock, 'split-refund', 'wrong-from', 500, {
      amount: {
        total: 1000,
        refund: 500,
        from: [{ account: 'AVAILABLE', amount: 200 }],
      },
    }),
    400,
  )
  await request(
    mock,
    'POST',
    '/v3/ecommerce/refunds/apply',
    refundBody(mock, 'split-refund', 'duplicate-from', 500, {
      amount: {
        total: 1000,
        refund: 500,
        from: [
          { account: 'AVAILABLE', amount: 200 },
          { account: 'AVAILABLE', amount: 300 },
        ],
      },
    }),
    400,
  )
  const refund = await request(
    mock,
    'POST',
    '/v3/ecommerce/refunds/apply',
    refundBody(mock, 'split-refund', 'correct-from', 500, {
      amount: {
        total: 1000,
        refund: 500,
        from: [
          { account: 'AVAILABLE', amount: 200 },
          { account: 'UNAVAILABLE', amount: 300 },
        ],
      },
    }),
  )
  assert.equal(refund.status, 'SUCCESS')
  assert.equal(mock.runtime.account(mchid).available, 800)
  assert.equal(
    mock.runtime.store.get<Order>('orders', `${mchid}:split-refund`)!.remaining,
    700,
  )
})

test('合单原子下单、完整关单和一次支付所有商品单', async (t) => {
  const mock = createApp({ dataDir: null, callbacks: false })
  t.after(() => mock.close())
  const mchid = mock.runtime.config.subMchid
  const makeSub = (number: string, total: number, subMchid = mchid): Data => ({
    mchid: mock.runtime.config.spMchid,
    sub_mchid: subMchid,
    out_trade_no: number,
    amount: { total_amount: total, currency: 'CNY' },
    description: '合单商品',
    attach: '合单附加数据',
  })
  const combineBody: Data = {
    combine_appid: mock.runtime.config.spAppid,
    combine_mchid: mock.runtime.config.spMchid,
    combine_out_trade_no: 'combine-main',
    combine_payer_info: { openid: 'combined-openid' },
    sub_orders: [
      makeSub('combine-child-a', 700),
      makeSub('combine-child-b', 300, 'second-merchant'),
    ],
    notify_url: 'http://127.0.0.1:9000/combined-notify',
  }
  const prepay = await request(
    mock,
    'POST',
    '/v3/combine-transactions/jsapi',
    combineBody,
  )
  assert.deepEqual(
    await request(mock, 'POST', '/v3/combine-transactions/jsapi', combineBody),
    prepay,
  )
  await request(
    mock,
    'POST',
    '/v3/combine-transactions/jsapi',
    {
      ...combineBody,
      combine_out_trade_no: 'combine-invalid',
      sub_orders: [
        makeSub('should-not-exist', 700),
        makeSub('combine-child-a', 300),
      ],
    },
    403,
  )
  assert.equal(
    mock.runtime.store.get('orders', `${mchid}:should-not-exist`),
    undefined,
  )
  await request(
    mock,
    'POST',
    '/v3/combine-transactions/out-trade-no/combine-main/close',
    {
      combine_appid: mock.runtime.config.spAppid,
      sub_orders: [makeSub('combine-child-a', 700)],
    },
    400,
  )
  await request(
    mock,
    'POST',
    '/v3/pay/partner/transactions/out-trade-no/combine-child-a/close',
    {
      sp_mchid: mock.runtime.config.spMchid,
      sub_mchid: mchid,
    },
    400,
  )
  const firstBefore = mock.runtime.account(mchid).available
  const secondBefore = mock.runtime.account('second-merchant').available
  await mock.runtime.actions.get('pay')!({ prepay_id: prepay.prepay_id })
  await mock.runtime.actions.get('pay')!({
    combine_out_trade_no: 'combine-main',
  })
  const queried = await request(
    mock,
    'GET',
    '/v3/combine-transactions/out-trade-no/combine-main',
  )
  assert.ok(
    (queried.sub_orders as Data[]).every(
      (order) => order.trade_state === 'SUCCESS',
    ),
  )
  assert.equal(mock.runtime.account(mchid).available, firstBefore + 700)
  assert.equal(
    mock.runtime.account('second-merchant').available,
    secondBefore + 300,
  )
  const notifications = mock.runtime.store.values<{ body: Data }>(
    'notifications',
  )
  assert.equal(notifications.length, 1)
  assert.equal(
    (notifications[0]!.body.resource as Data).original_type,
    'transaction',
  )
  const resource = mock.runtime.crypto.decryptResource(
    notifications[0]!.body.resource as Data,
  ) as Data
  assert.equal(resource.combine_out_trade_no, 'combine-main')
  assert.equal((resource.sub_orders as Data[]).length, 2)
  await request(mock, 'POST', '/v3/combine-transactions/jsapi', {
    ...combineBody,
    combine_out_trade_no: 'combine-close',
    sub_orders: [makeSub('close-child-a', 200), makeSub('close-child-b', 300)],
  })
  await request(
    mock,
    'POST',
    '/v3/combine-transactions/out-trade-no/combine-close/close',
    {
      combine_appid: mock.runtime.config.spAppid,
      sub_orders: ['close-child-a', 'close-child-b'].map((number) => ({
        mchid: mock.runtime.config.spMchid,
        sub_mchid: mchid,
        out_trade_no: number,
      })),
    },
    204,
  )
  assert.ok(
    (
      (
        await request(
          mock,
          'GET',
          '/v3/combine-transactions/out-trade-no/combine-close',
        )
      ).sub_orders as Data[]
    ).every((order) => order.trade_state === 'CLOSED'),
  )
})

test('平台垫付退款与回补重试不会重复扣款', async (t) => {
  const mock = createApp({ dataDir: null, callbacks: false })
  t.after(() => mock.close())
  const mchid = mock.runtime.config.subMchid
  const platform = mock.runtime.account(mock.runtime.config.spMchid)
  platform.available = 5000
  await request(
    mock,
    'POST',
    '/v3/pay/partner/transactions/jsapi',
    orderBody(mock, 'advance-order'),
  )
  await mock.runtime.actions.get('pay')!({ out_trade_no: 'advance-order' })
  mock.runtime.account(mchid).available = 0
  const refund = await request(
    mock,
    'POST',
    '/v3/ecommerce/refunds/apply',
    refundBody(mock, 'advance-order', 'advance-refund', 500, {
      refund_account: 'REFUND_SOURCE_PARTNER_ADVANCE',
    }),
  )
  assert.equal(refund.refund_account, 'REFUND_SOURCE_PARTNER_ADVANCE')
  assert.equal(platform.available, 4500)
  const path = `/v3/ecommerce/refunds/${refund.refund_id}/return-advance`
  assert.equal(
    (await request(mock, 'POST', path, { sub_mchid: mchid })).result,
    'PROCESSING',
  )
  mock.runtime.account(mchid).available = 500
  const completed = await request(mock, 'POST', path, { sub_mchid: mchid })
  assert.equal(completed.result, 'SUCCESS')
  assert.deepEqual(
    await request(mock, 'POST', path, { sub_mchid: mchid }),
    completed,
  )
  assert.equal(platform.available, 5000)
  assert.equal(mock.runtime.account(mchid).available, 0)
  assert.deepEqual(
    await request(mock, 'GET', `${path}?sub_mchid=${mchid}`),
    completed,
  )
  await request(
    mock,
    'GET',
    `${path}?sub_mchid=another-merchant`,
    undefined,
    404,
  )
})
