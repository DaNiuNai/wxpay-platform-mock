import { fail, obj, str } from './core.js'
import type { MiddlewareHandler } from 'hono'
import type { Runtime } from './core.js'
import type { Data } from './types.js'

interface TableDefinition {
  label: string
  editable?: boolean
  strings?: string[]
  emptyStrings?: string[]
  integers?: string[]
  objects?: string[]
  arrays?: string[]
  booleans?: string[]
  identity?: (value: Data) => string
}

const pair = (first: string, second: string) => (value: Data) =>
  `${value[first]}:${value[second]}`
const identity = (field: string) => (value: Data) => String(value[field])
const tables: Record<string, TableDefinition> = {
  orders: {
    label: '支付订单',
    strings: [
      'sp_appid',
      'sp_mchid',
      'sub_mchid',
      'out_trade_no',
      'transaction_id',
      'prepay_id',
      'trade_type',
      'trade_state',
      'description',
      'create_time',
      'time_expire',
      'amount.currency',
    ],
    emptyStrings: ['notify_url'],
    integers: ['amount.total', 'refunded', 'remaining'],
    objects: ['amount', 'payer', 'settle_info'],
    booleans: ['sharing_finished'],
    identity: pair('sub_mchid', 'out_trade_no'),
  },
  accounts: {
    label: '资金账户',
    strings: ['mchid', 'account_type'],
    integers: ['available', 'frozen'],
    identity: pair('mchid', 'account_type'),
  },
  merchants: {
    label: '二级商户',
    strings: [
      'sub_mchid',
      'sp_mchid',
      'merchant_state',
      'organization_type',
      'cert_number',
      'merchant_shortname',
      'sign_time',
    ],
    identity: identity('sub_mchid'),
  },
  combines: {
    label: '合单订单',
    strings: [
      'combine_appid',
      'combine_mchid',
      'combine_out_trade_no',
      'prepay_id',
      'trade_type',
    ],
    objects: ['combine_payer_info'],
    arrays: ['order_keys'],
    identity: pair('combine_mchid', 'combine_out_trade_no'),
  },
  refunds: {
    label: '退款',
    strings: [
      'refund_id',
      'out_refund_no',
      'sub_mchid',
      'sp_appid',
      'transaction_id',
      'out_trade_no',
      'create_time',
      'status',
      'channel',
      'user_received_account',
      'refund_account',
      'funds_account',
      'amount.currency',
    ],
    integers: ['amount.refund', 'amount.total', 'amount.payer_refund'],
    objects: ['amount'],
    arrays: ['reservations'],
    identity: pair('sub_mchid', 'out_refund_no'),
  },
  profitsharing: {
    label: '分账',
    strings: [
      'sub_mchid',
      'transaction_id',
      'out_order_no',
      'order_id',
      'status',
    ],
    arrays: ['receivers'],
    booleans: ['finish'],
    identity: pair('sub_mchid', 'out_order_no'),
  },
  profitsharing_returns: {
    label: '分账回退',
    strings: [
      'sub_mchid',
      'out_return_no',
      'out_order_no',
      'order_id',
      'return_no',
      'return_mchid',
      'result',
      'transaction_id',
      'description',
    ],
    integers: ['amount'],
    identity: pair('sub_mchid', 'out_return_no'),
  },
  subsidies: {
    label: '补差',
    strings: ['sub_mchid', 'transaction_id', 'subsidy_id', 'result'],
    integers: ['amount', 'returned'],
    identity: pair('sub_mchid', 'transaction_id'),
  },
  subsidy_returns: {
    label: '补差回退',
    strings: [
      'sub_mchid',
      'transaction_id',
      'out_order_no',
      'subsidy_refund_id',
      'result',
      'description',
    ],
    integers: ['amount'],
    identity: pair('sub_mchid', 'out_order_no'),
  },
  subsidy_cancellations: {
    label: '补差取消',
    strings: ['sub_mchid', 'transaction_id', 'result', 'description'],
    identity: identity('transaction_id'),
  },
  withdrawals: {
    label: '提现',
    strings: [
      'mchid',
      'account_type',
      'withdraw_id',
      'out_request_no',
      'status',
    ],
    integers: ['amount'],
    booleans: ['day_end'],
    identity: pair('mchid', 'out_request_no'),
  },
  applyments: {
    label: '进件申请',
    strings: ['out_request_no', 'applyment_state'],
    emptyStrings: ['sub_mchid'],
    integers: ['applyment_id'],
    objects: ['request'],
    identity: identity('applyment_id'),
  },
  settlements: {
    label: '结算账户',
    strings: [
      'account_type',
      'account_bank',
      'account_name',
      'account_number',
      'verify_result',
    ],
  },
  settlementApplications: {
    label: '结算账户修改申请',
    strings: [
      'application_no',
      'sub_mchid',
      'verify_result',
      'account.account_type',
      'account.account_bank',
      'account.account_name',
      'account.account_number',
    ],
    objects: ['account'],
    identity: identity('application_no'),
  },
  cancelWithdraws: {
    label: '注销及提现申请',
    strings: [
      'applyment_id',
      'out_request_no',
      'sub_mchid',
      'cancel_state',
      'withdraw',
      'funds_status',
    ],
    objects: ['request'],
    arrays: ['reserved'],
    identity: identity('applyment_id'),
  },
  legacyCancellations: {
    label: '旧版注销申请',
    strings: ['out_apply_no', 'sub_mchid', 'cancel_state'],
    objects: ['request'],
    identity: identity('out_apply_no'),
  },
  riskWithdrawals: {
    label: '注销后提现申请',
    strings: [
      'applyment_id',
      'out_request_no',
      'sub_mchid',
      'out_account_type',
      'state',
      'funds_status',
    ],
    integers: ['amount'],
    objects: ['request'],
    identity: identity('applyment_id'),
  },
  subjectAlterations: {
    label: '主体修改申请',
    strings: ['apply_id', 'merchant_code', 'out_request_no', 'state'],
    objects: ['request'],
    identity: identity('apply_id'),
  },
  overseas: {
    label: '资金出境申请',
    strings: ['sub_mchid', 'transaction_id', 'out_order_id', 'result'],
    integers: ['amount'],
    identity: pair('sub_mchid', 'out_order_id'),
  },
  receivers: {
    label: '分账接收方',
    strings: ['appid', 'type', 'account'],
    identity: (value) => `${value.appid}:${value.type}:${value.account}`,
  },
  bills: {
    label: '账单文件',
    emptyStrings: ['data'],
    integers: ['expires_at'],
    booleans: ['compressed'],
  },
  media: {
    label: '媒体材料',
    strings: ['media_id', 'filename', 'sha256', 'content', 'create_time'],
    integers: ['size'],
    identity: identity('media_id'),
  },
  faults: {
    label: '故障规则',
    strings: ['id', 'method', 'path', 'code', 'message'],
    integers: ['status', 'remaining', 'delay_ms'],
    identity: identity('id'),
  },
  notifications: {
    label: '通知队列',
    strings: [
      'id',
      'url',
      'status',
      'created_at',
      'body.id',
      'body.event_type',
    ],
    integers: ['attempts', 'next_attempt_at'],
    objects: ['body', 'body.resource'],
    identity: identity('id'),
  },
  refund_advances: {
    label: '垫付退款回补',
    strings: [
      'refund_id',
      'advance_return_id',
      'payer_mchid',
      'payer_account',
      'payee_mchid',
      'payee_account',
      'result',
    ],
    integers: ['return_amount'],
    identity: identity('refund_id'),
  },
  dayend_balances: { label: '日终余额快照', integers: ['available', 'frozen'] },
  requests: { label: '请求日志', editable: false },
  received_callbacks: { label: '已验签回调', editable: false },
}

