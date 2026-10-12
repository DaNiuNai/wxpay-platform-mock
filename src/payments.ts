import { arr, fail, int, obj, str } from './core.js'
import type { Runtime } from './core.js'
import type { Data, Order } from './types.js'

type PaymentOrder = Order & { time_expire: string; scene_info?: Data }
type RefundStatus = 'PROCESSING' | 'SUCCESS' | 'CLOSED' | 'ABNORMAL'
interface Refund {
  refund_id: string
  out_refund_no: string
  sub_mchid: string
  sp_appid: string
  transaction_id: string
  out_trade_no: string
  create_time: string
  success_time?: string
  status: RefundStatus
  channel: string
  user_received_account: string
  amount: {
    refund: number
    total: number
    payer_refund: number
    currency: string
    advance?: number
    from?: Data[]
  }
  refund_account: string
  funds_account: string
  notify_url?: string
  reservations: {
    mchid: string
    balance: 'available' | 'frozen'
    amount: number
    orderAmount: number
  }[]
}
interface Combined {
  combine_appid: string
  combine_mchid: string
  combine_out_trade_no: string
  combine_payer_info: Data
  notify_url?: string
  prepay_id: string
  trade_type: string
  order_keys: string[]
}

const ORDER_STATES: Record<string, string> = {
  NOTPAY: '订单未支付',
  SUCCESS: '支付成功',
  REFUND: '转入退款',
  CLOSED: '订单已关闭',
  PAYERROR: '支付失败',
}
const orderKey = (mchid: string, outTradeNo: string) => `${mchid}:${outTradeNo}`

function optionalObject(value: unknown): Data {
  return value === undefined ? {} : obj(value)
}

function boundedString(
  data: Data,
  key: string,
  max: number,
  required = true,
): string {
  const value = str(data, key, required)
  if (value.length > max) fail(400, 'PARAM_ERROR', `${key} 长度不能超过 ${max}`)
  return value
}

function merchant(runtime: Runtime, mchid: string): void {
  if (mchid !== runtime.config.spMchid)
    fail(403, 'NO_AUTH', '平台商户号与当前模拟平台不一致')
}

function identifier(
  data: Data,
  field: string,
  max = 32,
  extended = false,
): string {
  const value = boundedString(data, field, max)
  const pattern = extended
    ? max === 64
      ? /^[a-zA-Z0-9_\-|*@]+$/
      : /^[a-zA-Z0-9_\-|*]+$/
    : /^[a-zA-Z0-9_\-*]+$/
  if (!pattern.test(value)) {
    fail(400, 'PARAM_ERROR', `${field} 包含非法字符`)
  }
  if (extended && max === 32 && value.length < 2)
    fail(400, 'PARAM_ERROR', `${field} 至少需要 2 个字符`)
  return value
}

function currency(data: Data, required = false): string {
  const value = str(data, 'currency', required) || 'CNY'
  if (value !== 'CNY') fail(400, 'PARAM_ERROR', '仅支持 CNY 币种')
  return value
}

function notificationUrl(data: Data, required: boolean): string | undefined {
  const value = boundedString(data, 'notify_url', 256, required)
  if (!value) return undefined
  let url: URL
  try {
    url = new URL(value)
  } catch {
    fail(400, 'PARAM_ERROR', 'notify_url 必须是有效的 HTTP(S) URL')
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    fail(
      400,
      'PARAM_ERROR',
      'notify_url 必须使用 HTTP(S)，不能携带参数或身份信息',
    )
  }
  return value
}

function expiration(runtime: Runtime, data: Data, combined: boolean): string {
  const now = Date.parse(runtime.now())
  const supplied = str(data, 'time_expire', false)
  if (!supplied) return new Date(now + 7 * 86400_000).toISOString()
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      supplied,
    ) ||
    !Number.isFinite(Date.parse(supplied))
  ) {
    fail(400, 'PARAM_ERROR', 'time_expire 必须符合 RFC3339')
  }
  const maximum = now + (combined ? 7 : 15) * 86400_000
  return new Date(
    Math.min(maximum, Math.max(now + 60_000, Date.parse(supplied))),
  ).toISOString()
}

function orderView(order: PaymentOrder): Data {
  return {
    sp_appid: order.sp_appid,
    sp_mchid: order.sp_mchid,
    ...(order.sub_appid ? { sub_appid: order.sub_appid } : {}),
    sub_mchid: order.sub_mchid,
    out_trade_no: order.out_trade_no,
    ...(order.success_time
      ? {
          transaction_id: order.transaction_id,
          bank_type: 'OTHERS',
          success_time: order.success_time,
        }
      : {}),
    trade_type: order.trade_type,
    trade_state: order.trade_state,
    trade_state_desc: ORDER_STATES[order.trade_state] ?? order.trade_state,
    ...(order.success_time && order.attach !== undefined
      ? { attach: order.attach }
      : {}),
    payer: order.payer,
    amount: order.amount,
    ...(order.scene_info ? { scene_info: order.scene_info } : {}),
  }
}

