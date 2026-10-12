import {
  createCipheriv,
  createHash,
  publicEncrypt,
  randomBytes,
  constants,
} from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { arr, fail, int, obj, str } from './core.js'
import type { Runtime } from './core.js'
import type { Data, Order } from './types.js'

type Receiver = Data & {
  type: string
  receiver_account: string
  amount: number
  description: string
  result: string
  detail_id: string
  returned: number
}
type Sharing = Data & {
  sub_mchid: string
  transaction_id: string
  out_order_no: string
  order_id: string
  receivers: Receiver[]
  status: string
  finish: boolean
}
type Withdrawal = Data & {
  mchid: string
  account_type: string
  withdraw_id: string
  out_request_no: string
  amount: number
  status: string
  day_end: boolean
  notify_url?: string
}
type Overseas = Data & {
  sub_mchid: string
  transaction_id: string
  out_order_id: string
  amount: number
  result: string
}
type Subsidy = Data & {
  sub_mchid: string
  transaction_id: string
  amount: number
  returned: number
  subsidy_id: string
  result: string
}
type Bill = {
  data: string
  compressed: boolean
  encrypted?: string
  expires_at: number
}

const accountTypes = ['BASIC', 'OPERATION', 'FEES', 'DEPOSIT']
const sharingKey = (mchid: string, number: string) => `${mchid}:${number}`
const csv = (rows: unknown[][]) =>
  rows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value ?? '')
          return /[",\r\n]/.test(text)
            ? `"${text.replaceAll('"', '""')}"`
            : text
        })
        .join(','),
    )
    .join('\r\n') + '\r\n'

function enumValue(
  data: Data,
  key: string,
  allowed: readonly string[],
  fallback?: string,
): string {
  const value = str(data, key, !fallback) || fallback!
  if (!allowed.includes(value))
    fail(400, 'PARAM_ERROR', `${key} 必须是 ${allowed.join('、')}`)
  return value
}