function tableDefinition(name: string, writable = false): TableDefinition {
  if (!Object.hasOwn(tables, name))
    fail(404, 'RESOURCE_NOT_EXISTS', '数据库逻辑表不存在或不允许访问')
  const definition = tables[name]!
  if (writable && definition.editable === false)
    fail(403, 'NO_AUTH', '此逻辑表只允许读取')
  return definition
}

function recordKey(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 256 ||
    /\p{Cc}/u.test(value) ||
    ['__proto__', 'prototype', 'constructor'].includes(value)
  )
    fail(
      400,
      'PARAM_ERROR',
      'key 必须为 1 至 256 字符且不含控制字符或原型属性名',
    )
  return value
}

function rejectPrototypeFields(value: Data): void {
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }]
  while (pending.length) {
    const item = pending.pop()!
    if (!item.value || typeof item.value !== 'object') continue
    if (item.depth > 64)
      fail(400, 'PARAM_ERROR', '记录 JSON 嵌套不能超过 64 层')
    for (const [name, child] of Object.entries(item.value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(name))
        fail(400, 'PARAM_ERROR', '记录不允许包含原型属性名')
      pending.push({ value: child, depth: item.depth + 1 })
    }
  }
}

function fieldValue(value: Data, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (current, name) =>
        current && typeof current === 'object' && Object.hasOwn(current, name)
          ? (current as Data)[name]
          : undefined,
      value,
    )
}