function combinedView(runtime: Runtime, combined: Combined): Data {
  return {
    combine_appid: combined.combine_appid,
    combine_mchid: combined.combine_mchid,
    combine_out_trade_no: combined.combine_out_trade_no,
    combine_payer_info: combined.combine_payer_info,
    sub_orders: combined.order_keys.map((key) => {
      const order = runtime.store.get<PaymentOrder>('orders', key)!
      return {
        mchid: order.sp_mchid,
        sub_mchid: order.sub_mchid,
        ...(order.sub_appid ? { sub_appid: order.sub_appid } : {}),
        out_trade_no: order.out_trade_no,
        trade_state: order.trade_state,
        trade_type: order.trade_type,
        ...(order.attach !== undefined ? { attach: order.attach } : {}),
        ...(order.success_time
          ? {
              transaction_id: order.transaction_id,
              success_time: order.success_time,
              bank_type: 'OTHERS',
            }
          : {}),
        amount: {
          total_amount: order.amount.total,
          currency: order.amount.currency,
          ...(order.success_time
            ? { payer_amount: order.amount.payer_total, payer_currency: 'CNY' }
            : {}),
        },
      }
    }),
  }
}

function refundView(refund: Refund): Data {
  const {
    reservations: _reservations,
    notify_url: _notifyUrl,
    sp_appid: _spAppid,
    sub_mchid: _subMchid,
    ...view
  } = refund
  return view
}

function refundNotification(refund: Refund): Data {
  return {
    ...refundView(refund),
    sub_mchid: refund.sub_mchid,
    refund_status: refund.status,
    amount: { ...refund.amount, payer_total: refund.amount.total },
  }
}

function prepayResponse(
  runtime: Runtime,
  order: { prepay_id: string; trade_type: string },
): Data {
  if (order.trade_type === 'NATIVE')
    return { code_url: `weixin://wxpay/bizpayurl?pr=${order.prepay_id}` }
  if (order.trade_type === 'MWEB')
    return {
      h5_url: `${runtime.config.baseUrl}/mock/cashier?prepay_id=${encodeURIComponent(order.prepay_id)}`,
    }
  return { prepay_id: order.prepay_id }
}

function buildOrder(
  runtime: Runtime,
  body: Data,
  tradeType: string,
  combined?: Combined,
): PaymentOrder {
  const spMchid = str(body, 'sp_mchid')
  merchant(runtime, spMchid)
  const spAppid = boundedString(body, 'sp_appid', 32)
  const subMchid = boundedString(body, 'sub_mchid', 32)
  const subMerchant = runtime.store.get<Data>('merchants', subMchid)
  if (subMerchant?.merchant_state === 'HAS_BEEN_CANCELLED')
    fail(403, 'NO_AUTH', '二级商户已注销')
  const subAppid = boundedString(body, 'sub_appid', 32, false)
  const outTradeNo = identifier(body, 'out_trade_no', 32, Boolean(combined))
  const amount = obj(body.amount)
  const total = int(amount, 'total', 1)
  const payer = optionalObject(body.payer)
  if (tradeType === 'JSAPI' && !combined) {
    if (!str(payer, 'sp_openid', false) && !str(payer, 'sub_openid', false))
      fail(
        400,
        'PARAM_ERROR',
        'payer.sp_openid 和 payer.sub_openid 至少指定一个',
      )
    if (payer.sub_openid && !subAppid)
      fail(400, 'PARAM_ERROR', '使用 sub_openid 时必须指定 sub_appid')
  }
  const sceneInfo =
    body.scene_info === undefined ? undefined : obj(body.scene_info)
  if (tradeType === 'MWEB') {
    str(obj(sceneInfo), 'payer_client_ip')
    if (!combined) str(obj(obj(sceneInfo).h5_info), 'type')
  }
  const settleInfo = optionalObject(body.settle_info)
  if (
    settleInfo.profit_sharing !== undefined &&
    typeof settleInfo.profit_sharing !== 'boolean'
  )
    fail(400, 'PARAM_ERROR', 'settle_info.profit_sharing 必须为布尔值')
  if (
    settleInfo.subsidy_amount !== undefined &&
    int(settleInfo, 'subsidy_amount') > 500_000
  )
    fail(400, 'PARAM_ERROR', '单笔订单补差金额不能超过 500000 分')
  const notifyUrl = combined ? combined.notify_url : notificationUrl(body, true)
  return {
    sp_appid: spAppid,
    sp_mchid: spMchid,
    ...(subAppid ? { sub_appid: subAppid } : {}),
    sub_mchid: subMchid,
    out_trade_no: outTradeNo,
    transaction_id: runtime.id('transaction'),
    prepay_id: combined?.prepay_id ?? runtime.id('prepay'),
    trade_type: tradeType,
    trade_state: 'NOTPAY',
    description: boundedString(body, 'description', 127),
    amount: { total, currency: currency(amount) },
    payer: Object.keys(payer).length ? payer : { sp_openid: 'mock-openid' },
    ...(body.attach !== undefined
      ? { attach: boundedString(body, 'attach', 128, false) }
      : {}),
    notify_url: notifyUrl ?? '',
    settle_info: settleInfo,
    create_time: runtime.now(),
    time_expire: expiration(runtime, body, Boolean(combined)),
    ...(sceneInfo ? { scene_info: sceneInfo } : {}),
    ...(combined
      ? { combine_out_trade_no: combined.combine_out_trade_no }
      : {}),
    refunded: 0,
    remaining: settleInfo.profit_sharing ? total : 0,
    sharing_finished: !settleInfo.profit_sharing,
  }
}