function dateValue(data: Data, key: string, required = true): string {
  const value = str(data, key, required)
  if (!value && !required) return ''
  const parsed = Date.parse(`${value}T00:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString().slice(0, 10) !== value
  ) {
    fail(400, 'PARAM_ERROR', `${key} 必须是有效的 YYYY-MM-DD 日期`)
  }
  return value
}

function orderNumber(data: Data, key: string, alphabetOnly = false): string {
  const value = str(data, key)
  if (
    !(alphabetOnly ? /^[A-Za-z0-9]{1,32}$/ : /^[A-Za-z0-9_\-|*@]{1,64}$/).test(
      value,
    )
  ) {
    fail(400, 'PARAM_ERROR', `${key} 格式不正确`)
  }
  return value
}

export function registerSettlement(runtime: Runtime): void {
  const { store } = runtime
  const findOrder = (
    data: Data,
    transactionId = str(data, 'transaction_id'),
  ): Order => {
    const mchid = str(data, 'sub_mchid')
    const order = store
      .values<Order>('orders')
      .find(
        (value) =>
          value.transaction_id === transactionId && value.sub_mchid === mchid,
      )
    if (!order) fail(404, 'RESOURCE_NOT_EXISTS', '订单不存在')
    return order
  }
  const paidOrder = (data: Data, sharing = false): Order => {
    const order = findOrder(data)
    if (
      !['SUCCESS', 'REFUND'].includes(order.trade_state) ||
      !order.success_time
    )
      fail(400, 'ORDER_NOT_PAID', '订单尚未支付成功')
    if (sharing && order.settle_info.profit_sharing !== true)
      fail(400, 'INVALID_REQUEST', '订单未设置分账标识')
    return order
  }
  const saveOrder = (order: Order) =>
    store.set('orders', sharingKey(order.sub_mchid, order.out_trade_no), order)
  const unfreeze = (order: Order): number => {
    const account = runtime.account(order.sub_mchid)
    const amount = order.remaining
    if (account.frozen < amount) fail(403, 'NOT_ENOUGH', '订单冻结资金不足')
    account.frozen -= amount
    account.available += amount
    order.remaining = 0
    order.sharing_finished = true
    saveOrder(order)
    return amount
  }
  const sharingResponse = (sharing: Sharing): Data => {
    const { finish: _finish, receivers, ...result } = sharing
    return {
      ...result,
      receivers: receivers.map(
        ({ returned: _returned, receiver_name: _name, ...receiver }) =>
          receiver,
      ),
    }
  }
  const completeSharing = (data: Data): Data => {
    const mchid = str(data, 'sub_mchid')
    const sharing = store.get<Sharing>(
      'profitsharing',
      sharingKey(mchid, str(data, 'out_order_no')),
    )
    if (!sharing) fail(404, 'RESOURCE_NOT_EXISTS', '分账单不存在')
    if (sharing.status === 'FINISHED') return sharingResponse(sharing)
    const order = findOrder(sharing)
    const account = runtime.account(mchid)
    const success = data.success !== false
    const amount = sharing.receivers.reduce(
      (sum, receiver) => sum + receiver.amount,
      0,
    )
    if (
      success &&
      account.frozen < amount + (sharing.finish ? order.remaining : 0)
    )
      fail(403, 'NOT_ENOUGH', '冻结余额不足')
    for (const receiver of sharing.receivers) {
      receiver.result = success ? 'SUCCESS' : 'CLOSED'
      receiver.finish_time = runtime.now()
      if (success) {
        account.frozen -= receiver.amount
        runtime.account(receiver.receiver_account).available += receiver.amount
      } else {
        receiver.fail_reason =
          str(data, 'fail_reason', false) || 'ACCOUNT_ABNORMAL'
        order.remaining += receiver.amount
      }
    }
    sharing.status = 'FINISHED'
    if (sharing.finish) sharing.finish_amount = unfreeze(order)
    saveOrder(order)
    store.set('profitsharing', sharingKey(mchid, sharing.out_order_no), sharing)
    if (success)
      for (const receiver of sharing.receivers)
        runtime.notify(
          str(data, 'notify_url', false) ||
            str(sharing, 'notify_url', false) ||
            runtime.config.serviceNotifyUrl,
          'TRANSACTION.SUCCESS',
          {
            sp_mchid: runtime.config.spMchid,
            sub_mchid: sharing.sub_mchid,
            transaction_id: sharing.transaction_id,
            order_id: sharing.order_id,
            out_order_no: sharing.out_order_no,
            receiver: {
              type: receiver.type,
              account: receiver.receiver_account,
              amount: receiver.amount,
              description: receiver.description,
            },
            success_time: receiver.finish_time,
          },
          'profitsharing',
        )
    return sharingResponse(sharing)
  }
  runtime.actions.set('complete-profitsharing', completeSharing)

  for (const operation of ['add', 'delete']) {
    runtime.route(
      'POST',
      `/v3/ecommerce/profitsharing/receivers/${operation}`,
      ({ body }) => {
        const type = enumValue(body, 'type', ['MERCHANT_ID', 'PERSONAL_OPENID'])
        const account = str(body, 'account')
        const appid =
          str(body, 'appid', type === 'PERSONAL_OPENID') ||
          runtime.config.spAppid
        const key = `${appid}:${type}:${account}`
        if (operation === 'add') {
          enumValue(body, 'relation_type', [
            'SUPPLIER',
            'DISTRIBUTOR',
            'SERVICE_PROVIDER',
            'PLATFORM',
            'OTHERS',
          ])
          str(body, 'name', type === 'MERCHANT_ID')
          store.set('receivers', key, { ...body, appid })
        } else store.delete('receivers', key)
        return { type, account }
      },
    )
  }
  runtime.route('POST', '/v3/ecommerce/profitsharing/orders', ({ body }) => {
    const mchid = str(body, 'sub_mchid')
    const number = orderNumber(body, 'out_order_no')
    return runtime.idempotent(
      'profitsharing',
      sharingKey(mchid, number),
      body,
      () => {
        const order = paidOrder(body, true)
        if (order.sharing_finished)
          fail(400, 'INVALID_REQUEST', '订单已完结分账')
        if (typeof body.finish !== 'boolean')
          fail(400, 'PARAM_ERROR', 'finish 必须为布尔值')
        const existing = store
          .values<Sharing>('profitsharing')
          .filter((value) => value.transaction_id === order.transaction_id)
        if (existing.length >= 50)
          fail(403, 'RULE_LIMIT', '同一订单最多发起 50 次分账')
        const subsidy = store
          .values<Subsidy>('subsidies')
          .find((value) => value.transaction_id === order.transaction_id)
        if (
          Number(order.settle_info.subsidy_amount ?? 0) > 0 &&
          !subsidy &&
          !store.get('subsidy_cancellations', order.transaction_id)
        ) {
          fail(400, 'INVALID_REQUEST', '带有补差标识的订单须先补差或取消补差')
        }
        const entries = arr(body.receivers)
        if (entries.length === 0 || entries.length > 50)
          fail(400, 'PARAM_ERROR', 'receivers 数量必须是 1 至 50')
        const seen = new Set<string>()
        const receivers: Receiver[] = entries.map((entry) => {
          const type = enumValue(entry, 'type', [
            'MERCHANT_ID',
            'PERSONAL_OPENID',
          ])
          const account = str(entry, 'receiver_account')
          const appid =
            str(body, 'appid', type === 'PERSONAL_OPENID') ||
            runtime.config.spAppid
          if (seen.has(`${type}:${account}`))
            fail(400, 'PARAM_ERROR', '同一接收方不能重复')
          seen.add(`${type}:${account}`)
          if (
            body.finish &&
            (type !== 'MERCHANT_ID' || account !== runtime.config.spMchid)
          )
            fail(400, 'PARAM_ERROR', 'finish=true 时只支持分账给平台商户')
          if (
            account !== runtime.config.spMchid &&
            account !== mchid &&
            !store.get('receivers', `${appid}:${type}:${account}`)
          ) {
            fail(403, 'NO_RELATION', '分账接收方尚未添加')
          }
          str(entry, 'receiver_name', type === 'MERCHANT_ID')
          return {
            type,
            receiver_account: account,
            amount: int(entry, 'amount', 1),
            description: str(entry, 'description'),
            result: 'PENDING',
            detail_id: runtime.id('360'),
            returned: 0,
          }
        })
        const amount = receivers.reduce(
          (sum, receiver) => sum + receiver.amount,
          0,
        )
        if (amount > order.remaining)
          fail(403, 'NOT_ENOUGH', '分账金额超过订单剩余待分金额')
        const sharing: Sharing = {
          sub_mchid: mchid,
          transaction_id: order.transaction_id,
          out_order_no: number,
          order_id: runtime.id('300'),
          receivers,
          status: 'PROCESSING',
          finish: body.finish as boolean,
          create_time: runtime.now(),
          notify_url: str(body, 'notify_url', false),
        }
        order.remaining -= amount
        if (sharing.finish) order.sharing_finished = true
        saveOrder(order)
        store.set('profitsharing', sharingKey(mchid, number), sharing)
        return runtime.config.autoComplete
          ? completeSharing({ sub_mchid: mchid, out_order_no: number })
          : sharingResponse(sharing)
      },
    )
  })
  runtime.route('GET', '/v3/ecommerce/profitsharing/orders', ({ query }) => {
    const sharing = store.get<Sharing>(
      'profitsharing',
      sharingKey(str(query, 'sub_mchid'), str(query, 'out_order_no')),
    )
    if (!sharing || sharing.transaction_id !== str(query, 'transaction_id'))
      fail(404, 'RESOURCE_NOT_EXISTS', '分账单不存在')
    return sharingResponse(sharing)
  })
  runtime.route(
    'GET',
    '/v3/ecommerce/profitsharing/orders/:transaction_id/amounts',
    ({ params, query }) => {
      const transaction = str(params, 'transaction_id')
      const mchid = str(query, 'sub_mchid', false)
      const order = store
        .values<Order>('orders')
        .find(
          (value) =>
            value.transaction_id === transaction &&
            (!mchid || value.sub_mchid === mchid),
        )
      if (!order) fail(404, 'RESOURCE_NOT_EXISTS', '订单不存在')
      return {
        transaction_id: order.transaction_id,
        unsplit_amount: order.remaining,
      }
    },
  )
  runtime.route(
    'POST',
    '/v3/ecommerce/profitsharing/finish-order',
    ({ body }) => {
      const key = sharingKey(
        str(body, 'sub_mchid'),
        orderNumber(body, 'out_order_no'),
      )
      return runtime.idempotent('profitsharing', key, body, () => {
        const order = paidOrder(body, true)
        if (order.sharing_finished)
          fail(400, 'INVALID_REQUEST', '订单已完结分账')
        if (
          store
            .values<Sharing>('profitsharing')
            .some(
              (value) =>
                value.transaction_id === order.transaction_id &&
                value.status === 'PROCESSING',
            )
        )
          fail(400, 'INVALID_REQUEST', '仍有分账请求处理中')
        const description = str(body, 'description')
        const sharing: Sharing = {
          sub_mchid: order.sub_mchid,
          transaction_id: order.transaction_id,
          out_order_no: str(body, 'out_order_no'),
          order_id: runtime.id('300'),
          receivers: [],
          status: 'PROCESSING',
          finish: true,
          finish_description: description,
          create_time: runtime.now(),
        }
        order.sharing_finished = true
        saveOrder(order)
        store.set('profitsharing', key, sharing)
        if (runtime.config.autoComplete)
          completeSharing({
            sub_mchid: order.sub_mchid,
            out_order_no: sharing.out_order_no,
          })
        return {
          sub_mchid: order.sub_mchid,
          transaction_id: order.transaction_id,
          out_order_no: sharing.out_order_no,
          order_id: sharing.order_id,
        }
      })
    },
  )
  const returnResponse = (value: Data): Data => {
    const { description: _description, ...response } = value
    return response
  }
  runtime.route(
    'POST',
    '/v3/ecommerce/profitsharing/returnorders',
    ({ body }) => {
      const mchid = str(body, 'sub_mchid')
      const returnNumber = orderNumber(body, 'out_return_no')
      return runtime.idempotent(
        'profitsharing_returns',
        sharingKey(mchid, returnNumber),
        body,
        () => {
          const orderId = str(body, 'order_id', false)
          const number = str(body, 'out_order_no', false)
          if (!orderId && !number)
            fail(400, 'PARAM_ERROR', 'order_id 和 out_order_no 至少提供一个')
          const sharing = store
            .values<Sharing>('profitsharing')
            .find(
              (value) =>
                value.sub_mchid === mchid &&
                (!orderId || value.order_id === orderId) &&
                (!number || value.out_order_no === number),
            )
          if (!sharing) fail(404, 'RESOURCE_NOT_EXISTS', '分账单不存在')
          const receiverMchid = str(body, 'return_mchid')
          const receiver = sharing.receivers.find(
            (value) =>
              value.type === 'MERCHANT_ID' &&
              value.receiver_account === receiverMchid &&
              value.result === 'SUCCESS',
          )
          const amount = int(body, 'amount', 1)
          if (!receiver || amount > receiver.amount - receiver.returned)
            fail(403, 'NOT_ENOUGH', '回退金额超过该接收方剩余可回退金额')
          const account = runtime.account(receiverMchid)
          if (account.available < amount)
            fail(403, 'NOT_ENOUGH', '分账接收方可用余额不足')
          str(body, 'description')
          account.available -= amount
          runtime.account(mchid).available += amount
          receiver.returned += amount
          store.set(
            'profitsharing',
            sharingKey(mchid, sharing.out_order_no),
            sharing,
          )
          const result = {
            sub_mchid: mchid,
            order_id: sharing.order_id,
            out_order_no: sharing.out_order_no,
            out_return_no: returnNumber,
            return_no: runtime.id('330'),
            return_mchid: receiverMchid,
            amount,
            result: 'SUCCESS',
            finish_time: runtime.now(),
            transaction_id: sharing.transaction_id,
            description: body.description,
          }
          store.set(
            'profitsharing_returns',
            sharingKey(mchid, returnNumber),
            result,
          )
          runtime.notify(
            str(body, 'notify_url', false) || runtime.config.serviceNotifyUrl,
            'TRANSACTION.SUCCESS',
            {
              sp_mchid: runtime.config.spMchid,
              sub_mchid: mchid,
              transaction_id: sharing.transaction_id,
              order_id: result.return_no,
              out_order_no: returnNumber,
              receiver: {
                type: 'MERCHANT_ID',
                account: mchid,
                amount,
                description: body.description,
              },
              success_time: result.finish_time,
            },
            'profitsharing',
          )
          return returnResponse(result)
        },
      )
    },
  )
  runtime.route(
    'GET',
    '/v3/ecommerce/profitsharing/returnorders',
    ({ query }) => {
      const result = store.get<Data>(
        'profitsharing_returns',
        sharingKey(str(query, 'sub_mchid'), str(query, 'out_return_no')),
      )
      if (
        !result ||
        (query.out_order_no && query.out_order_no !== result.out_order_no) ||
        (query.order_id && query.order_id !== result.order_id)
      )
        fail(404, 'RESOURCE_NOT_EXISTS', '分账回退单不存在')
      if (!query.order_id && !query.out_order_no)
        fail(400, 'PARAM_ERROR', 'order_id 和 out_order_no 至少提供一个')
      return returnResponse(result)
    },
  )

  registerSubsidies(runtime, paidOrder, saveOrder)
  registerAccountsAndWithdrawals(runtime)
  registerOverseas(runtime, paidOrder)
  registerBills(runtime)
}

function registerSubsidies(
  runtime: Runtime,
  paidOrder: (data: Data, sharing?: boolean) => Order,
  saveOrder: (order: Order) => void,
): void {
  const { store } = runtime
  const response = (value: Subsidy) => {
    const { returned: _returned, ...result } = value
    return result
  }
  runtime.route('POST', '/v3/ecommerce/subsidies/create', ({ body }) => {
    const mchid = str(body, 'sub_mchid')
    const transaction = str(body, 'transaction_id')
    return runtime.idempotent(
      'subsidies',
      `${mchid}:${transaction}`,
      body,
      () => {
        const order = paidOrder(body, true)
        if (
          order.sharing_finished ||
          store
            .values<Sharing>('profitsharing')
            .some((value) => value.transaction_id === transaction)
        )
          fail(400, 'INVALID_REQUEST', '分账后不能补差')
        if (store.get('subsidy_cancellations', transaction))
          fail(400, 'INVALID_REQUEST', '订单已取消补差')
        const maximum = Number(order.settle_info.subsidy_amount ?? 0)
        const amount = int(body, 'amount', 1)
        if (amount > maximum || (order.refunded === 0 && amount !== maximum))
          fail(
            400,
            'PARAM_ERROR',
            '补差金额须与下单补差金额相同；退款后允许小于该金额',
          )
        const account = runtime.account(runtime.config.spMchid, 'OPERATION')
        if (account.available < amount)
          fail(403, 'NOT_ENOUGH', '平台运营账户余额不足')
        const description = str(body, 'description')
        const number = str(body, 'out_subsidy_no', false)
        if (
          number &&
          store
            .values<Subsidy>('subsidies')
            .some((value) => value.out_subsidy_no === number)
        )
          fail(400, 'INVALID_REQUEST', '商户补差单号重复')
        account.available -= amount
        runtime.account(mchid).frozen += amount
        order.remaining += amount
        saveOrder(order)
        const subsidy: Subsidy = {
          sub_mchid: mchid,
          transaction_id: transaction,
          subsidy_id: runtime.id('310'),
          description,
          amount,
          result: 'SUCCESS',
          success_time: runtime.now(),
          returned: 0,
          ...(number ? { out_subsidy_no: number } : {}),
        }
        store.set('subsidies', `${mchid}:${transaction}`, subsidy)
        return response(subsidy)
      },
    )
  })
  runtime.route('POST', '/v3/ecommerce/subsidies/return', ({ body }) => {
    const mchid = str(body, 'sub_mchid')
    const number = orderNumber(body, 'out_order_no')
    return runtime.idempotent(
      'subsidy_returns',
      `${mchid}:${number}`,
      body,
      () => {
        const order = paidOrder(body, true)
        const subsidy = store.get<Subsidy>(
          'subsidies',
          `${mchid}:${order.transaction_id}`,
        )
        if (
          !subsidy ||
          (body.subsidy_id && body.subsidy_id !== subsidy.subsidy_id)
        )
          fail(404, 'RESOURCE_NOT_EXISTS', '补差单不存在')
        const amount = int(body, 'amount', 1)
        if (amount > subsidy.amount - subsidy.returned)
          fail(403, 'NOT_ENOUGH', '补差回退金额超过可回退补差金额')
        const description = str(body, 'description')
        const from = body.from === undefined ? [] : arr(body.from)
        if (
          from.length > 1 ||
          (from.length && int(from[0], 'amount', 1) !== amount)
        )
          fail(400, 'PARAM_ERROR', 'from 仅支持一个账户且金额须与 amount 相等')
        const source = from.length
          ? enumValue(from[0], 'account', ['AVAILABLE', 'UNAVAILABLE'])
          : order.sharing_finished
            ? 'AVAILABLE'
            : 'UNAVAILABLE'
        const account = runtime.account(mchid)
        if (source === 'UNAVAILABLE') {
          if (account.frozen < amount || order.remaining < amount)
            fail(403, 'NOT_ENOUGH', '订单不可用余额不足')
          account.frozen -= amount
          order.remaining -= amount
        } else {
          if (account.available < amount)
            fail(403, 'NOT_ENOUGH', '二级商户可用余额不足')
          account.available -= amount
        }
        runtime.account(runtime.config.spMchid, 'OPERATION').available += amount
        subsidy.returned += amount
        if (subsidy.returned === subsidy.amount) subsidy.result = 'REFUND'
        saveOrder(order)
        store.set('subsidies', `${mchid}:${order.transaction_id}`, subsidy)
        const result: Data = {
          sub_mchid: mchid,
          transaction_id: order.transaction_id,
          subsidy_refund_id: runtime.id('320'),
          out_order_no: number,
          amount,
          description,
          result: 'SUCCESS',
          success_time: runtime.now(),
          subsidy_id: subsidy.subsidy_id,
          ...(body.refund_id ? { refund_id: body.refund_id } : {}),
          ...(from.length ? { from } : {}),
        }
        store.set('subsidy_returns', `${mchid}:${number}`, result)
        return result
      },
    )
  })
  runtime.route('POST', '/v3/ecommerce/subsidies/cancel', ({ body }) => {
    const mchid = str(body, 'sub_mchid')
    const transaction = str(body, 'transaction_id')
    return runtime.idempotent(
      'subsidy_cancellations',
      `${mchid}:${transaction}`,
      body,
      () => {
        const order = paidOrder(body, true)
        if (order.refunded === 0)
          fail(400, 'INVALID_REQUEST', '订单发生退款后才能取消补差')
        if (
          store.get('subsidies', `${mchid}:${transaction}`) ||
          store
            .values<Sharing>('profitsharing')
            .some((value) => value.transaction_id === transaction)
        )
          fail(400, 'INVALID_REQUEST', '已补差或分账的订单不能取消补差')
        const result = {
          sub_mchid: mchid,
          transaction_id: transaction,
          result: 'SUCCESS',
          description: str(body, 'description'),
        }
        store.set('subsidy_cancellations', transaction, result)
        return result
      },
    )
  })
}

function registerAccountsAndWithdrawals(runtime: Runtime): void {
  const { store } = runtime
  const balance = (
    mchid: string,
    type: string,
    day: string,
    sub: boolean,
  ): Data => {
    const account = runtime.account(mchid, type)
    const key = `${mchid}:${type}:${day}`
    let snapshot = day
      ? store.get<{ available: number; frozen: number }>('dayend_balances', key)
      : undefined
    if (day && !snapshot) {
      snapshot = { available: account.available, frozen: account.frozen }
      store.set('dayend_balances', key, snapshot)
    }
    return {
      ...(sub ? { sub_mchid: mchid, account_type: type } : {}),
      available_amount: snapshot?.available ?? account.available,
      pending_amount: snapshot?.frozen ?? account.frozen,
    }
  }
  runtime.route(
    'GET',
    '/v3/ecommerce/fund/balance/:sub_mchid',
    ({ params, query }) =>
      balance(
        str(params, 'sub_mchid'),
        enumValue(query, 'account_type', accountTypes, 'BASIC'),
        '',
        true,
      ),
  )
  runtime.route(
    'GET',
    '/v3/ecommerce/fund/enddaybalance/:sub_mchid',
    ({ params, query }) =>
      balance(
        str(params, 'sub_mchid'),
        enumValue(query, 'account_type', ['BASIC', 'DEPOSIT'], 'BASIC'),
        dateValue(query, 'date'),
        true,
      ),
  )
  runtime.route(
    'GET',
    '/v3/merchant/fund/balance/:account_type',
    ({ params }) =>
      balance(
        runtime.config.spMchid,
        enumValue(params, 'account_type', ['BASIC', 'OPERATION', 'FEES']),
        '',
        false,
      ),
  )
  runtime.route(
    'GET',
    '/v3/merchant/fund/dayendbalance/:account_type',
    ({ params, query }) =>
      balance(
        runtime.config.spMchid,
        enumValue(params, 'account_type', ['BASIC', 'OPERATION', 'FEES']),
        dateValue(query, 'date', false) || runtime.now().slice(0, 10),
        false,
      ),
  )
  const withdrawalResponse = (value: Withdrawal): Data => {
    const { mchid: _mchid, day_end, notify_url: _notify, ...result } = value
    if (day_end) {
      const { amount, ...response } = result
      return {
        ...response,
        total_amount: amount,
        success_amount: value.status === 'FINISHED' ? amount : 0,
        fail_amount:
          value.status === 'ABNORMAL' && value.reason !== 'REFUND' ? amount : 0,
        refund_amount: value.reason === 'REFUND' ? amount : 0,
      }
    }
    return result
  }
  const completeWithdrawal = (body: Data): Data => {
    const id = str(body, 'withdraw_id', false)
    const mchid = str(body, 'sub_mchid', false) || runtime.config.spMchid
    const value = id
      ? store
          .values<Withdrawal>('withdrawals')
          .find((item) => item.withdraw_id === id)
      : store.get<Withdrawal>(
          'withdrawals',
          sharingKey(mchid, str(body, 'out_request_no')),
        )
    if (!value) fail(404, 'RESOURCE_NOT_EXISTS', '提现申请不存在')
    const finalStatus = enumValue(
      body,
      'status',
      ['SUCCESS', 'FAIL', 'REFUND', 'CLOSE', 'FINISHED', 'ABNORMAL'],
      body.success === false ? 'FAIL' : 'SUCCESS',
    )
    const success = finalStatus === 'SUCCESS' || finalStatus === 'FINISHED'
    const previousSuccess =
      value.status === 'SUCCESS' || value.status === 'FINISHED'
    const terminal = [
      'SUCCESS',
      'FAIL',
      'REFUND',
      'CLOSE',
      'FINISHED',
      'ABNORMAL',
    ].includes(value.status)
    if (terminal && !(previousSuccess && finalStatus === 'REFUND'))
      return withdrawalResponse(value)
    const account = runtime.account(value.mchid, value.account_type)
    if (!terminal && account.frozen < value.amount)
      fail(403, 'NOT_ENOUGH', '提现冻结余额不足')
    if (!terminal) account.frozen -= value.amount
    if (!success) account.available += value.amount
    value.status = value.day_end
      ? success
        ? 'FINISHED'
        : 'ABNORMAL'
      : finalStatus
    value.reason = !success ? str(body, 'reason', false) || finalStatus : ''
    value.update_time = runtime.now()
    store.set(
      'withdrawals',
      sharingKey(value.mchid, value.out_request_no),
      value,
    )
    runtime.notify(
      value.notify_url,
      'MCHWITHDRAW.CHANGE',
      withdrawalResponse(value),
      'mch_withdraw',
    )
    return withdrawalResponse(value)
  }
  runtime.actions.set('complete-withdrawal', completeWithdrawal)
  const createWithdrawal = (
    body: Data,
    platform: boolean,
    dayEnd = false,
  ): Data => {
    const mchid = platform ? runtime.config.spMchid : str(body, 'sub_mchid')
    const number = orderNumber(body, 'out_request_no', true)
    return runtime.idempotent(
      'withdrawals',
      sharingKey(mchid, number),
      body,
      () => {
        if (
          !platform &&
          store.get<Data>('merchants', mchid)?.merchant_state ===
            'HAS_BEEN_CANCELLED'
        )
          fail(403, 'NO_AUTH', '已注销商户须使用注销后提现接口')
        const type = dayEnd
          ? 'BASIC'
          : enumValue(
              body,
              'account_type',
              ['BASIC', 'OPERATION', 'FEES'],
              platform ? undefined : 'BASIC',
            )
        const account = runtime.account(mchid, type)
        let amount: number
        if (dayEnd) {
          const method = enumValue(body, 'calculate_amount_type', [
            'ONLY_DAY_END_BALANCE',
            'ALLOW_CURRENT_BALANCE',
          ])
          const reserve =
            body.reserve_amount === undefined ? 0 : int(body, 'reserve_amount')
          const day = new Date(Date.parse(runtime.now()) - 86_400_000)
            .toISOString()
            .slice(0, 10)
          const snapshot = balance(mchid, type, day, true)
          const ending = Number(snapshot.available_amount)
          if (method === 'ONLY_DAY_END_BALANCE' && account.available < ending)
            fail(403, 'NOT_ENOUGH', '当前余额少于日终余额')
          amount =
            (method === 'ALLOW_CURRENT_BALANCE'
              ? Math.min(account.available, ending)
              : ending) - reserve
          if (amount <= 0)
            fail(400, 'PARAM_ERROR', '日终余额减去留存额后的提现金额必须大于零')
        } else amount = int(body, 'amount', 1)
        if (amount > 80_000_000_000)
          fail(400, 'PARAM_ERROR', '提现金额不能超过 8 亿元')
        if (account.available < amount)
          fail(403, 'NOT_ENOUGH', '账户可用余额不足')
        account.available -= amount
        account.frozen += amount
        const value: Withdrawal = {
          mchid,
          ...(platform
            ? {}
            : { sub_mchid: mchid, sp_mchid: runtime.config.spMchid }),
          account_type: type,
          withdraw_id: runtime.id('W'),
          out_request_no: number,
          amount,
          status: dayEnd ? 'PROCESSING' : 'CREATE_SUCCESS',
          day_end: dayEnd,
          create_time: runtime.now(),
          update_time: runtime.now(),
          reason: '',
          remark: str(body, 'remark', false),
          bank_memo: str(body, 'bank_memo', false),
          account_number: '8888',
          account_bank: 'MOCK',
          bank_name: '模拟银行',
          solution: '',
          notify_url: str(body, 'notify_url', false),
        }
        store.set('withdrawals', sharingKey(mchid, number), value)
        if (runtime.config.autoComplete)
          completeWithdrawal({ withdraw_id: value.withdraw_id })
        return dayEnd
          ? withdrawalResponse(value)
          : {
              ...(platform ? {} : { sub_mchid: mchid }),
              withdraw_id: value.withdraw_id,
              out_request_no: number,
            }
      },
    )
  }
  runtime.route('POST', '/v3/ecommerce/fund/withdraw', ({ body }) =>
    createWithdrawal(body, false),
  )
  runtime.route('POST', '/v3/merchant/fund/withdraw', ({ body }) =>
    createWithdrawal(body, true),
  )
  runtime.route(
    'POST',
    '/v3/platsolution/ecommerce/withdraw/day-end-balance-withdraw',
    ({ body }) => createWithdrawal(body, false, true),
  )
  const queryWithdrawal = (
    params: Data,
    query: Data,
    platform: boolean,
    dayEnd = false,
  ): Data => {
    const mchid = platform ? runtime.config.spMchid : str(query, 'sub_mchid')
    const id = str(params, 'withdraw_id', false)
    const number = str(params, 'out_request_no', !id)
    const value = id
      ? store
          .values<Withdrawal>('withdrawals')
          .find((item) => item.withdraw_id === id && item.mchid === mchid)
      : store.get<Withdrawal>('withdrawals', sharingKey(mchid, number))
    if (!value || value.day_end !== dayEnd)
      fail(404, 'RESOURCE_NOT_EXISTS', '提现申请不存在')
    return withdrawalResponse(value)
  }
  runtime.route(
    'GET',
    '/v3/ecommerce/fund/withdraw/out-request-no/:out_request_no',
    ({ params, query }) => queryWithdrawal(params, query, false),
  )
  runtime.route(
    'GET',
    '/v3/ecommerce/fund/withdraw/:withdraw_id',
    ({ params, query }) => queryWithdrawal(params, query, false),
  )
  runtime.route(
    'GET',
    '/v3/merchant/fund/withdraw/out-request-no/:out_request_no',
    ({ params, query }) => queryWithdrawal(params, query, true),
  )
  runtime.route(
    'GET',
    '/v3/merchant/fund/withdraw/withdraw-id/:withdraw_id',
    ({ params, query }) => queryWithdrawal(params, query, true),
  )
  runtime.route(
    'GET',
    '/v3/platsolution/ecommerce/withdraw/day-end-balance-withdraw/out-request-no/:out_request_no',
    ({ params, query }) => queryWithdrawal(params, query, false, true),
  )
}

function registerOverseas(
  runtime: Runtime,
  paidOrder: (data: Data, sharing?: boolean) => Order,
): void {
  const { store } = runtime
  const available = (order: Order): number => {
    const reserved = store
      .values<Overseas>('overseas')
      .filter(
        (value) =>
          value.transaction_id === order.transaction_id &&
          value.result !== 'FAIL',
      )
      .reduce((sum, value) => sum + value.amount, 0)
    const refundReservations = store
      .values<Data>('refunds')
      .filter(
        (value) =>
          value.transaction_id === order.transaction_id &&
          value.status !== 'CLOSED',
      )
      .reduce((sum, value) => sum + Number(obj(value.amount).refund ?? 0), 0)
    return Math.max(
      0,
      order.amount.total -
        Math.max(order.refunded, refundReservations) -
        reserved,
    )
  }
  const response = (value: Overseas): Data => {
    const {
      transaction_id: _transaction,
      create_time: _create,
      ...result
    } = value
    return result
  }
  const completeOverseas = (body: Data): Data => {
    const key = sharingKey(str(body, 'sub_mchid'), str(body, 'out_order_id'))
    const value = store.get<Overseas>('overseas', key)
    if (!value) fail(404, 'RESOURCE_NOT_EXISTS', '出境申请不存在')
    if (value.result !== 'ACCEPT') return response(value)
    const success = body.success !== false
    const account = runtime.account(value.sub_mchid)
    if (account.frozen < value.amount)
      fail(403, 'NOT_ENOUGH', '出境冻结余额不足')
    account.frozen -= value.amount
    if (!success) account.available += value.amount
    value.result = success ? 'SUCCESS' : 'FAIL'
    if (success)
      Object.assign(value, {
        foreign_amount: value.amount,
        departure_amount: value.amount,
        fee: 0,
        rate: 100_000_000,
        exchange_rate_time: runtime.now(),
        charge_mchid: value.sub_mchid,
        charge_account_type: 'BASIC',
      })
    else value.fail_reason = str(body, 'fail_reason', false) || 'SYSTEM_ERROR'
    store.set('overseas', key, value)
    return response(value)
  }
  runtime.actions.set('complete-overseas', completeOverseas)
  runtime.route(
    'GET',
    '/v3/funds-to-oversea/transactions/:transaction_id/available_abroad_amounts',
    ({ params, query }) => {
      const order = paidOrder({
        ...query,
        transaction_id: params.transaction_id,
      })
      return {
        transaction_id: order.transaction_id,
        available_abroad_amount: available(order),
      }
    },
  )
  runtime.route('POST', '/v3/funds-to-oversea/orders', ({ body }) => {
    const mchid = str(body, 'sub_mchid')
    const number = orderNumber(body, 'out_order_id')
    return runtime.idempotent(
      'overseas',
      sharingKey(mchid, number),
      body,
      () => {
        const order = paidOrder(body)
        const amount = int(body, 'amount', 1)
        if (amount > available(order))
          fail(403, 'DEPARTURE_AMOUNT_NO_ENOUGH', '订单剩余可出境金额不足')
        const currency = enumValue(body, 'foreign_currency', [
          'HKD',
          'USD',
          'EUR',
          'JPY',
          'GBP',
          'CAD',
          'AUD',
          'SGD',
          'NZD',
          'KRW',
          'QAR',
          'MOP',
          'AED',
          'MYR',
          'EGP',
          'THB',
          'PHP',
          'MNT',
          'TRY',
          'CZK',
          'KHR',
          'HUF',
        ])
        const goods = arr(body.goods_info)
        if (goods.length === 0 || goods.length > 10)
          fail(400, 'PARAM_ERROR', 'goods_info 必须包含 1 至 10 个商品')
        for (const good of goods) {
          str(good, 'goods_name')
          str(good, 'goods_category')
          int(good, 'goods_unit_price', 1)
          int(good, 'goods_quantity', 1)
        }
        const seller = obj(body.seller_info)
        for (const field of [
          'oversea_business_name',
          'oversea_shop_name',
          'seller_id',
        ])
          str(seller, field)
        str(obj(body.payee_info), 'payee_id')
        const presale =
          body.presale_info === undefined ? undefined : obj(body.presale_info)
        if (presale) {
          enumValue(presale, 'type', ['DEPOSIT', 'BALANCE'])
          int(presale, 'total_amount', 1)
          if (presale.type === 'BALANCE') str(presale, 'deposit_transaction_id')
        }
        if (!(presale?.type === 'DEPOSIT' && !presale.balance_transaction_id)) {
          const express = obj(body.express_info)
          str(express, 'courier_number')
          str(express, 'express_company_name')
        }
        const account = runtime.account(mchid)
        if (account.available < amount)
          fail(403, 'BASIC_AMOUNT_NO_ENOUGH', '二级商户基本账户可用余额不足')
        account.available -= amount
        account.frozen += amount
        const value: Overseas = {
          sub_mchid: mchid,
          transaction_id: order.transaction_id,
          out_order_id: number,
          order_id: runtime.id('O'),
          amount,
          foreign_currency: currency,
          result: 'ACCEPT',
          create_time: runtime.now(),
          estimate_exchange_rate_time: runtime.now(),
        }
        store.set('overseas', sharingKey(mchid, number), value)
        return runtime.config.autoComplete
          ? completeOverseas({ sub_mchid: mchid, out_order_id: number })
          : response(value)
      },
    )
  })
  runtime.route(
    'GET',
    '/v3/funds-to-oversea/orders/:out_order_id',
    ({ params, query }) => {
      const value = store.get<Overseas>(
        'overseas',
        sharingKey(str(query, 'sub_mchid'), str(params, 'out_order_id')),
      )
      if (!value || value.transaction_id !== str(query, 'transaction_id'))
        fail(404, 'RESOURCE_NOT_EXISTS', '出境申请不存在')
      return response(value)
    },
  )
}

function registerBills(runtime: Runtime): void {
  const { store } = runtime
  const inDate = (value: object, date: string): boolean => {
    const data = value as Data
    return (
      String(
        data.success_time ??
          data.finish_time ??
          data.update_time ??
          data.create_time ??
          '',
      ).slice(0, 10) === date
    )
  }
  const merchantMatches = (
    value: { sub_mchid?: unknown; mchid?: unknown },
    mchid: string,
  ): boolean => !mchid || value.sub_mchid === mchid || value.mchid === mchid
  const requestBill = (kind: string, query: Data): Data => {
    const date = dateValue(query, 'bill_date')
    const mchid = str(query, 'sub_mchid', false)
    const tarType =
      query.tar_type === undefined ? '' : enumValue(query, 'tar_type', ['GZIP'])
    let rows: unknown[][]
    if (kind === 'trade') {
      const type = enumValue(
        query,
        'bill_type',
        ['ALL', 'SUCCESS', 'REFUND'],
        'ALL',
      )
      const orders = store
        .values<Order>('orders')
        .filter(
          (order) =>
            merchantMatches(order, mchid) &&
            inDate(order, date) &&
            ['SUCCESS', 'REFUND'].includes(order.trade_state) &&
            (type !== 'REFUND' || order.refunded > 0),
        )
      rows = [
        [
          '交易时间',
          '公众账号ID',
          '商户号',
          '子商户号',
          '微信订单号',
          '商户订单号',
          '交易类型',
          '交易状态',
          '总金额',
          '退款金额',
          '商品名称',
          '商户数据包',
        ],
        ...orders.map((order) => [
          order.success_time,
          order.sp_appid,
          order.sp_mchid,
          order.sub_mchid,
          `\`${order.transaction_id}`,
          `\`${order.out_trade_no}`,
          order.trade_type,
          order.trade_state,
          (order.amount.total / 100).toFixed(2),
          (order.refunded / 100).toFixed(2),
          order.description,
          order.attach,
        ]),
        ['总交易单数', '总交易额', '总退款金额'],
        [
          orders.length,
          (
            orders.reduce((sum, order) => sum + order.amount.total, 0) / 100
          ).toFixed(2),
          (
            orders.reduce((sum, order) => sum + order.refunded, 0) / 100
          ).toFixed(2),
        ],
      ]
    } else if (kind === 'sharing') {
      const sharings = store
        .values<Sharing>('profitsharing')
        .filter((value) => merchantMatches(value, mchid) && inDate(value, date))
      rows = [
        [
          '分账时间',
          '二级商户号',
          '微信订单号',
          '商户分账单号',
          '微信分账单号',
          '接收方类型',
          '接收方账号',
          '分账金额',
          '分账状态',
          '分账描述',
        ],
        ...sharings.flatMap((value) =>
          value.receivers.map((receiver) => [
            receiver.finish_time ?? value.create_time,
            value.sub_mchid,
            `\`${value.transaction_id}`,
            `\`${value.out_order_no}`,
            `\`${value.order_id}`,
            receiver.type,
            `\`${receiver.receiver_account}`,
            (receiver.amount / 100).toFixed(2),
            receiver.result,
            receiver.description,
          ]),
        ),
      ]
    } else if (kind === 'overseas') {
      const values = store
        .values<Overseas>('overseas')
        .filter((value) => merchantMatches(value, mchid) && inDate(value, date))
      rows = [
        [
          '出境时间',
          '二级商户号',
          '微信订单号',
          '商户出境单号',
          '微信出境单号',
          '出境状态',
          '人民币金额',
          '境外币种',
          '境外金额',
          '汇率',
        ],
        ...values.map((value) => [
          value.exchange_rate_time ?? value.create_time,
          value.sub_mchid,
          `\`${value.transaction_id}`,
          `\`${value.out_order_id}`,
          `\`${value.order_id}`,
          value.result,
          (value.amount / 100).toFixed(2),
          value.foreign_currency,
          value.foreign_amount,
          value.rate,
        ]),
      ]
    } else if (kind === 'withdrawal') {
      const values = store
        .values<Withdrawal>('withdrawals')
        .filter(
          (value) =>
            inDate(value, date) &&
            ['FAIL', 'REFUND', 'CLOSE', 'ABNORMAL'].includes(value.status),
        )
      rows = [
        [
          '更新时间',
          '商户号',
          '商户提现单号',
          '微信提现单号',
          '提现金额',
          '状态',
          '原因',
        ],
        ...values.map((value) => [
          value.update_time,
          value.mchid,
          `\`${value.out_request_no}`,
          `\`${value.withdraw_id}`,
          (value.amount / 100).toFixed(2),
          value.status,
          value.reason,
        ]),
      ]
    } else {
      const accountType =
        kind === 'subfund'
          ? enumValue(query, 'account_type', ['ALL'])
          : enumValue(
              query,
              'account_type',
              ['BASIC', 'OPERATION', 'FEES'],
              'BASIC',
            )
      const values: unknown[][] = []
      const add = (
        time: unknown,
        merchant: string,
        type: string,
        voucher: unknown,
        business: string,
        amount: number,
      ) => {
        if (
          String(time).slice(0, 10) !== date ||
          (kind === 'subfund'
            ? merchant === runtime.config.spMchid ||
              (!!mchid && merchant !== mchid)
            : merchant !== runtime.config.spMchid || type !== accountType)
        )
          return
        values.push([
          time,
          merchant,
          type,
          `\`${String(voucher)}`,
          business,
          amount >= 0 ? '收入' : '支出',
          (Math.abs(amount) / 100).toFixed(2),
        ])
      }
      for (const order of store.values<Order>('orders'))
        if (['SUCCESS', 'REFUND'].includes(order.trade_state))
          add(
            order.success_time,
            order.sub_mchid,
            'BASIC',
            order.transaction_id,
            '交易',
            order.amount.total,
          )
      for (const sharing of store.values<Sharing>('profitsharing'))
        for (const receiver of sharing.receivers)
          if (receiver.result === 'SUCCESS') {
            add(
              receiver.finish_time,
              sharing.sub_mchid,
              'BASIC',
              receiver.detail_id,
              '分账',
              -receiver.amount,
            )
            add(
              receiver.finish_time,
              receiver.receiver_account,
              'BASIC',
              receiver.detail_id,
              '分账',
              receiver.amount,
            )
          }
      for (const value of store.values<Data>('profitsharing_returns')) {
        add(
          value.finish_time,
          String(value.return_mchid),
          'BASIC',
          value.return_no,
          '分账回退',
          -Number(value.amount),
        )
        add(
          value.finish_time,
          String(value.sub_mchid),
          'BASIC',
          value.return_no,
          '分账回退',
          Number(value.amount),
        )
      }
      for (const value of store.values<Subsidy>('subsidies')) {
        add(
          value.success_time,
          runtime.config.spMchid,
          'OPERATION',
          value.subsidy_id,
          '补差',
          -value.amount,
        )
        add(
          value.success_time,
          value.sub_mchid,
          'BASIC',
          value.subsidy_id,
          '补差',
          value.amount,
        )
      }
      for (const value of store.values<Data>('subsidy_returns')) {
        add(
          value.success_time,
          runtime.config.spMchid,
          'OPERATION',
          value.subsidy_refund_id,
          '补差回退',
          Number(value.amount),
        )
        add(
          value.success_time,
          String(value.sub_mchid),
          'BASIC',
          value.subsidy_refund_id,
          '补差回退',
          -Number(value.amount),
        )
      }
      for (const value of store.values<Withdrawal>('withdrawals'))
        if (value.status === 'SUCCESS' || value.status === 'FINISHED')
          add(
            value.update_time,
            value.mchid,
            value.account_type,
            value.withdraw_id,
            '提现',
            -value.amount,
          )
      for (const value of store.values<Data>('cancelWithdraws'))
        if (value.funds_status === 'PAID') {
          for (const reservation of arr(value.reserved))
            add(
              value.modify_time,
              String(value.sub_mchid),
              String(reservation.account_type),
              value.applyment_id,
              '商户注销提现',
              -Number(reservation.amount),
            )
        }
      for (const value of store.values<Data>('riskWithdrawals'))
        if (value.funds_status === 'PAID') {
          const types: Record<string, string> = {
            BASIC_ACCOUNT: 'BASIC',
            OPERATE_ACCOUNT: 'OPERATION',
            MARGIN_ACCOUNT: 'DEPOSIT',
          }
          const type = types[String(value.out_account_type)] ?? 'BASIC'
          add(
            value.modify_time,
            String(value.sub_mchid),
            type,
            value.applyment_id,
            '商户注销提现',
            -Number(value.amount),
          )
        }
      for (const value of store.values<Overseas>('overseas'))
        if (value.result === 'SUCCESS')
          add(
            value.exchange_rate_time,
            value.sub_mchid,
            'BASIC',
            value.order_id,
            '出境',
            -value.amount,
          )
      for (const value of store.values<Data>('refunds'))
        if (value.status === 'SUCCESS') {
          const amount = obj(value.amount)
          if (Array.isArray(value.reservations))
            for (const reservation of arr(value.reservations))
              add(
                value.success_time,
                String(reservation.mchid),
                'BASIC',
                value.refund_id,
                '退款',
                -Number(reservation.amount),
              )
          else
            add(
              value.success_time,
              String(value.sub_mchid),
              'BASIC',
              value.refund_id,
              '退款',
              -Number(amount.refund ?? 0),
            )
        }
      for (const value of store.values<Data>('refund_advances'))
        if (value.result === 'SUCCESS') {
          add(
            value.success_time,
            String(value.payer_mchid),
            String(value.payer_account),
            value.advance_return_id,
            '垫付退款回补',
            -Number(value.return_amount),
          )
          add(
            value.success_time,
            String(value.payee_mchid),
            String(value.payee_account),
            value.advance_return_id,
            '垫付退款回补',
            Number(value.return_amount),
          )
        }
      rows = [
        [
          '记账时间',
          '商户号',
          '账户类型',
          '业务凭证号',
          '业务名称',
          '收支类型',
          '收支金额',
        ],
        ...values,
        ['总记录数', '总收入', '总支出'],
        [
          values.length,
          values
            .filter((value) => value[5] === '收入')
            .reduce((sum, value) => sum + Number(value[6]), 0)
            .toFixed(2),
          values
            .filter((value) => value[5] === '支出')
            .reduce((sum, value) => sum + Number(value[6]), 0)
            .toFixed(2),
        ],
      ]
    }
    const raw = Buffer.from(csv(rows), 'utf8')
    const bytes = tarType ? gzipSync(raw) : raw
    const token = runtime.id('bill')
    const bill: Bill = {
      data: bytes.toString('base64'),
      compressed: !!tarType,
      expires_at:
        Date.parse(runtime.now()) + (kind === 'sharing' ? 30_000 : 300_000),
    }
    const result: Data = {
      hash_type: 'SHA1',
      hash_value: createHash('sha1').update(raw).digest('hex'),
      download_url: `${runtime.config.baseUrl.replace(/\/$/, '')}/v3/billdownload/file?token=${encodeURIComponent(token)}`,
    }
    if (kind === 'subfund') {
      const algorithm = enumValue(query, 'algorithm', [
        'AEAD_AES_256_GCM',
        'SM4_GCM',
      ])
      if (algorithm !== 'AEAD_AES_256_GCM')
        fail(
          400,
          'PARAM_ERROR',
          '本地模拟暂不支持 SM4_GCM，请使用 AEAD_AES_256_GCM',
        )
      const publicKey = runtime.crypto.merchantPublicKey
      const key = Buffer.from(randomBytes(16).toString('hex'))
      const nonce = randomBytes(6).toString('hex')
      const cipher = createCipheriv('aes-256-gcm', key, nonce)
      const encrypted = Buffer.concat([
        cipher.update(bytes),
        cipher.final(),
        cipher.getAuthTag(),
      ])
      bill.data = encrypted.toString('base64')
      bill.encrypted = algorithm
      result.encrypt_key = publicEncrypt(
        {
          key: publicKey,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha1',
        },
        key,
      ).toString('base64')
      result.nonce = nonce
      result.bill_sequence = 1
    }
    store.set('bills', token, bill)
    return kind === 'subfund'
      ? { download_bill_count: 1, download_bill_list: [result] }
      : result
  }
  runtime.route('GET', '/v3/bill/tradebill', ({ query }) =>
    requestBill('trade', query),
  )
  runtime.route('GET', '/v3/bill/fundflowbill', ({ query }) =>
    requestBill('fund', query),
  )
  runtime.route('GET', '/v3/profitsharing/bills', ({ query }) =>
    requestBill('sharing', query),
  )
  runtime.route('GET', '/v3/ecommerce/bill/fundflowbill', ({ query }) =>
    requestBill('subfund', query),
  )
  runtime.route('GET', '/v3/funds-to-oversea/bill-download-url', ({ query }) =>
    requestBill('overseas', query),
  )
  runtime.route(
    'GET',
    '/v3/merchant/fund/withdraw/bill-type/:bill_type',
    ({ query, params }) => {
      enumValue(params, 'bill_type', ['NO_SUCC'])
      return requestBill('withdrawal', query)
    },
  )
  const download = ({ query }: { query: Data }): Response => {
    const bill = store.get<Bill>('bills', str(query, 'token'))
    if (!bill || bill.expires_at <= Date.parse(runtime.now()))
      fail(400, 'INVALID_REQUEST', '账单下载地址无效或已过期')
    return new Response(new Uint8Array(Buffer.from(bill.data, 'base64')), {
      headers: {
        'Content-Type': bill.encrypted
          ? 'application/octet-stream'
          : bill.compressed
            ? 'application/gzip'
            : 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="bill.${bill.encrypted ? 'bin' : bill.compressed ? 'gzip' : 'csv'}"`,
      },
    })
  }
  runtime.route('GET', '/v3/billdownload/file', download)
  runtime.route('GET', '/v3/bill/downloadurl', download)
}