function validateStructure(
  value: Data,
  definition: TableDefinition,
  prefix = 'value',
): void {
  for (const name of definition.strings ?? []) {
    const field = fieldValue(value, name)
    if (typeof field !== 'string' || !field.trim())
      fail(400, 'PARAM_ERROR', `${prefix}.${name} 必须为非空字符串`)
  }
  for (const name of definition.emptyStrings ?? [])
    if (typeof fieldValue(value, name) !== 'string')
      fail(400, 'PARAM_ERROR', `${prefix}.${name} 必须为字符串`)
  for (const name of definition.integers ?? []) {
    const field = fieldValue(value, name)
    if (!Number.isSafeInteger(field) || (field as number) < 0)
      fail(400, 'PARAM_ERROR', `${prefix}.${name} 必须为非负安全整数`)
  }
  for (const name of definition.objects ?? []) {
    const field = fieldValue(value, name)
    if (!field || typeof field !== 'object' || Array.isArray(field))
      fail(400, 'PARAM_ERROR', `${prefix}.${name} 必须为 JSON 对象`)
  }
  for (const name of definition.arrays ?? [])
    if (!Array.isArray(fieldValue(value, name)))
      fail(400, 'PARAM_ERROR', `${prefix}.${name} 必须为数组`)
  for (const name of definition.booleans ?? [])
    if (typeof fieldValue(value, name) !== 'boolean')
      fail(400, 'PARAM_ERROR', `${prefix}.${name} 必须为布尔值`)
}

function validateRecord(table: string, key: string, value: Data): void {
  const definition = tableDefinition(table, true)
  rejectPrototypeFields(value)
  validateStructure(value, definition)
  if (definition.identity && definition.identity(value) !== key)
    fail(
      400,
      'PARAM_ERROR',
      'key 与记录业务身份字段不一致，业务身份不能通过编辑改名',
    )
  if (
    table === 'combines' &&
    (value.order_keys as unknown[]).some(
      (item) => typeof item !== 'string' || !item,
    )
  )
    fail(400, 'PARAM_ERROR', 'value.order_keys 必须只包含非空订单键字符串')
  const arrayShape =
    table === 'profitsharing'
      ? {
          field: 'receivers',
          strings: [
            'type',
            'receiver_account',
            'description',
            'result',
            'detail_id',
          ],
          integers: ['amount', 'returned'],
        }
      : table === 'refunds'
        ? {
            field: 'reservations',
            strings: ['mchid', 'balance'],
            integers: ['amount', 'orderAmount'],
          }
        : table === 'cancelWithdraws'
          ? {
              field: 'reserved',
              strings: ['account_type'],
              integers: ['amount'],
            }
          : undefined
  if (arrayShape)
    for (const [index, entry] of (
      value[arrayShape.field] as unknown[]
    ).entries())
      validateStructure(
        obj(entry),
        {
          label: '',
          strings: arrayShape.strings,
          integers: arrayShape.integers,
        },
        `value.${arrayShape.field}[${index}]`,
      )
  if (
    table === 'faults' &&
    ((value.status as number) < 400 ||
      (value.status as number) > 599 ||
      (value.delay_ms as number) > 30000 ||
      !str(value, 'path').startsWith('/v3/'))
  )
    fail(
      400,
      'PARAM_ERROR',
      '故障规则要求 /v3/ 路径、HTTP 400 至 599、延迟最多 30000 毫秒',
    )
  if (
    table === 'dayend_balances' &&
    !/^[^:]+:[^:]+:\d{4}-\d{2}-\d{2}$/.test(key)
  )
    fail(400, 'PARAM_ERROR', '日终余额 key 必须为 商户号:账户类型:YYYY-MM-DD')
}

function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    fail(400, 'PARAM_ERROR', 'revision 必须为正安全整数')
  return value as number
}