function payable(runtime: Runtime, order: PaymentOrder): void {
  if (order.trade_state === 'CLOSED') fail(400, 'ORDER_CLOSED', '订单已关闭')
  if (
    order.trade_state !== 'NOTPAY' &&
    order.trade_state !== 'SUCCESS' &&
    order.trade_state !== 'REFUND'
  )
    fail(400, 'INVALID_REQUEST', '订单状态不支持支付')
  if (
    order.trade_state === 'NOTPAY' &&
    Date.parse(order.time_expire) <= Date.parse(runtime.now())
  )
    fail(400, 'ORDER_CLOSED', '订单已超过支付结束时间')
}

function markPaid(runtime: Runtime, order: PaymentOrder, payer?: Data): void {
  if (order.trade_state === 'SUCCESS' || order.trade_state === 'REFUND') return
  order.trade_state = 'SUCCESS'
  order.success_time = runtime.now()
  if (payer && Object.keys(payer).length) order.payer = payer
  order.amount.payer_total = order.amount.total
  order.amount.payer_currency = order.amount.currency
  const account = runtime.account(order.sub_mchid)
  account[order.settle_info.profit_sharing ? 'frozen' : 'available'] +=
    order.amount.total
  runtime.store.set(
    'orders',
    orderKey(order.sub_mchid, order.out_trade_no),
    order,
  )
}

function payCombined(runtime: Runtime, combined: Combined, payer?: Data): Data {
  const orders = combined.order_keys.map((key) =>
    runtime.store.get<PaymentOrder>('orders', key)!,
  )
  for (const order of orders) payable(runtime, order)
  const changed = orders.some((order) => order.trade_state === 'NOTPAY')
  for (const order of orders) markPaid(runtime, order, payer)
  if (changed)
    runtime.notify(
      combined.notify_url,
      'TRANSACTION.SUCCESS',
      combinedView(runtime, combined),
    )
  return combinedView(runtime, combined)
}

function findOrder(
  runtime: Runtime,
  input: Data,
  requirePlatform = false,
): PaymentOrder {
  if (requirePlatform) merchant(runtime, str(input, 'sp_mchid'))
  const mchid = str(input, 'sub_mchid')
  const transactionId = str(input, 'transaction_id', false)
  const outTradeNo = str(input, 'out_trade_no', false)
  if (!transactionId && !outTradeNo)
    fail(400, 'PARAM_ERROR', 'transaction_id 和 out_trade_no 至少指定一个')
  const order = transactionId
    ? runtime.store
        .values<PaymentOrder>('orders')
        .find(
          (item) =>
            item.sub_mchid === mchid &&
            item.transaction_id === transactionId &&
            Boolean(item.success_time),
        )
    : runtime.store.get<PaymentOrder>('orders', orderKey(mchid, outTradeNo))
  if (
    !order ||
    order.sp_mchid !== runtime.config.spMchid ||
    (outTradeNo && order.out_trade_no !== outTradeNo)
  )
    fail(404, 'ORDER_NOT_EXIST', '订单不存在或不属于指定平台及二级商户')
  return order
}

function findRefund(runtime: Runtime, input: Data): Refund {
  const mchid = str(input, 'sub_mchid')
  const refundId = str(input, 'refund_id', false)
  const outRefundNo = str(input, 'out_refund_no', false)
  const refund = refundId
    ? runtime.store
        .values<Refund>('refunds')
        .find((item) => item.refund_id === refundId && item.sub_mchid === mchid)
    : runtime.store.get<Refund>('refunds', orderKey(mchid, outRefundNo))
  const order =
    refund &&
    runtime.store.get<PaymentOrder>(
      'orders',
      orderKey(refund.sub_mchid, refund.out_trade_no),
    )
  if (!refund || !order || order.sp_mchid !== runtime.config.spMchid)
    fail(404, 'RESOURCE_NOT_EXISTS', '退款单不存在或不属于指定平台及二级商户')
  return refund
}

