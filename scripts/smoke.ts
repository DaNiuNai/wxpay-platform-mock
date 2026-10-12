import { readFileSync } from 'node:fs'
import {
  sign,
  verify,
  randomBytes,
  createHash,
  publicEncrypt,
  constants,
} from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import assert from 'node:assert/strict'
import type { Data } from '../src/types.js'

const args = process.argv.slice(2)
const base = (
  args.find((arg) => arg.startsWith('http')) ?? 'http://127.0.0.1:3000'
).replace(/\/$/, '')
const strict = args.includes('--strict')
const keyIndex = args.indexOf('--key')
const privateKey = strict
  ? readFileSync(
      keyIndex < 0 ? 'data/merchant_private_key.pem' : args[keyIndex + 1]!,
      'utf8',
    )
  : ''
const credentials = (await (
  await fetch(`${base}/mock/credentials`)
).json()) as Data
const request = async (
  method: string,
  path: string,
  data?: Data,
): Promise<Response> => {
  const body = data === undefined ? '' : JSON.stringify(data)
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (strict && path.startsWith('/v3/')) {
    const timestamp = String(Math.floor(Date.now() / 1000)),
      nonce = randomBytes(16).toString('hex')
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(`${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`),
      privateKey,
    ).toString('base64')
    headers.Authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${credentials.sp_mchid}",serial_no="${credentials.merchant_serial}",timestamp="${timestamp}",nonce_str="${nonce}",signature="${signature}"`
    headers['Wechatpay-Serial'] = String(credentials.platform_serial)
  }
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    ...(body ? { body } : {}),
  })
  if (!response.ok)
    throw new Error(
      `${method} ${path}: HTTP ${response.status} ${await response.text()}`,
    )
  if (path.startsWith('/v3/') && !response.headers.has('Content-Disposition')) {
    const signed = Buffer.from(
      `${response.headers.get('Wechatpay-Timestamp')}\n${response.headers.get('Wechatpay-Nonce')}\n${await response.clone().text()}\n`,
    )
    if (
      !verify(
        'RSA-SHA256',
        signed,
        String(credentials.platform_public_key),
        Buffer.from(response.headers.get('Wechatpay-Signature')!, 'base64'),
      )
    )
      throw new Error('模拟平台应答验签失败')
  }
  return response
}
const json = async (method: string, path: string, data?: Data) =>
  (await (await request(method, path, data)).json()) as Data
const suffix = `${Date.now()}${randomBytes(2).toString('hex')}`
const sub = String(credentials.sub_mchid)
const startingBalance = await json('GET', `/v3/ecommerce/fund/balance/${sub}`)
const orderNumber = `SMOKE${suffix}`
await json('POST', '/v3/pay/partner/transactions/native', {
  sp_mchid: credentials.sp_mchid,
  sp_appid: credentials.sp_appid,
  sub_mchid: sub,
  out_trade_no: orderNumber,
  description: '联调冒烟测试商品',
  notify_url: `${base}/mock/receiver`,
  amount: { total: 1000, currency: 'CNY' },
  settle_info: { profit_sharing: true },
})
await json('POST', '/mock/actions/pay', {
  sub_mchid: sub,
  out_trade_no: orderNumber,
})
const order = await json(
  'GET',
  `/v3/pay/partner/transactions/out-trade-no/${orderNumber}?sp_mchid=${credentials.sp_mchid}&sub_mchid=${sub}`,
)
assert.equal(order.trade_state, 'SUCCESS')
console.log(`支付成功：${order.transaction_id}`)
const shareNumber = `S${suffix}`
const receiverName = strict
  ? publicEncrypt(
      {
        key: String(credentials.platform_public_key),
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha1',
      },
      Buffer.from('联调测试平台'),
    ).toString('base64')
  : '联调测试平台'
await json('POST', '/v3/ecommerce/profitsharing/orders', {
  sub_mchid: sub,
  transaction_id: order.transaction_id,
  out_order_no: shareNumber,
  finish: true,
  receivers: [
    {
      type: 'MERCHANT_ID',
      receiver_account: credentials.sp_mchid,
      receiver_name: receiverName,
      amount: 100,
      description: '平台佣金',
    },
  ],
})
const sharing = await json('POST', '/mock/actions/complete-profitsharing', {
  sub_mchid: sub,
  out_order_no: shareNumber,
})
assert.equal(sharing.status, 'FINISHED')
console.log('分账成功：100分佣金，900分解冻')
const refund = await json('POST', '/v3/ecommerce/refunds/apply', {
  sub_mchid: sub,
  sp_appid: credentials.sp_appid,
  out_trade_no: orderNumber,
  out_refund_no: `R${suffix}`,
  notify_url: `${base}/mock/receiver`,
  amount: { total: 1000, refund: 200, currency: 'CNY' },
})
assert.equal(
  (
    await json('POST', '/mock/actions/complete-refund', {
      refund_id: refund.refund_id,
      sub_mchid: sub,
      status: 'SUCCESS',
    })
  ).status,
  'SUCCESS',
)
console.log('退款成功：200分')
const withdrawal = await json('POST', '/v3/ecommerce/fund/withdraw', {
  sub_mchid: sub,
  out_request_no: `W${suffix}`,
  amount: 200,
  notify_url: `${base}/mock/receiver`,
})
assert.equal(
  (
    await json('POST', '/mock/actions/complete-withdrawal', {
      withdraw_id: withdrawal.withdraw_id,
      status: 'SUCCESS',
    })
  ).status,
  'SUCCESS',
)
console.log('提现成功：200分')
const date = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
const bill = await json(
  'GET',
  `/v3/bill/tradebill?bill_date=${date}&sub_mchid=${sub}&bill_type=ALL&tar_type=GZIP`,
)
const download = new URL(String(bill.download_url))
const bytes = Buffer.from(
  await (
    await request('GET', download.pathname + download.search)
  ).arrayBuffer(),
)
const plaintext = gunzipSync(bytes)
if (createHash('sha1').update(plaintext).digest('hex') !== bill.hash_value)
  throw new Error('账单 SHA1 校验失败')
console.log('账单下载、GZIP解压、SHA1校验成功')
const endingBalance = await json('GET', `/v3/ecommerce/fund/balance/${sub}`)
assert.equal(
  endingBalance.available_amount,
  Number(startingBalance.available_amount) + 500,
)
assert.equal(endingBalance.pending_amount, startingBalance.pending_amount)
console.log('余额守恒校验成功，当前余额：', endingBalance)