function queryInteger(
  query: Data,
  name: string,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (query[name] === undefined) return fallback
  const text = str(query, name)
  if (
    !/^[1-9]\d*$/.test(text) ||
    !Number.isSafeInteger(Number(text)) ||
    Number(text) > maximum
  )
    fail(400, 'PARAM_ERROR', `${name} 必须为 1 至 ${maximum} 的整数`)
  return Number(text)
}

function mutationBody(
  body: Data,
  rawBody?: string,
): { key: string; value: Data } {
  if (Buffer.byteLength(rawBody ?? JSON.stringify(body), 'utf8') > 1024 * 1024)
    fail(413, 'PARAM_ERROR', '记录请求 JSON 不能超过 1 MiB')
  rejectPrototypeFields(body)
  return { key: recordKey(body.key), value: obj(body.value) }
}

/** CRUD 修改测试记录，不执行支付、分账或账户联动；提交由应用请求事务统一完成。 */
export function registerDatabase(runtime: Runtime): void {
  const { store, app } = runtime
  const sameOrigin: MiddlewareHandler = async (c, next) => {
    const origin = c.req.header('Origin')
    if (
      (origin && origin !== new URL(c.req.url).origin) ||
      c.req.header('Sec-Fetch-Site') === 'cross-site'
    )
      fail(400, 'PARAM_ERROR', '数据库控制请求必须来自当前服务同源页面')
    await next()
  }
  app.use('/mock/database', sameOrigin)
  app.use('/mock/database/*', sameOrigin)
  runtime.route('GET', '/mock/database', () => {
    const counts = new Map(
      store.listBuckets().map((item) => [item.name, item.count]),
    )
    return {
      info: store.info(),
      tables: Object.entries(tables).map(([name, definition]) => ({
        name,
        label: definition.label,
        count: counts.get(name) ?? 0,
        editable: definition.editable !== false,
      })),
    }
  })
  runtime.route('GET', '/mock/database/:table/records', ({ params, query }) => {
    const table = str(params, 'table')
    tableDefinition(table)
    const pageSize = queryInteger(query, 'pageSize', 25, 100)
    const page = queryInteger(
      query,
      'page',
      1,
      Math.floor(Number.MAX_SAFE_INTEGER / pageSize),
    )
    const search = str(query, 'search', false)
    if (search.length > 512)
      fail(400, 'PARAM_ERROR', 'search 不能超过 512 字符')
    return store.page(table, { search, page, pageSize })
  })
  runtime.route('GET', '/mock/database/:table/record', ({ params, query }) => {
    const table = str(params, 'table')
    tableDefinition(table)
    const record = store.record(table, recordKey(query.key))
    if (!record) fail(404, 'RESOURCE_NOT_EXISTS', '记录不存在')
    return record
  })
  runtime.route(
    'POST',
    '/mock/database/:table/records',
    ({ params, body, rawBody }) => {
      const table = str(params, 'table')
      tableDefinition(table, true)
      const { key, value } = mutationBody(body, rawBody)
      validateRecord(table, key, value)
      if (store.get(table, key) !== undefined)
        fail(409, 'CONFLICT', '记录 key 已存在，请修改 key 或编辑现有记录')
      store.set(table, key, value)
      return Response.json({ key, value }, { status: 201 })
    },
  )
  runtime.route(
    'PUT',
    '/mock/database/:table/record',
    ({ params, body, rawBody }) => {
      const table = str(params, 'table')
      tableDefinition(table, true)
      const { key, value } = mutationBody(body, rawBody)
      const expected = revision(body.revision)
      const current = store.record(table, key)
      if (!current) fail(404, 'RESOURCE_NOT_EXISTS', '记录不存在')
      if (current.revision !== expected)
        fail(409, 'CONFLICT', '记录已被其他请求修改，请刷新并重新编辑')
      validateRecord(table, key, value)
      store.set(table, key, value)
      return { key, value }
    },
  )
  runtime.route(
    'DELETE',
    '/mock/database/:table/record',
    ({ params, query }) => {
      const table = str(params, 'table')
      tableDefinition(table, true)
      const key = recordKey(query.key)
      const expected = queryInteger(query, 'revision', 0)
      revision(expected)
      const current = store.record(table, key)
      if (!current) fail(404, 'RESOURCE_NOT_EXISTS', '记录不存在')
      if (current.revision !== expected)
        fail(409, 'CONFLICT', '记录已被其他请求修改，请刷新后再删除')
      store.delete(table, key)
      return undefined
    },
  )
}