function completeRefund(
  runtime: Runtime,
  refund: Refund,
  status: RefundStatus,
): Data {
  if (refund.status === status) return refundView(refund)
  if (refund.status === 'SUCCESS' || refund.status === 'CLOSED')
    fail(400, 'INVALID_REQUEST', '已结束的退款不能再次变更状态')
  const order = runtime.store.get<PaymentOrder>(
    'orders',
    orderKey(refund.sub_mchid, refund.out_trade_no),
  )!
  refund.status = status
  if (status === 'SUCCESS') {
    refund.success_time = runtime.now()
    order.refunded += refund.amount.refund
  } else if (status === 'CLOSED') {
    const completedSharing =
      order.sharing_finished &&
      !runtime.store
        .values<Data>('profitsharing')
        .some(
          (item) =>
            item.transaction_id === order.transaction_id &&
            item.status === 'PROCESSING',
        )
    for (const reservation of refund.reservations) {
      const releasedFrozen = completedSharing && reservation.orderAmount > 0
      runtime.account(reservation.mchid)[
        releasedFrozen ? 'available' : reservation.balance
      ] += reservation.amount
      if (!releasedFrozen) order.remaining += reservation.orderAmount
    }
    const other = runtime.store
      .values<Refund>('refunds')
      .some(
        (item) =>
          item.transaction_id === order.transaction_id &&
          item.refund_id !== refund.refund_id &&
          item.status !== 'CLOSED',
      )
    if (!other) order.trade_state = 'SUCCESS'
  }
  runtime.store.set(
    'orders',
    orderKey(order.sub_mchid, order.out_trade_no),
    order,
  )
  runtime.store.set(
    'refunds',
    orderKey(refund.sub_mchid, refund.out_refund_no),
    refund,
  )
  if (status !== 'PROCESSING')
    runtime.notify(
      refund.notify_url,
      `REFUND.${status}`,
      { ...refundNotification(refund), sp_mchid: runtime.config.spMchid },
      'refund',
    )
  return refundView(refund)
}

function refundReservations(
  runtime: Runtime,
  order: PaymentOrder,
  body: Data,
  amount: Data,
): Refund['reservations'] {
  const requestedSource =
    str(body, 'refund_account', false) || 'REFUND_SOURCE_SUB_MERCHANT'
  if (
    !['REFUND_SOURCE_SUB_MERCHANT', 'REFUND_SOURCE_PARTNER_ADVANCE'].includes(
      requestedSource,
    )
  )
    fail(400, 'PARAM_ERROR', 'refund_account 不合法')
  const refundAmount = int(amount, 'refund', 1)
  const specifiedFunds = str(body, 'funds_account', false)
  if (
    specifiedFunds &&
    !['AVAILABLE', 'UNSETTLED', 'PREPAID'].includes(specifiedFunds)
  )
    fail(400, 'PARAM_ERROR', 'funds_account 不合法')
  let parts: { balance: 'available' | 'frozen'; amount: number }[]
  if (amount.from !== undefined) {
    if (
      specifiedFunds ||
      requestedSource === 'REFUND_SOURCE_PARTNER_ADVANCE' ||
      !order.settle_info.profit_sharing ||
      order.sharing_finished
    )
      fail(400, 'INVALID_REQUEST', '当前退款不能指定多个出资账户')
    const from = arr(amount.from)
    if (!from.length || from.length > 2)
      fail(400, 'PARAM_ERROR', 'amount.from 需要指定 1 至 2 个出资账户')
    const seen = new Set<string>()
    parts = from.map((part) => {
      const account = str(part, 'account')
      if (!['AVAILABLE', 'UNAVAILABLE'].includes(account) || seen.has(account))
        fail(400, 'PARAM_ERROR', '出资账户类型不合法或重复')
      seen.add(account)
      return {
        balance: account === 'AVAILABLE' ? 'available' : 'frozen',
        amount: int(part, 'amount', 1),
      }
    })
    if (parts.reduce((sum, part) => sum + part.amount, 0) !== refundAmount)
      fail(400, 'PARAM_ERROR', '出资金额合计必须等于退款金额')
  } else {
    const frozen =
      specifiedFunds !== 'AVAILABLE' &&
      Boolean(order.settle_info.profit_sharing) &&
      !order.sharing_finished
    parts = [{ balance: frozen ? 'frozen' : 'available', amount: refundAmount }]
  }
  const account = runtime.account(order.sub_mchid)
  const canUseSub = parts.every(
    (part) =>
      account[part.balance] >= part.amount &&
      (part.balance !== 'frozen' || order.remaining >= part.amount),
  )
  if (!canUseSub && requestedSource === 'REFUND_SOURCE_PARTNER_ADVANCE') {
    const platform = runtime.account(runtime.config.spMchid)
    if (platform.available < refundAmount)
      fail(403, 'NOT_ENOUGH', '平台垫付账户余额不足')
    return [
      {
        mchid: runtime.config.spMchid,
        balance: 'available',
        amount: refundAmount,
        orderAmount: 0,
      },
    ]
  }
  if (!canUseSub) fail(403, 'NOT_ENOUGH', '二级商户退款账户余额不足')
  return parts.map((part) => ({
    mchid: order.sub_mchid,
    ...part,
    orderAmount: part.balance === 'frozen' ? part.amount : 0,
  }))
}

export function registerPayments(runtime: Runtime): void {
  for (const kind of ['app', 'jsapi', 'native', 'h5']) {
    const tradeType = kind === 'h5' ? 'MWEB' : kind.toUpperCase()
    runtime.route(
      'POST',
      `/v3/pay/partner/transactions/${kind}`,
      ({ body }) => {
        const key = orderKey(
          str(body, 'sub_mchid'),
          identifier(body, 'out_trade_no'),
        )
        const existing = runtime.store.get<PaymentOrder>('orders', key)
        if (existing?.trade_state === 'CLOSED')
          fail(400, 'ORDER_CLOSED', '订单已关闭')
        const order = runtime.idempotent(
          'payment',
          key,
          { ...body, trade_type: tradeType },
          () => {
            if (existing)
              fail(403, 'OUT_TRADE_NO_USED', '商户订单号已被其他订单使用')
            const created = buildOrder(runtime, body, tradeType)
            runtime.store.set('orders', key, created)
            if (runtime.config.autoPay) {
              markPaid(runtime, created)
              runtime.notify(
                created.notify_url,
                'TRANSACTION.SUCCESS',
                orderView(created),
              )
            }
            return created
          },
        )
        return prepayResponse(runtime, order)
      },
    )

    runtime.route('POST', `/v3/combine-transactions/${kind}`, ({ body }) => {
      const mchid = str(body, 'combine_mchid')
      merchant(runtime, mchid)
      const number = identifier(body, 'combine_out_trade_no', 32, true)
      const key = orderKey(mchid, number)
      const combined = runtime.idempotent(
        'combine-payment',
        key,
        { ...body, trade_type: tradeType },
        () => {
          const payer = optionalObject(body.combine_payer_info)
          if (
            tradeType === 'JSAPI' &&
            !str(payer, 'openid', false) &&
            !str(payer, 'sub_openid', false)
          )
            fail(
              400,
              'PARAM_ERROR',
              'combine_payer_info 必须指定 openid 或 sub_openid',
            )
          const created: Combined = {
            combine_appid: boundedString(body, 'combine_appid', 32),
            combine_mchid: mchid,
            combine_out_trade_no: number,
            combine_payer_info: payer,
            notify_url:
              notificationUrl(body, false) ??
              (runtime.config.serviceNotifyUrl || undefined),
            prepay_id: runtime.id('prepay'),
            trade_type: tradeType,
            order_keys: [],
          }
          const subOrders = arr(body.sub_orders)
          if (subOrders.length < 1 || subOrders.length > 50)
            fail(400, 'PARAM_ERROR', '合单支付需要 1 至 50 笔商品单')
          const seen = new Set<string>()
          const orders = subOrders.map((sub) => {
            const amount = obj(sub.amount)
            currency(amount, true)
            if (sub.attach === undefined)
              fail(400, 'PARAM_ERROR', 'sub_orders.attach 不能为空')
            const order = buildOrder(
              runtime,
              {
                ...sub,
                sp_mchid: str(sub, 'mchid'),
                sp_appid: created.combine_appid,
                scene_info: body.scene_info,
                time_expire: body.time_expire,
                amount: {
                  total: int(amount, 'total_amount', 1),
                  currency: amount.currency,
                },
                payer: payer.sub_openid
                  ? { sub_openid: payer.sub_openid }
                  : { sp_openid: payer.openid ?? 'mock-openid' },
              },
              tradeType,
              created,
            )
            const subKey = orderKey(order.sub_mchid, order.out_trade_no)
            if (seen.has(subKey) || runtime.store.get('orders', subKey))
              fail(403, 'OUT_TRADE_NO_USED', '合单商品单订单号重复或已存在')
            if (payer.sub_openid && !order.sub_appid)
              fail(
                400,
                'PARAM_ERROR',
                '使用 sub_openid 时必须指定子商户 sub_appid',
              )
            seen.add(subKey)
            created.order_keys.push(subKey)
            return order
          })
          for (let index = 0; index < orders.length; index++)
            runtime.store.set(
              'orders',
              created.order_keys[index]!,
              orders[index]!,
            )
          runtime.store.set('combines', key, created)
          if (runtime.config.autoPay) payCombined(runtime, created)
          return created
        },
      )
      const orders = combined.order_keys.map((key) =>
        runtime.store.get<PaymentOrder>('orders', key)!,
      )
      if (orders.some((order) => order.trade_state === 'CLOSED'))
        fail(400, 'ORDER_CLOSED', '合单订单已关闭')
      return prepayResponse(runtime, combined)
    })
  }

  runtime.route(
    'GET',
    '/v3/pay/partner/transactions/id/:transaction_id',
    ({ params, query }) =>
      orderView(
        findOrder(
          runtime,
          { ...query, transaction_id: params.transaction_id },
          true,
        ),
      ),
  )
  runtime.route(
    'GET',
    '/v3/pay/partner/transactions/out-trade-no/:out_trade_no',
    ({ params, query }) =>
      orderView(
        findOrder(
          runtime,
          { ...query, out_trade_no: params.out_trade_no },
          true,
        ),
      ),
  )
  runtime.route(
    'POST',
    '/v3/pay/partner/transactions/out-trade-no/:out_trade_no/close',
    ({ params, body }) => {
      const order = findOrder(
        runtime,
        { ...body, out_trade_no: params.out_trade_no },
        true,
      )
      if (order.combine_out_trade_no)
        fail(400, 'INVALID_REQUEST', '合单商品单必须通过合单关单接口关闭')
      if (order.success_time) fail(400, 'ORDERPAID', '已支付订单不能关闭')
      order.trade_state = 'CLOSED'
      runtime.store.set(
        'orders',
        orderKey(order.sub_mchid, order.out_trade_no),
        order,
      )
      return undefined
    },
  )

  runtime.route(
    'GET',
    '/v3/combine-transactions/out-trade-no/:combine_out_trade_no',
    ({ params }) => {
      const combined = runtime.store.get<Combined>(
        'combines',
        orderKey(runtime.config.spMchid, str(params, 'combine_out_trade_no')),
      )
      if (!combined) fail(404, 'ORDER_NOT_EXIST', '合单订单不存在')
      return combinedView(runtime, combined)
    },
  )
  runtime.route(
    'POST',
    '/v3/combine-transactions/out-trade-no/:combine_out_trade_no/close',
    ({ params, body }) => {
      const combined = runtime.store.get<Combined>(
        'combines',
        orderKey(runtime.config.spMchid, str(params, 'combine_out_trade_no')),
      )
      if (!combined) fail(404, 'ORDER_NOT_EXIST', '合单订单不存在')
      if (str(body, 'combine_appid') !== combined.combine_appid)
        fail(400, 'APPID_MCHID_NOT_MATCH', '合单 AppID 与订单不一致')
      const supplied = arr(body.sub_orders)
      const expected = combined.order_keys.map((key) =>
        runtime.store.get<PaymentOrder>('orders', key)!,
      )
      const keys = supplied
        .map(
          (sub) =>
            `${str(sub, 'mchid')}:${str(sub, 'sub_mchid')}:${str(sub, 'out_trade_no')}:${str(sub, 'sub_appid', false)}`,
        )
        .sort()
      const expectedKeys = expected
        .map(
          (order) =>
            `${order.sp_mchid}:${order.sub_mchid}:${order.out_trade_no}:${order.sub_appid ?? ''}`,
        )
        .sort()
      if (JSON.stringify(keys) !== JSON.stringify(expectedKeys))
        fail(400, 'INVALID_REQUEST', '合单关单必须包含下单时的全部商品单')
      if (expected.some((order) => Boolean(order.success_time)))
        fail(400, 'ORDERPAID', '已支付的合单不能关闭')
      for (const order of expected) {
        order.trade_state = 'CLOSED'
        runtime.store.set(
          'orders',
          orderKey(order.sub_mchid, order.out_trade_no),
          order,
        )
      }
      return undefined
    },
  )

  runtime.actions.set('pay', (body) => {
    if (body.combine_out_trade_no) {
      const combined = runtime.store.get<Combined>(
        'combines',
        orderKey(runtime.config.spMchid, str(body, 'combine_out_trade_no')),
      )
      if (!combined) fail(404, 'ORDER_NOT_EXIST', '合单订单不存在')
      return payCombined(runtime, combined, optionalObject(body.payer))
    }
    const order = body.prepay_id
      ? runtime.store
          .values<PaymentOrder>('orders')
          .find((item) => item.prepay_id === str(body, 'prepay_id'))
      : findOrder(runtime, {
          ...body,
          sub_mchid: body.sub_mchid ?? runtime.config.subMchid,
        })
    if (!order) fail(404, 'ORDER_NOT_EXIST', '预支付订单不存在')
    if (order.combine_out_trade_no) {
      const combined = runtime.store.get<Combined>(
        'combines',
        orderKey(runtime.config.spMchid, order.combine_out_trade_no),
      )!
      return payCombined(runtime, combined, optionalObject(body.payer))
    }
    payable(runtime, order)
    const changed = order.trade_state === 'NOTPAY'
    markPaid(runtime, order, optionalObject(body.payer))
    if (changed)
      runtime.notify(order.notify_url, 'TRANSACTION.SUCCESS', orderView(order))
    return orderView(order)
  })

  runtime.route('POST', '/v3/ecommerce/refunds/apply', ({ body }) => {
    const mchid = str(body, 'sub_mchid')
    const number = identifier(body, 'out_refund_no', 64, true)
    const key = orderKey(mchid, number)
    const refund = runtime.idempotent('refund', key, body, () => {
      const order = findOrder(runtime, body)
      if (!order.success_time)
        fail(404, 'RESOURCE_NOT_EXISTS', '原支付订单尚未支付')
      const spAppid = str(body, 'sp_appid')
      if (spAppid !== order.sp_appid)
        fail(403, 'NO_AUTH', 'sp_appid 与原支付订单不一致')
      if (body.sub_appid && body.sub_appid !== order.sub_appid)
        fail(403, 'NO_AUTH', 'sub_appid 与原支付订单不一致')
      if (
        Date.parse(runtime.now()) - Date.parse(order.success_time) >
        365 * 86400_000
      )
        fail(400, 'INVALID_REQUEST', '支付时间超过 365 天，不能申请退款')
      const amount = obj(body.amount)
      const total = int(amount, 'total', 1)
      const refundAmount = int(amount, 'refund', 1)
      if (total !== order.amount.total)
        fail(400, 'PARAM_ERROR', '原订单金额与支付订单不一致')
      currency(amount)
      const refunds = runtime.store
        .values<Refund>('refunds')
        .filter((item) => item.transaction_id === order.transaction_id)
      const occupied = refunds
        .filter((item) => item.status !== 'CLOSED')
        .reduce((sum, item) => sum + item.amount.refund, 0)
      if (occupied + refundAmount > total)
        fail(
          400,
          'INVALID_REQUEST',
          '累计退款金额超过原支付订单金额（包含处理中退款）',
        )
      if (refunds.length >= 50)
        fail(400, 'INVALID_REQUEST', '单个支付订单最多申请 50 次退款')
      const notifyUrl =
        notificationUrl(body, false) ??
        (runtime.config.serviceNotifyUrl || undefined)
      boundedString(body, 'reason', 80, false)
      const reservations = refundReservations(runtime, order, body, amount)
      const advance = reservations.some(
        (item) =>
          item.mchid === runtime.config.spMchid &&
          item.mchid !== order.sub_mchid,
      )
      const created: Refund = {
        refund_id: runtime.id('refund'),
        out_refund_no: number,
        sub_mchid: mchid,
        sp_appid: spAppid,
        transaction_id: order.transaction_id,
        out_trade_no: order.out_trade_no,
        create_time: runtime.now(),
        status: 'PROCESSING',
        channel: 'ORIGINAL',
        user_received_account: '支付用户零钱',
        amount: {
          refund: refundAmount,
          total,
          payer_refund: refundAmount,
          currency: 'CNY',
          ...(amount.from ? { from: arr(amount.from) } : {}),
          ...(advance ? { advance: refundAmount } : {}),
        },
        refund_account: advance
          ? 'REFUND_SOURCE_PARTNER_ADVANCE'
          : 'REFUND_SOURCE_SUB_MERCHANT',
        funds_account: reservations.some((item) => item.balance === 'frozen')
          ? 'UNAVAILABLE'
          : 'AVAILABLE',
        ...(notifyUrl ? { notify_url: notifyUrl } : {}),
        reservations,
      }
      for (const reservation of reservations) {
        runtime.account(reservation.mchid)[reservation.balance] -=
          reservation.amount
        order.remaining -= reservation.orderAmount
      }
      order.trade_state = 'REFUND'
      runtime.store.set('orders', orderKey(mchid, order.out_trade_no), order)
      runtime.store.set('refunds', key, created)
      if (runtime.config.autoComplete)
        completeRefund(runtime, created, 'SUCCESS')
      return created
    })
    return refundView(runtime.store.get<Refund>('refunds', key) ?? refund)
  })
  runtime.route(
    'GET',
    '/v3/ecommerce/refunds/id/:refund_id',
    ({ params, query }) =>
      refundView(findRefund(runtime, { ...query, ...params })),
  )
  runtime.route(
    'GET',
    '/v3/ecommerce/refunds/out-refund-no/:out_refund_no',
    ({ params, query }) =>
      refundView(findRefund(runtime, { ...query, ...params })),
  )
  runtime.actions.set('complete-refund', (body) => {
    const status = str(body, 'status', false) || 'SUCCESS'
    if (!['SUCCESS', 'CLOSED', 'ABNORMAL'].includes(status))
      fail(400, 'PARAM_ERROR', '退款完成状态必须为 SUCCESS、CLOSED 或 ABNORMAL')
    return completeRefund(
      runtime,
      findRefund(runtime, {
        ...body,
        sub_mchid: body.sub_mchid ?? runtime.config.subMchid,
      }),
      status as RefundStatus,
    )
  })

  runtime.route(
    'POST',
    '/v3/ecommerce/refunds/:refund_id/apply-abnormal-refund',
    ({ params, body, request }) => {
      if (
        runtime.config.strict &&
        request.headers.get('Wechatpay-Serial') !==
          runtime.crypto.platformSerial
      )
        fail(
          400,
          'PARAM_ERROR',
          '异常退款必须携带当前测试平台的 Wechatpay-Serial',
        )
      const refund = findRefund(runtime, { ...body, ...params })
      const requestNumber = identifier(body, 'out_refund_no', 64, true)
      if (requestNumber !== refund.out_refund_no)
        fail(400, 'PARAM_ERROR', 'out_refund_no 必须与原退款单一致')
      runtime.idempotent(
        'abnormal-refund',
        `${refund.refund_id}:${requestNumber}`,
        body,
        () => {
          if (refund.status !== 'ABNORMAL')
            fail(400, 'INVALID_REQUEST', '仅退款异常的退款单可发起异常退款')
          const type = str(body, 'type')
          if (!['USER_BANK_CARD', 'MERCHANT_BANK_CARD'].includes(type))
            fail(400, 'PARAM_ERROR', '异常退款处理方式不合法')
          if (type === 'USER_BANK_CARD') {
            str(body, 'bank_type')
            runtime.decryptSensitive(str(body, 'bank_account'))
            runtime.decryptSensitive(str(body, 'real_name'))
          }
          refund.channel = 'OTHER_BANKCARD'
          refund.user_received_account =
            type === 'USER_BANK_CARD'
              ? '用户银行卡'
              : '商户基本账户商户结算银行账户'
          refund.status = 'PROCESSING'
          runtime.store.set(
            'refunds',
            orderKey(refund.sub_mchid, refund.out_refund_no),
            refund,
          )
          if (runtime.config.autoComplete)
            completeRefund(runtime, refund, 'SUCCESS')
          return refundView(refund)
        },
      )
      return refundView(refund)
    },
  )

  runtime.route(
    'POST',
    '/v3/ecommerce/refunds/:refund_id/return-advance',
    ({ params, body }) => {
      const refund = findRefund(runtime, { ...body, ...params })
      if (
        refund.refund_account !== 'REFUND_SOURCE_PARTNER_ADVANCE' ||
        refund.status !== 'SUCCESS'
      )
        fail(400, 'INVALID_REQUEST', '仅已成功的垫付退款可以发起回补')
      const existing = runtime.store.get<Data>(
        'refund_advances',
        refund.refund_id,
      )
      if (existing?.result === 'SUCCESS' || existing?.result === 'FAILED')
        return existing
      const account = runtime.account(refund.sub_mchid)
      const amount = refund.amount.advance!
      const result: Data = existing ?? {
        refund_id: refund.refund_id,
        advance_return_id: runtime.id('advance'),
        return_amount: amount,
        payer_mchid: refund.sub_mchid,
        payer_account: 'BASIC',
        payee_mchid: runtime.config.spMchid,
        payee_account: 'BASIC',
        result: 'PROCESSING',
      }
      if (account.available >= amount) {
        account.available -= amount
        runtime.account(runtime.config.spMchid).available += amount
        result.result = 'SUCCESS'
        result.success_time = runtime.now()
      }
      runtime.store.set('refund_advances', refund.refund_id, result)
      return result
    },
  )
  runtime.route(
    'GET',
    '/v3/ecommerce/refunds/:refund_id/return-advance',
    ({ params, query }) => {
      const refund = findRefund(runtime, { ...query, ...params })
      const result = runtime.store.get<Data>(
        'refund_advances',
        refund.refund_id,
      )
      if (!result) fail(404, 'RESOURCE_NOT_EXISTS', '该退款尚未发起垫付回补')
      return result
    },
  )
}
