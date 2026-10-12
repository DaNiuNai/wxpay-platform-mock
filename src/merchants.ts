import { createHash } from 'node:crypto'
import { fail, int, obj, str, type Data, type Runtime } from './core.js'

interface Merchant extends Data {
  sub_mchid: string
  sp_mchid: string
  merchant_state: string
  organization_type: string
  cert_number: string
  merchant_shortname: string
  sign_time: string
}

interface Application extends Data {
  applyment_id: number
  out_request_no: string
  applyment_state: string
  request: Data
  sub_mchid: string
}

interface SettlementApplication extends Data {
  application_no: string
  sub_mchid: string
  account: Data
  verify_result: string
}

interface Cancellation extends Data {
  applyment_id: string
  out_request_no: string
  sub_mchid: string
  cancel_state: string
  withdraw: string
  request: Data
  reserved: Array<{ account_type: string; amount: number }>
  funds_status: string
}

interface LegacyCancellation extends Data {
  out_apply_no: string
  sub_mchid: string
  cancel_state: string
  request: Data
}

interface RiskWithdrawal extends Data {
  applyment_id: string
  out_request_no: string
  sub_mchid: string
  out_account_type: string
  amount: number
  state: string
  funds_status: string
  request: Data
}

interface SubjectAlteration extends Data {
  apply_id: string
  merchant_code: string
  out_request_no: string
  state: string
  request: Data
}

const SUBJECT_TYPES: Record<string, string> = {
  '2': 'SUBJECT_TYPE_ENTERPRISE',
  '4': 'SUBJECT_TYPE_INDIVIDUAL',
  '3': 'SUBJECT_TYPE_INSTITUTIONS_CLONED',
  '2502': 'SUBJECT_TYPE_GOVERNMENT',
  '1708': 'SUBJECT_TYPE_OTHERS',
  '2401': 'SUBJECT_TYPE_MICRO',
  '2500': 'SUBJECT_TYPE_MICRO',
}

const APPLYMENT_STATES: Record<string, string> = {
  CHECKING: '资料校验中',
  ACCOUNT_NEED_VERIFY: '待账户验证',
  AUDITING: '审核中',
  REJECTED: '已驳回',
  NEED_SIGN: '待签约',
  FINISH: '完成',
  FROZEN: '已冻结',
  CANCELED: '已作废',
}
const CANCEL_STATES: Record<string, string> = {
  ACCEPTED: '已受理',
  REVIEWING: '审核中',
  REJECTED: '审批驳回',
  WAITING_MERCHANT_CONFIRM: '等待商户确认',
  REVOKED: '已撤销',
  SYSTEM_PROCESSING: '系统处理中',
  CANCELED: '已注销',
  FUND_PROCESSING: '资金处理中',
  FINISH: '注销完成',
}
export const MERCHANT_SENSITIVE_FIELDS = new Set([
  'id_card_name',
  'id_card_number',
  'id_doc_name',
  'id_doc_number',
  'id_doc_address',
  'ubo_id_doc_name',
  'ubo_id_doc_number',
  'ubo_id_doc_address',
  'contact_name',
  'contact_id_card_number',
  'mobile_phone',
  'contact_email',
  'account_name',
  'account_number',
  'card_name',
  'card_number',
  'card_address',
  'identification_name',
  'identification_no',
])
const ACCOUNT_TYPES: Record<string, string> = {
  BASIC_ACCOUNT: 'BASIC',
  OPERATE_ACCOUNT: 'OPERATION',
  MARGIN_ACCOUNT: 'DEPOSIT',
  TRADE_FEE_ACCOUNT: 'FEES',
}

function optionalObject(value: unknown): Data {
  return value === undefined || value === null ? {} : obj(value)
}

function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${fingerprint((value as Data)[key])}`,
      )
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

function oneOf(value: string, choices: string[], field: string): string {
  if (!choices.includes(value))
    fail(400, 'PARAM_ERROR', `${field} 不在允许的枚举范围内`)
  return value
}

function requestNumber(
  body: Data,
  key: string,
  maximum: number,
  pattern = /^[A-Za-z0-9_]+$/,
): string {
  const value = str(body, key)
  if (value.length > maximum || !pattern.test(value))
    fail(400, 'PARAM_ERROR', `${key} 格式错误`)
  return value
}

function fields(value: unknown, names: string[], field: string): Data {
  const data = obj(value)
  for (const name of names) {
    if (!str(data, name, false))
      fail(400, 'PARAM_ERROR', `${field}.${name} 必填`)
  }
  return data
}

function masked(value: string, leading: number, trailing: number): string {
  const suffix = trailing ? value.slice(-trailing) : ''
  if (value.length <= leading + trailing)
    return '*'.repeat(Math.max(1, value.length - trailing)) + suffix
  return (
    value.slice(0, leading) +
    '*'.repeat(value.length - leading - trailing) +
    suffix
  )
}

function html(value: unknown): string {
  const escapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return String(value).replace(/[&<>"']/g, (character) => escapes[character]!)
}

function confirmationPage(
  title: string,
  identifier: string,
  state: string,
  button: string,
  enabled: boolean,
): Response {
  return new Response(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(title)}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;background:#f4f7f5;color:#192b23;display:grid;place-items:center;min-height:100vh}main{background:white;border-radius:16px;padding:32px;max-width:420px;width:calc(100% - 96px);box-shadow:0 8px 32px #16352612}h1{font-size:23px}p{line-height:1.7;overflow-wrap:anywhere}.label{font-size:13px;color:#60776a}button{border:0;border-radius:8px;width:100%;padding:14px;background:#07a653;color:white;font:inherit;cursor:pointer}button:disabled{background:#869b8e;cursor:default}#result{min-height:24px;color:#287a4c}</style></head>
<body><main><p class="label">平台收付通 · 本地联调</p><h1>${html(title)}</h1><p class="label">申请编号</p><p>${html(identifier)}</p><p>当前状态：${html(state)}</p>
${enabled ? `<button id="confirm" type="button">${html(button)}</button>` : '<p>当前阶段无需确认。</p>'}<p id="result" role="status" aria-live="polite"></p></main>
<script>const button=document.getElementById('confirm');if(button)button.addEventListener('click',async()=>{button.disabled=true;const result=document.getElementById('result');result.textContent='正在提交…';try{const response=await fetch(window.location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const data=await response.json();if(!response.ok)throw new Error(data.message||'确认失败');window.location.reload()}catch(error){result.textContent=error.message;button.disabled=false}})</script></body></html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  )
}

/** 商户进件、结算资料、注销和主体变更均保存申请单，查询不会隐式推动审核。 */
export function registerMerchants(runtime: Runtime): void {
  const { store } = runtime

  if (!store.get<Merchant>('merchants', runtime.config.subMchid)) {
    store.set('merchants', runtime.config.subMchid, {
      sub_mchid: runtime.config.subMchid,
      sp_mchid: runtime.config.spMchid,
      merchant_state: 'NORMAL',
      organization_type: '2',
      cert_number: '91440300MA5MOCK001',
      merchant_shortname: '联调测试商户',
      merchant_name: '联调测试有限公司',
      legal_person: '张三',
      sign_time: runtime.now(),
    })
  }
  if (!store.get<Data>('settlements', runtime.config.subMchid)) {
    store.set('settlements', runtime.config.subMchid, {
      account_type: 'ACCOUNT_TYPE_BUSINESS',
      account_bank: '工商银行',
      account_name: '联调测试有限公司',
      account_number: '6222020000000000001',
      verify_result: 'VERIFY_SUCCESS',
    })
  }

  runtime.actions.set('merchant', (body) => {
    const allowed = new Set([
      'sub_mchid',
      'merchant_state',
      'organization_type',
      'cert_number',
      'merchant_name',
      'legal_person',
      'merchant_shortname',
      'sign_time',
      'block_reasons',
    ])
    for (const key of Object.keys(body))
      if (!allowed.has(key))
        fail(400, 'PARAM_ERROR', `商户资料字段 ${key} 不支持设置`)
    const mchid = str(body, 'sub_mchid')
    if (!/^\d{1,32}$/.test(mchid))
      fail(400, 'PARAM_ERROR', 'sub_mchid 必须为不超过 32 位的数字')
    const existing = store.get<Merchant>('merchants', mchid)
    if (existing && existing.sp_mchid !== runtime.config.spMchid)
      fail(403, 'NO_AUTH', '该商户不属于当前平台')
    const item: Merchant = existing
      ? { ...existing }
      : {
          sub_mchid: mchid,
          sp_mchid: runtime.config.spMchid,
          merchant_state: 'NORMAL',
          organization_type: '2',
          cert_number: `MOCK${mchid}`,
          merchant_shortname: `测试商户${mchid}`,
          merchant_name: `测试商户${mchid}`,
          legal_person: '张三',
          sign_time: runtime.now(),
        }
    if (body.merchant_state !== undefined)
      item.merchant_state = oneOf(
        str(body, 'merchant_state'),
        ['NORMAL', 'HAS_BEEN_CANCELLED'],
        'merchant_state',
      )
    if (body.organization_type !== undefined)
      item.organization_type = oneOf(
        str(body, 'organization_type'),
        [...Object.keys(SUBJECT_TYPES), ...Object.values(SUBJECT_TYPES)],
        'organization_type',
      )
    for (const field of [
      'cert_number',
      'merchant_name',
      'legal_person',
      'merchant_shortname',
      'sign_time',
    ]) {
      if (body[field] !== undefined) item[field] = str(body, field, false)
    }
    if (body.block_reasons !== undefined) {
      if (!Array.isArray(body.block_reasons))
        fail(400, 'PARAM_ERROR', 'block_reasons 必须为数组')
      item.block_reasons = body.block_reasons.map((value) => {
        const reason = obj(value)
        return {
          type: oneOf(
            str(reason, 'type'),
            [
              'CONSUMER_COMPLAINT_UNPROCESSED',
              'HAS_BLOCKING_CONTROL',
              'FUNDS_PENDING_PROCESSING',
              'OTHER_REASON',
            ],
            'block_reasons.type',
          ),
          description: str(reason, 'description'),
        }
      })
    }
    store.set('merchants', mchid, item)
    return item
  })

  function merchant(mchid: string, requireActive = false): Merchant {
    const item = store.get<Merchant>('merchants', mchid)
    if (!item || item.sp_mchid !== runtime.config.spMchid)
      fail(403, 'NO_AUTH', '该二级商户不属于当前平台')
    if (requireActive && item.merchant_state === 'HAS_BEEN_CANCELLED')
      fail(400, 'INVALID_REQUEST', '商户已注销')
    return item
  }

  function find<T extends Data>(table: string, key: string, value: string): T {
    const item = store
      .values<T>(table)
      .find((candidate) => String(candidate[key]) === value)
    if (!item) fail(404, 'RESOURCE_NOT_EXISTS', '申请单不存在')
    return item
  }

  function decrypt(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(decrypt)
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          MERCHANT_SENSITIVE_FIELDS.has(key) && typeof item === 'string'
            ? runtime.decryptSensitive(item)
            : decrypt(item),
        ]),
      )
    }
    return value
  }

  function bankAccount(body: Data): void {
    const number = str(body, 'account_number')
    str(body, 'account_bank')
    if (!/^\d{1,32}$/.test(number))
      fail(400, 'PARAM_ERROR', '银行账号必须为不超过 32 位的数字')
    if (
      body.account_bank === '其他银行' &&
      !body.bank_name &&
      !body.bank_branch_name &&
      !body.bank_branch_id
    ) {
      fail(400, 'PARAM_ERROR', '其他银行必须提供开户支行名称或联行号')
    }
  }

  function payee(value: unknown): Data {
    const data = fields(value, ['account_type'], 'payee_info')
    oneOf(
      str(data, 'account_type'),
      ['ACCOUNT_TYPE_CORPORATE', 'ACCOUNT_TYPE_PERSONAL'],
      'payee_info.account_type',
    )
    const bank = fields(
      data.bank_account_info,
      ['account_name', 'account_bank', 'account_number'],
      'payee_info.bank_account_info',
    )
    bankAccount(bank)
    if (data.account_type === 'ACCOUNT_TYPE_PERSONAL') {
      fields(
        data.identity_info,
        ['id_doc_type', 'identification_name', 'identification_no'],
        'payee_info.identity_info',
      )
    }
    return data
  }

  function validateApplyment(body: Data): void {
    const subject = oneOf(
      str(body, 'organization_type'),
      Object.keys(SUBJECT_TYPES),
      'organization_type',
    )
    str(body, 'merchant_shortname')
    if (subject !== '2401' && subject !== '2500') {
      fields(
        body.business_license_info,
        [
          'business_license_copy',
          'business_license_number',
          'merchant_name',
          'legal_person',
        ],
        'business_license_info',
      )
    }
    if (subject === '2500') str(body, 'business_addition_desc')
    if (body.id_holder_type === 'SUPER') {
      str(body, 'authorize_letter_copy')
    } else if (
      !body.id_doc_type ||
      body.id_doc_type === 'IDENTIFICATION_TYPE_MAINLAND_IDCARD'
    ) {
      fields(
        body.id_card_info,
        [
          'id_card_copy',
          'id_card_national',
          'id_card_name',
          'id_card_number',
          'id_card_valid_time_begin',
          'id_card_valid_time',
        ],
        'id_card_info',
      )
    } else {
      fields(
        body.id_doc_info,
        [
          'id_doc_name',
          'id_doc_number',
          'id_doc_copy',
          'doc_period_begin',
          'doc_period_end',
        ],
        'id_doc_info',
      )
    }
    const account = fields(
      body.account_info,
      ['bank_account_type', 'account_name', 'account_bank', 'account_number'],
      'account_info',
    )
    oneOf(
      str(account, 'bank_account_type'),
      ['74', '75'],
      'account_info.bank_account_type',
    )
    if (
      ['2', '3', '2502', '1708'].includes(subject) &&
      account.bank_account_type !== '74'
    ) {
      fail(400, 'PARAM_ERROR', '该主体类型必须使用对公银行账户')
    }
    if (
      ['2401', '2500'].includes(subject) &&
      account.bank_account_type !== '75'
    )
      fail(400, 'PARAM_ERROR', '小微/个人卖家必须使用经营者个人银行卡')
    bankAccount(account)
    const contact = fields(
      body.contact_info,
      ['contact_type', 'contact_name', 'mobile_phone'],
      'contact_info',
    )
    oneOf(
      str(contact, 'contact_type'),
      ['65', '66'],
      'contact_info.contact_type',
    )
    if (['2401', '2500'].includes(subject) && contact.contact_type !== '65')
      fail(400, 'PARAM_ERROR', '小微/个人卖家的超级管理员必须是经营者')
    const scene = fields(
      body.sales_scene_info,
      ['store_name'],
      'sales_scene_info',
    )
    if (!scene.store_url && !scene.store_qr_code)
      fail(400, 'PARAM_ERROR', '店铺链接或二维码至少提供一个')
    if (scene.store_url && !/^https?:\/\//.test(str(scene, 'store_url')))
      fail(400, 'PARAM_ERROR', '店铺链接必须以 http:// 或 https:// 开头')
    if (body.finance_institution === true) {
      const finance = fields(
        body.finance_institution_info,
        ['finance_type'],
        'finance_institution_info',
      )
      if (
        !Array.isArray(finance.finance_license_pics) ||
        !finance.finance_license_pics.length
      )
        fail(400, 'PARAM_ERROR', '金融机构许可证图片必填')
    }
  }

  function registerApplyment(item: Application): void {
    const license = optionalObject(item.request.business_license_info)
    const card = optionalObject(item.request.id_card_info)
    const subMchid = item.sub_mchid || runtime.id('').slice(-10)
    item.sub_mchid = subMchid
    if (item.applyment_state === 'FINISH') {
      if (!store.get<Merchant>('merchants', subMchid))
        store.set('merchants', subMchid, {
          sub_mchid: subMchid,
          sp_mchid: runtime.config.spMchid,
          merchant_state: 'NORMAL',
          organization_type: str(item.request, 'organization_type'),
          cert_number:
            license.business_license_number ||
            card.id_card_number ||
            optionalObject(item.request.id_doc_info).id_doc_number ||
            '',
          merchant_name:
            license.merchant_name ||
            card.id_card_name ||
            item.request.merchant_shortname,
          legal_person: license.legal_person || card.id_card_name || '',
          merchant_shortname: item.request.merchant_shortname,
          sign_time: runtime.now(),
        })
      const bank = obj(item.request.account_info)
      if (!store.get<Data>('settlements', subMchid))
        store.set('settlements', subMchid, {
          ...bank,
          account_type:
            bank.bank_account_type === '75'
              ? 'ACCOUNT_TYPE_PRIVATE'
              : 'ACCOUNT_TYPE_BUSINESS',
          verify_result: 'VERIFY_SUCCESS',
        })
      runtime.account(subMchid)
    }
    store.set('applyments', String(item.applyment_id), item)
  }

  function applymentResponse(item: Application): Data {
    const result: Data = {
      applyment_id: item.applyment_id,
      out_request_no: item.out_request_no,
      applyment_state: item.applyment_state,
      applyment_state_desc: APPLYMENT_STATES[item.applyment_state],
      sign_state:
        item.applyment_state === 'FINISH'
          ? 'SIGNED'
          : item.applyment_state === 'NEED_SIGN'
            ? 'UNSIGNED'
            : 'NOT_SIGNABLE',
    }
    if (['FINISH', 'NEED_SIGN'].includes(item.applyment_state))
      result.sub_mchid = item.sub_mchid
    if (item.applyment_state === 'NEED_SIGN')
      result.sign_url = `${runtime.config.baseUrl}/__mock/sign/${item.applyment_id}`
    if (['REJECTED', 'FROZEN'].includes(item.applyment_state)) {
      result.audit_detail = item.audit_detail || [
        { param_name: 'business_license_info', reject_reason: '模拟审核驳回' },
      ]
      if (item.wxpay_sign_required !== undefined)
        result.wxpay_sign_required = item.wxpay_sign_required
    }
    if (item.applyment_state === 'ACCOUNT_NEED_VERIFY') {
      const bank = obj(item.request.account_info)
      result.account_validation = {
        account_name: runtime.encryptSensitive(
          String(bank.account_name || '张三'),
        ),
        ...(bank.bank_account_type === '75'
          ? {
              account_no: runtime.encryptSensitive(String(bank.account_number)),
            }
          : {}),
        pay_amount: 1,
        destination_account_number: '6222020000000000000',
        destination_account_name: '微信支付模拟验证账户',
        destination_account_bank: '工商银行',
        city: '广东省深圳市',
        remark: String(item.applyment_id),
        deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      }
      result.legal_validation_url = `${runtime.config.baseUrl}/__mock/verify/${item.applyment_id}`
    }
    return result
  }

  const submitApplyment = ({ body }: { body: Data }): Data => {
    const outRequestNo = requestNumber(body, 'out_request_no', 124, /^[\s\S]+$/)
    const clean = obj(decrypt(body))
    validateApplyment(clean)
    const existing = store
      .values<Application>('applyments')
      .find((item) => item.out_request_no === outRequestNo)
    if (existing?.applyment_state === 'REJECTED') {
      existing.request = clean
      existing.request_fingerprint = fingerprint(body)
      existing.applyment_state = runtime.config.autoComplete
        ? 'FINISH'
        : 'CHECKING'
      delete existing.audit_detail
      registerApplyment(existing)
      return {
        applyment_id: existing.applyment_id,
        out_request_no: outRequestNo,
      }
    }
    if (existing) {
      if (existing.request_fingerprint !== fingerprint(body))
        fail(
          400,
          'RESOURCE_ALREADY_EXISTS',
          '相同业务申请编号已有申请单且参数不一致',
        )
      return {
        applyment_id: existing.applyment_id,
        out_request_no: outRequestNo,
      }
    }
    const item: Application = {
      applyment_id: Number(runtime.id('')),
      out_request_no: outRequestNo,
      applyment_state: runtime.config.autoComplete ? 'FINISH' : 'CHECKING',
      request: clean,
      sub_mchid: '',
      request_fingerprint: fingerprint(body),
      sp_mchid: runtime.config.spMchid,
    }
    registerApplyment(item)
    return { applyment_id: item.applyment_id, out_request_no: outRequestNo }
  }
  runtime.route('POST', '/v3/ecommerce/applyments/', submitApplyment)
  runtime.route('POST', '/v3/ecommerce/applyments', submitApplyment)
  runtime.route(
    'GET',
    '/v3/ecommerce/applyments/out-request-no/:out_request_no',
    ({ params }) =>
      applymentResponse(
        find('applyments', 'out_request_no', str(params, 'out_request_no')),
      ),
  )
  runtime.route('GET', '/v3/ecommerce/applyments/:applyment_id', ({ params }) =>
    applymentResponse(
      find('applyments', 'applyment_id', str(params, 'applyment_id')),
    ),
  )
  runtime.actions.set('applyment', (body) => {
    const item =
      body.applyment_id !== undefined
        ? find<Application>(
            'applyments',
            'applyment_id',
            String(body.applyment_id),
          )
        : find<Application>(
            'applyments',
            'out_request_no',
            str(body, 'out_request_no'),
          )
    const state = oneOf(
      str(body, 'state'),
      Object.keys(APPLYMENT_STATES),
      'state',
    )
    if (
      item.applyment_state === 'FINISH' &&
      !['FINISH', 'FROZEN'].includes(state)
    )
      fail(400, 'INVALID_REQUEST', '完成的进件申请不能回退')
    item.applyment_state = state
    if (state === 'REJECTED' || state === 'FROZEN') {
      item.audit_detail = body.audit_detail || [
        {
          param_name: body.param_name || 'business_license_info',
          reject_reason: body.reason || '模拟审核驳回',
        },
      ]
      if (body.wxpay_sign_required !== undefined)
        item.wxpay_sign_required = body.wxpay_sign_required
    }
    if (body.sub_mchid !== undefined) item.sub_mchid = str(body, 'sub_mchid')
    registerApplyment(item)
    return applymentResponse(item)
  })

  function settlementResponse(
    account: Data,
    rule: unknown,
    includeName = false,
  ): Data {
    const selected =
      rule === undefined ? 'ACCOUNT_NUMBER_RULE_MASK_V1' : String(rule)
    oneOf(
      selected,
      ['ACCOUNT_NUMBER_RULE_MASK_V1', 'ACCOUNT_NUMBER_RULE_MASK_V2'],
      'account_number_rule',
    )
    const result: Data = {
      account_type: account.account_type,
      account_bank: account.account_bank,
      account_number: masked(
        str(account, 'account_number'),
        selected.endsWith('V2') ? 6 : 2,
        selected.endsWith('V2') ? 4 : 2,
      ),
      verify_result: account.verify_result,
    }
    for (const field of [
      'bank_name',
      'bank_branch_id',
      'verify_fail_reason',
      'verify_finish_time',
    ]) {
      if (account[field] !== undefined) result[field] = account[field]
    }
    if (includeName)
      result.account_name = masked(str(account, 'account_name'), 1, 0)
    return result
  }

  function finishSettlement(
    item: SettlementApplication,
    state: string,
    reason = '',
  ): void {
    item.verify_result = state
    item.account.verify_result = state
    if (state !== 'AUDITING') {
      item.account.verify_finish_time = runtime.now()
      item.account.verify_fail_reason = reason
    }
    if (state === 'AUDIT_SUCCESS')
      store.set('settlements', item.sub_mchid, {
        ...item.account,
        verify_result: 'VERIFY_SUCCESS',
      })
    store.set('settlementApplications', item.application_no, item)
  }

  runtime.route(
    'POST',
    '/v3/apply4sub/sub_merchants/:sub_mchid/modify-settlement',
    ({ body, params }) => {
      const subMchid = str(params, 'sub_mchid')
      const mch = merchant(subMchid, true)
      const account = obj(decrypt(body))
      const accountType = oneOf(
        str(account, 'account_type'),
        ['ACCOUNT_TYPE_PRIVATE', 'ACCOUNT_TYPE_BUSINESS'],
        'account_type',
      )
      bankAccount(account)
      if (
        [
          '2',
          '3',
          '2502',
          '1708',
          'SUBJECT_TYPE_ENTERPRISE',
          'SUBJECT_TYPE_INSTITUTIONS_CLONED',
          'SUBJECT_TYPE_GOVERNMENT',
          'SUBJECT_TYPE_OTHERS',
        ].includes(mch.organization_type) &&
        accountType !== 'ACCOUNT_TYPE_BUSINESS'
      ) {
        fail(400, 'PARAM_ERROR', '该主体类型必须使用对公账户')
      }
      if (
        ['2401', '2500', 'SUBJECT_TYPE_MICRO'].includes(
          mch.organization_type,
        ) &&
        accountType !== 'ACCOUNT_TYPE_PRIVATE'
      )
        fail(400, 'PARAM_ERROR', '小微/个人卖家必须使用个人账户')
      const current = store.get<Data>('settlements', subMchid)
      account.account_name ||=
        current?.account_name ||
        mch.merchant_name ||
        mch.legal_person ||
        mch.merchant_shortname
      const expectedName =
        accountType === 'ACCOUNT_TYPE_PRIVATE'
          ? mch.legal_person
          : mch.merchant_name
      if (
        expectedName &&
        String(account.account_name).replace(/[（）]/g, (match) =>
          match === '（' ? '(' : ')',
        ) !==
          String(expectedName).replace(/[（）]/g, (match) =>
            match === '（' ? '(' : ')',
          )
      ) {
        fail(400, 'INVALID_REQUEST', '开户名称与商户主体名称不一致')
      }
      const pending = store
        .values<SettlementApplication>('settlementApplications')
        .find(
          (item) =>
            item.sub_mchid === subMchid && item.verify_result === 'AUDITING',
        )
      if (pending)
        fail(400, 'RESOURCE_ALREADY_EXISTS', '存在审核中的结算账户修改申请')
      const item: SettlementApplication = {
        application_no: runtime.id(''),
        sub_mchid: subMchid,
        account,
        verify_result: 'AUDITING',
      }
      finishSettlement(
        item,
        runtime.config.autoComplete ? 'AUDIT_SUCCESS' : 'AUDITING',
      )
      return { application_no: item.application_no }
    },
  )
  runtime.route(
    'GET',
    '/v3/apply4sub/sub_merchants/:sub_mchid/settlement',
    ({ params, query }) => {
      const subMchid = str(params, 'sub_mchid')
      merchant(subMchid)
      const account = store.get<Data>('settlements', subMchid)
      if (!account) fail(404, 'RESOURCE_NOT_EXISTS', '商户尚未设置结算账户')
      return settlementResponse(account, query.account_number_rule)
    },
  )
  runtime.route(
    'GET',
    '/v3/apply4sub/sub_merchants/:sub_mchid/application/:application_no',
    ({ params, query }) => {
      const subMchid = str(params, 'sub_mchid')
      merchant(subMchid)
      const item = find<SettlementApplication>(
        'settlementApplications',
        'application_no',
        str(params, 'application_no'),
      )
      if (item.sub_mchid !== subMchid)
        fail(404, 'RESOURCE_NOT_EXISTS', '该商户的申请单不存在')
      return settlementResponse(item.account, query.account_number_rule, true)
    },
  )
  runtime.actions.set('settlement', (body) => {
    const item = find<SettlementApplication>(
      'settlementApplications',
      'application_no',
      str(body, 'application_no'),
    )
    const state = oneOf(
      str(body, 'state'),
      ['AUDITING', 'AUDIT_SUCCESS', 'AUDIT_FAIL'],
      'state',
    )
    if (item.verify_result !== 'AUDITING' && item.verify_result !== state)
      fail(400, 'INVALID_REQUEST', '结算账户审核已经完成')
    if (item.verify_result === state && state !== 'AUDITING')
      return settlementResponse(item.account, body.account_number_rule, true)
    finishSettlement(item, state, str(body, 'reason', false))
    return settlementResponse(item.account, body.account_number_rule, true)
  })

  async function upload(request: Request, legacy: boolean): Promise<Data> {
    let form: FormData
    try {
      form = await request.formData()
    } catch {
      fail(400, 'PARAM_ERROR', '请上传有效的 multipart/form-data')
    }
    const file = form.get('file')
    const metaValue = form.get('meta')
    if (!file || typeof file === 'string' || !metaValue)
      fail(400, 'PARAM_ERROR', 'file 和 meta 必填')
    let meta: Data
    try {
      meta = obj(
        JSON.parse(
          typeof metaValue === 'string' ? metaValue : await metaValue.text(),
        ),
      )
    } catch {
      fail(400, 'PARAM_ERROR', 'meta 必须为 JSON 对象')
    }
    const filename = str(meta, legacy ? 'file_name' : 'filename')
    const sha256 = str(meta, legacy ? 'file_digest' : 'sha256')
    if (
      filename.length > 128 ||
      !/\.(jpg|bmp|png|pdf)$/i.test(filename) ||
      (legacy && /\.pdf$/i.test(filename))
    )
      fail(
        400,
        'PARAM_ERROR',
        '文件格式仅支持 JPG、BMP、PNG' + (legacy ? '' : '、PDF'),
      )
    const limit =
      (legacy ? 2 : /\.pdf$/i.test(filename) ? 7.5 : 5) * 1024 * 1024
    if (!file.size || file.size > limit)
      fail(400, 'PARAM_ERROR', `文件大小必须为 1 至 ${limit} 字节`)
    const bytes = Buffer.from(await file.arrayBuffer())
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (!/^[a-f\d]{64}$/i.test(sha256) || sha256.toLowerCase() !== digest)
      fail(400, 'PARAM_ERROR', '文件 SHA256 摘要不匹配')
    const mediaId = `mock_media_${digest}`
    store.set('media', mediaId, {
      media_id: mediaId,
      filename,
      sha256: digest,
      size: bytes.length,
      content: bytes.toString('base64'),
      create_time: runtime.now(),
    })
    return { media_id: mediaId }
  }
  runtime.route('POST', '/v3/merchant/media/upload', ({ request }) =>
    upload(request, false),
  )
  runtime.route(
    'POST',
    '/v3/ecommerce/account/cancel-applications/media',
    ({ request }) => upload(request, true),
  )

  function merchantAccounts(mchid: string): Array<{
    mchid: string
    account_type: string
    available: number
    frozen: number
  }> {
    runtime.account(mchid)
    return store
      .values<{
        mchid: string
        account_type: string
        available: number
        frozen: number
      }>('accounts')
      .filter((item) => item.mchid === mchid)
  }
  function externalType(type: string): string {
    return (
      Object.entries(ACCOUNT_TYPES).find(
        ([, internal]) => internal === type,
      )?.[0] || `${type}_ACCOUNT`
    )
  }
  function cancelBlocks(mchid: string): Data[] {
    const mch = merchant(mchid)
    const reasons: Data[] = Array.isArray(mch.block_reasons)
      ? mch.block_reasons.map((item) => ({ ...obj(item) }))
      : []
    if (merchantAccounts(mchid).some((account) => account.frozen > 0))
      reasons.push({
        type: 'FUNDS_PENDING_PROCESSING',
        description: '存在冻结或待处理资金',
      })
    if (
      store
        .values<Data>('complaints')
        .some(
          (item) =>
            item.complainted_mchid === mchid &&
            !['PROCESSED', 'COMPLETED'].includes(String(item.complaint_state)),
        )
    ) {
      reasons.push({
        type: 'CONSUMER_COMPLAINT_UNPROCESSED',
        description: '存在未处理的消费者投诉',
      })
    }
    return reasons
  }
  function cancelValidation(mchid: string): Data {
    const mch = merchant(mchid)
    const reasons = cancelBlocks(mchid)
    return {
      sub_mchid: mchid,
      merchant_state: mch.merchant_state,
      validate_result: reasons.length
        ? 'NOT_ALLOW_CANCEL_WITHDRAW'
        : 'ALLOW_CANCEL_WITHDRAW',
      account_info: merchantAccounts(mchid).map((item) => ({
        out_account_type: externalType(item.account_type),
        amount: item.available + item.frozen,
      })),
      ...(mch.merchant_state === 'NORMAL' ? { block_reasons: reasons } : {}),
    }
  }
  runtime.route(
    'GET',
    '/v3/ecommerce/account/apply-cancel-withdraw/validate-cancel/:sub_mchid',
    ({ params }) => cancelValidation(str(params, 'sub_mchid')),
  )

  function reserveCancellation(item: Cancellation): void {
    if (item.funds_status !== 'NONE' || item.withdraw !== 'APPLY_WITHDRAW')
      return
    const accounts = merchantAccounts(item.sub_mchid)
    if (accounts.some((account) => account.frozen > 0))
      fail(400, 'INVALID_REQUEST', '商户存在冻结或待处理资金')
    item.reserved = accounts.map((account) => ({
      account_type: account.account_type,
      amount: account.available,
    }))
    for (const reservation of item.reserved) {
      const account = runtime.account(item.sub_mchid, reservation.account_type)
      account.available -= reservation.amount
      account.frozen += reservation.amount
    }
    item.account_info = item.reserved.map((account) => ({
      out_account_type: externalType(account.account_type),
      amount: account.amount,
    }))
    item.funds_status = 'RESERVED'
  }
  function releaseCancellation(item: Cancellation, refundPaid = false): void {
    if (
      item.funds_status !== 'RESERVED' &&
      !(refundPaid && item.funds_status === 'PAID')
    )
      return
    for (const reservation of item.reserved) {
      const account = runtime.account(item.sub_mchid, reservation.account_type)
      account.available += reservation.amount
      if (item.funds_status === 'RESERVED') account.frozen -= reservation.amount
    }
    item.funds_status = refundPaid ? 'REFUNDED' : 'RELEASED'
  }
  function cancellationResponse(item: Cancellation): Data {
    const result: Data = {
      applyment_id: item.applyment_id,
      out_request_no: item.out_request_no,
      sub_mchid: item.sub_mchid,
      cancel_state: item.cancel_state,
      cancel_state_description: CANCEL_STATES[item.cancel_state],
      withdraw: item.withdraw,
      modify_time: item.modify_time,
    }
    for (const field of [
      'withdraw_state',
      'withdraw_state_description',
      'account_info',
      'account_withdraw_result',
      'reject_reason',
    ]) {
      if (item[field] !== undefined) result[field] = item[field]
    }
    if (item.cancel_state === 'WAITING_MERCHANT_CONFIRM') {
      result.confirm_cancel = {
        confirm_cancel_url: `${runtime.config.baseUrl}/__mock/confirm-cancel/${item.applyment_id}`,
      }
    }
    return result
  }
  function setCancellation(
    item: Cancellation,
    state: string,
    withdrawState?: string,
    reason?: string,
  ): Data {
    oneOf(state, Object.keys(CANCEL_STATES), 'state')
    if (withdrawState)
      oneOf(
        withdrawState,
        ['WITHDRAW_PROCESSING', 'WITHDRAW_EXCEPTION', 'WITHDRAW_SUCCEED'],
        'withdraw_state',
      )
    if (
      ['REJECTED', 'REVOKED'].includes(item.cancel_state) &&
      state !== item.cancel_state
    )
      fail(400, 'INVALID_REQUEST', '申请单已终结，请换单重新提交')
    if (item.cancel_state === 'FINISH' && state !== 'FINISH')
      fail(400, 'INVALID_REQUEST', '完成的注销申请不能回退')
    if (
      ['CANCELED', 'FUND_PROCESSING'].includes(item.cancel_state) &&
      !['CANCELED', 'FUND_PROCESSING', 'FINISH'].includes(state)
    )
      fail(400, 'INVALID_REQUEST', '商户注销后不可回退至审核阶段')
    if (
      item.withdraw_state === 'WITHDRAW_EXCEPTION' &&
      withdrawState &&
      withdrawState !== 'WITHDRAW_EXCEPTION'
    )
      fail(400, 'INVALID_REQUEST', '提现异常请换单重新提交')
    if (item.funds_status === 'PAID' && withdrawState === 'WITHDRAW_PROCESSING')
      fail(400, 'INVALID_REQUEST', '付款完成后不可回退')
    if (['CANCELED', 'FUND_PROCESSING', 'FINISH'].includes(state)) {
      reserveCancellation(item)
      const mch = merchant(item.sub_mchid)
      mch.merchant_state = 'HAS_BEEN_CANCELLED'
      store.set('merchants', mch.sub_mchid, mch)
    }
    item.cancel_state = state
    item.modify_time = runtime.now()
    if (reason) item.reject_reason = reason
    if (['REJECTED', 'REVOKED'].includes(state)) releaseCancellation(item)
    if (
      item.withdraw === 'APPLY_WITHDRAW' &&
      ['CANCELED', 'FUND_PROCESSING', 'FINISH'].includes(state)
    ) {
      const withdrawal =
        withdrawState ||
        (state === 'FINISH' ? 'WITHDRAW_SUCCEED' : 'WITHDRAW_PROCESSING')
      oneOf(
        withdrawal,
        ['WITHDRAW_PROCESSING', 'WITHDRAW_EXCEPTION', 'WITHDRAW_SUCCEED'],
        'withdraw_state',
      )
      if (
        item.withdraw_state === 'WITHDRAW_EXCEPTION' &&
        withdrawal !== 'WITHDRAW_EXCEPTION'
      )
        fail(400, 'INVALID_REQUEST', '提现异常请换单重新提交')
      item.withdraw_state = withdrawal
      item.withdraw_state_description = {
        WITHDRAW_PROCESSING: '提现处理中',
        WITHDRAW_EXCEPTION: reason || '提现异常',
        WITHDRAW_SUCCEED: '提现成功',
      }[withdrawal]
      if (
        withdrawal === 'WITHDRAW_SUCCEED' &&
        item.funds_status === 'RESERVED'
      ) {
        for (const reservation of item.reserved)
          runtime.account(item.sub_mchid, reservation.account_type).frozen -=
            reservation.amount
        item.funds_status = 'PAID'
      }
      if (withdrawal === 'WITHDRAW_EXCEPTION') releaseCancellation(item, true)
      item.account_withdraw_result = item.reserved.map((account) => ({
        out_account_type: externalType(account.account_type),
        pay_state:
          withdrawal === 'WITHDRAW_SUCCEED'
            ? 'PAY_SUCCEED'
            : withdrawal === 'WITHDRAW_EXCEPTION'
              ? 'PAY_FAIL'
              : 'PAY_PROCESSING',
        state_description: item.withdraw_state_description,
      }))
    }
    store.set('cancelWithdraws', item.applyment_id, item)
    return cancellationResponse(item)
  }
  runtime.route(
    'POST',
    '/v3/ecommerce/account/apply-cancel-withdraw',
    ({ body }) => {
      const mchid = str(body, 'sub_mchid')
      merchant(mchid)
      const outRequestNo = requestNumber(
        body,
        'out_request_no',
        32,
        /^[A-Za-z0-9]+$/,
      )
      const prior = store
        .values<Cancellation>('cancelWithdraws')
        .find((item) => item.out_request_no === outRequestNo)
      if (prior && prior.request_fingerprint !== fingerprint(body))
        fail(400, 'ALREADY_EXISTS', 'out_request_no 已使用且请求参数不同')
      return runtime.idempotent('cancel-withdraw', outRequestNo, body, () => {
        const clean = obj(decrypt(body))
        const withdraw = oneOf(
          str(clean, 'withdraw', false) || 'NOT_APPLY_WITHDRAW',
          ['NOT_APPLY_WITHDRAW', 'APPLY_WITHDRAW'],
          'withdraw',
        )
        const blocks = cancelBlocks(mchid)
        if (blocks.length)
          fail(400, 'INVALID_REQUEST', String(blocks[0].description))
        if (withdraw === 'APPLY_WITHDRAW') payee(clean.payee_info)
        if (
          store
            .values<Cancellation>('cancelWithdraws')
            .some(
              (item) =>
                item.sub_mchid === mchid &&
                !['FINISH', 'REJECTED', 'REVOKED'].includes(item.cancel_state),
            )
        )
          fail(400, 'RESOURCE_ALREADY_EXISTS', '该商户已有进行中的注销申请')
        if (
          store
            .values<LegacyCancellation>('legacyCancellations')
            .some(
              (item) =>
                item.sub_mchid === mchid && item.cancel_state === 'REVIEWING',
            )
        )
          fail(
            400,
            'RESOURCE_ALREADY_EXISTS',
            '该商户已有审核中的旧流程注销申请',
          )
        const item: Cancellation = {
          applyment_id: runtime.id(''),
          out_request_no: outRequestNo,
          sub_mchid: mchid,
          cancel_state: 'ACCEPTED',
          withdraw,
          request: clean,
          request_fingerprint: fingerprint(body),
          modify_time: runtime.now(),
          reserved: [],
          funds_status: 'NONE',
          ...(withdraw === 'APPLY_WITHDRAW'
            ? {
                account_info: merchantAccounts(mchid).map((account) => ({
                  out_account_type: externalType(account.account_type),
                  amount: account.available,
                })),
              }
            : {}),
        }
        setCancellation(
          item,
          runtime.config.autoComplete ? 'FINISH' : 'ACCEPTED',
        )
        return {
          applyment_id: item.applyment_id,
          out_request_no: item.out_request_no,
        }
      })
    },
  )
  runtime.route(
    'GET',
    '/v3/ecommerce/account/apply-cancel-withdraw/out-request-no/:out_request_no',
    ({ params }) =>
      cancellationResponse(
        find(
          'cancelWithdraws',
          'out_request_no',
          str(params, 'out_request_no'),
        ),
      ),
  )
  runtime.route(
    'GET',
    '/v3/ecommerce/account/apply-cancel-withdraw/applyment-id/:applyment_id',
    ({ params }) =>
      cancellationResponse(
        find('cancelWithdraws', 'applyment_id', str(params, 'applyment_id')),
      ),
  )
  runtime.actions.set('cancel-withdraw', (body) => {
    const item =
      body.applyment_id !== undefined
        ? find<Cancellation>(
            'cancelWithdraws',
            'applyment_id',
            String(body.applyment_id),
          )
        : find<Cancellation>(
            'cancelWithdraws',
            'out_request_no',
            str(body, 'out_request_no'),
          )
    return setCancellation(
      item,
      str(body, 'state'),
      str(body, 'withdraw_state', false) || undefined,
      str(body, 'reason', false),
    )
  })

  function legacyCancelResponse(item: LegacyCancellation): Data {
    return {
      out_apply_no: item.out_apply_no,
      sub_mchid: item.sub_mchid,
      cancel_state: item.cancel_state,
      update_time: item.update_time,
      ...(item.reject_reason ? { reject_reason: item.reject_reason } : {}),
    }
  }
  function setLegacyCancellation(
    item: LegacyCancellation,
    state: string,
    reason = '',
  ): Data {
    oneOf(state, ['REVIEWING', 'REJECTED', 'CANCEL_SUCCESS'], 'state')
    if (item.cancel_state !== 'REVIEWING' && state !== item.cancel_state)
      fail(400, 'INVALID_REQUEST', '注销审核已完成')
    if (state === 'CANCEL_SUCCESS') {
      const mch = merchant(item.sub_mchid)
      mch.merchant_state = 'HAS_BEEN_CANCELLED'
      store.set('merchants', mch.sub_mchid, mch)
    }
    item.cancel_state = state
    item.update_time = runtime.now()
    if (reason) item.reject_reason = reason
    store.set('legacyCancellations', item.out_apply_no, item)
    return legacyCancelResponse(item)
  }
  runtime.route(
    'POST',
    '/v3/ecommerce/account/cancel-applications',
    ({ body }) => {
      const mchid = str(body, 'sub_mchid')
      merchant(mchid)
      const outApplyNo = requestNumber(
        body,
        'out_apply_no',
        32,
        /^[A-Za-z0-9]+$/,
      )
      return runtime.idempotent('cancel', outApplyNo, body, () => {
        if (merchant(mchid).merchant_state !== 'NORMAL')
          fail(400, 'INVALID_REQUEST', '商户已注销')
        if (
          !Array.isArray(body.application_info) ||
          !body.application_info.length
        )
          fail(400, 'PARAM_ERROR', '注销申请材料必填')
        for (const material of body.application_info)
          fields(
            material,
            ['application_type', 'application_media_id'],
            'application_info',
          )
        const blocks = cancelBlocks(mchid)
        if (blocks.length)
          fail(400, 'INVALID_REQUEST', String(blocks[0].description))
        if (
          store
            .values<LegacyCancellation>('legacyCancellations')
            .some(
              (item) =>
                item.sub_mchid === mchid && item.cancel_state === 'REVIEWING',
            )
        )
          fail(400, 'RESOURCE_ALREADY_EXISTS', '该商户已有审核中的注销申请')
        if (
          store
            .values<Cancellation>('cancelWithdraws')
            .some(
              (item) =>
                item.sub_mchid === mchid &&
                !['FINISH', 'REJECTED', 'REVOKED'].includes(item.cancel_state),
            )
        )
          fail(
            400,
            'RESOURCE_ALREADY_EXISTS',
            '该商户已有进行中的新流程注销申请',
          )
        const item: LegacyCancellation = {
          out_apply_no: outApplyNo,
          sub_mchid: mchid,
          cancel_state: 'REVIEWING',
          request: body,
        }
        return setLegacyCancellation(
          item,
          runtime.config.autoComplete ? 'CANCEL_SUCCESS' : 'REVIEWING',
        )
      })
    },
  )
  runtime.route(
    'GET',
    '/v3/ecommerce/account/cancel-applications/out-apply-no/:out_apply_no',
    ({ params }) =>
      legacyCancelResponse(
        find(
          'legacyCancellations',
          'out_apply_no',
          str(params, 'out_apply_no'),
        ),
      ),
  )
  runtime.actions.set('cancel', (body) =>
    setLegacyCancellation(
      find('legacyCancellations', 'out_apply_no', str(body, 'out_apply_no')),
      str(body, 'state'),
      str(body, 'reason', false),
    ),
  )

  function riskWithdrawalResponse(item: RiskWithdrawal): Data {
    return {
      withdrawl_apply: {
        applyment_id: item.applyment_id,
        out_request_no: item.out_request_no,
        state: item.state,
        modify_time: item.modify_time,
        ...(item.fail_reason ? { fail_reason: item.fail_reason } : {}),
      },
    }
  }
  function setRiskWithdrawal(
    item: RiskWithdrawal,
    state: string,
    reason = '',
  ): Data {
    oneOf(
      state,
      [
        'SUBMITTED',
        'PASSED',
        'PAY_SUCCEED',
        'REJECTED',
        'PAY_FAILED',
        'BANK_REFUNDED',
      ],
      'state',
    )
    if (
      ['REJECTED', 'PAY_FAILED', 'BANK_REFUNDED'].includes(item.state) &&
      state !== item.state
    )
      fail(400, 'INVALID_REQUEST', '提现申请已终结')
    if (
      item.state === 'PAY_SUCCEED' &&
      !['PAY_SUCCEED', 'BANK_REFUNDED'].includes(state)
    )
      fail(400, 'INVALID_REQUEST', '付款成功的申请不能回退')
    const account = runtime.account(
      item.sub_mchid,
      ACCOUNT_TYPES[item.out_account_type],
    )
    if (state === 'PAY_SUCCEED' && item.funds_status === 'RESERVED') {
      account.frozen -= item.amount
      item.funds_status = 'PAID'
    }
    if (['REJECTED', 'PAY_FAILED', 'BANK_REFUNDED'].includes(state)) {
      if (item.funds_status === 'RESERVED') {
        account.frozen -= item.amount
        account.available += item.amount
        item.funds_status = 'RELEASED'
      } else if (state === 'BANK_REFUNDED' && item.funds_status === 'PAID') {
        account.available += item.amount
        item.funds_status = 'REFUNDED'
      }
      item.fail_reason = reason || '模拟提现失败'
    }
    item.state = state
    item.modify_time = runtime.now()
    store.set('riskWithdrawals', item.applyment_id, item)
    return riskWithdrawalResponse(item)
  }
  runtime.route('POST', '/v3/mch_operate/risk/withdrawl-apply', ({ body }) => {
    const mchid = str(body, 'sub_mchid')
    merchant(mchid)
    const outRequestNo = requestNumber(
      body,
      'out_request_no',
      32,
      /^[A-Za-z0-9]+$/,
    )
    const prior = store
      .values<RiskWithdrawal>('riskWithdrawals')
      .find((item) => item.out_request_no === outRequestNo)
    if (prior && prior.request_fingerprint !== fingerprint(body))
      fail(
        400,
        'RESOURCE_ALREADY_EXISTS',
        '商户提现申请单号已存在且请求参数不同',
      )
    return runtime.idempotent('cancel-withdrawal', outRequestNo, body, () => {
      if (merchant(mchid).merchant_state !== 'HAS_BEEN_CANCELLED')
        fail(400, 'INVALID_REQUEST', '仅支持已注销商户号提现')
      const clean = obj(decrypt(body))
      const type = oneOf(
        str(clean, 'out_account_type'),
        ['BASIC_ACCOUNT', 'OPERATE_ACCOUNT', 'MARGIN_ACCOUNT'],
        'out_account_type',
      )
      const amount = int(clean, 'amount', 1)
      const payeeType = oneOf(
        str(clean, 'payee_type'),
        [
          'CONTRIBUTION_MERCHANT',
          'SERVICE_PROVIDER_MERCHANT',
          'OTHER_MERCHANT',
          'INDIVIDUAL',
        ],
        'payee_type',
      )
      if (payeeType !== 'INDIVIDUAL') str(clean, 'payee_mchid')
      const info = payee(clean.payee_info)
      if (
        payeeType === 'INDIVIDUAL' &&
        info.account_type !== 'ACCOUNT_TYPE_PERSONAL'
      )
        fail(400, 'PARAM_ERROR', '个人收款必须使用对私账户')
      if (
        payeeType === 'SERVICE_PROVIDER_MERCHANT' &&
        (clean.payee_mchid !== runtime.config.spMchid ||
          info.account_type !== 'ACCOUNT_TYPE_CORPORATE')
      )
        fail(400, 'PARAM_ERROR', '平台收款必须使用本平台商户号及对公账户')
      if (payeeType === 'CONTRIBUTION_MERCHANT' && clean.payee_mchid !== mchid)
        fail(400, 'PARAM_ERROR', '出资商户收款商户号必须与二级商户号一致')
      const account = runtime.account(mchid, ACCOUNT_TYPES[type])
      if (amount > account.available) fail(403, 'NOTENOUGH', '账户可用余额不足')
      const item: RiskWithdrawal = {
        applyment_id: runtime.id(''),
        out_request_no: outRequestNo,
        sub_mchid: mchid,
        out_account_type: type,
        amount,
        state: 'SUBMITTED',
        funds_status: 'RESERVED',
        request: clean,
        request_fingerprint: fingerprint(body),
      }
      account.available -= amount
      account.frozen += amount
      setRiskWithdrawal(
        item,
        runtime.config.autoComplete ? 'PAY_SUCCEED' : 'SUBMITTED',
      )
      return {
        applyment_id: item.applyment_id,
        out_request_no: item.out_request_no,
      }
    })
  })
  runtime.route(
    'GET',
    '/v3/mch_operate/risk/withdrawl-apply/out-request-no/:out_request_no',
    ({ params }) =>
      riskWithdrawalResponse(
        find(
          'riskWithdrawals',
          'out_request_no',
          str(params, 'out_request_no'),
        ),
      ),
  )
  runtime.route(
    'GET',
    '/v3/mch_operate/risk/withdrawl-apply/applyment-id/:applyment_id',
    ({ params }) =>
      riskWithdrawalResponse(
        find('riskWithdrawals', 'applyment_id', str(params, 'applyment_id')),
      ),
  )
  runtime.actions.set('cancel-withdrawal', (body) => {
    const item =
      body.applyment_id !== undefined
        ? find<RiskWithdrawal>(
            'riskWithdrawals',
            'applyment_id',
            String(body.applyment_id),
          )
        : find<RiskWithdrawal>(
            'riskWithdrawals',
            'out_request_no',
            str(body, 'out_request_no'),
          )
    return setRiskWithdrawal(
      item,
      str(body, 'state'),
      str(body, 'reason', false),
    )
  })

  runtime.route('GET', '/v3/ecommerce/subject-sub-merchants', ({ query }) => {
    const subject = oneOf(
      str(query, 'organization_type'),
      Object.values(SUBJECT_TYPES),
      'organization_type',
    )
    const cert = runtime.decryptSensitive(str(query, 'cert_number'))
    const limit =
      query.limit === undefined
        ? 20
        : int({ limit: Number(query.limit) }, 'limit', 1)
    const offset =
      query.offset === undefined
        ? 0
        : int({ offset: Number(query.offset) }, 'offset')
    if (limit > 200) fail(400, 'PARAM_ERROR', 'limit 不得超过 200')
    const matches = store
      .values<Merchant>('merchants')
      .filter(
        (item) =>
          item.sp_mchid === runtime.config.spMchid &&
          item.merchant_state === 'NORMAL' &&
          (SUBJECT_TYPES[item.organization_type] || item.organization_type) ===
            subject &&
          item.cert_number === cert,
      )
    return {
      data: matches.slice(offset, offset + limit).map((item) => ({
        sub_mchid: item.sub_mchid,
        merchant_shortname: item.merchant_shortname,
        sign_time: item.sign_time,
      })),
      offset,
      limit,
      total_count: matches.length,
    }
  })

  function subjectAlterResponse(item: SubjectAlteration): Data {
    return {
      merchant_code: item.merchant_code,
      apply_id: item.apply_id,
      out_request_no: item.out_request_no,
      state: item.state,
      ...(item.state === 'APPLYMENT_STATE_REJECTED'
        ? {
            audit_reject_reason:
              item.audit_reject_reason || '模拟主体变更审核驳回',
            audit_reject_detail: item.audit_reject_detail || [],
          }
        : {}),
    }
  }
  function setSubjectAlter(
    item: SubjectAlteration,
    state: string,
    body: Data = {},
  ): Data {
    oneOf(
      state,
      [
        'APPLYMENT_STATE_AUDITING',
        'APPLYMENT_STATE_REJECTED',
        'APPLYMENT_STATE_MODIFING',
        'APPLYMENT_STATE_FINISHED',
        'APPLYMENT_STATE_CANCELED',
        'APPLYMENT_STATE_EDITTING',
      ],
      'state',
    )
    if (
      ['APPLYMENT_STATE_FINISHED', 'APPLYMENT_STATE_CANCELED'].includes(
        item.state,
      ) &&
      item.state !== state
    )
      fail(400, 'INVALID_REQUEST', '主体变更申请已终结')
    if (
      item.state === state &&
      ['APPLYMENT_STATE_FINISHED', 'APPLYMENT_STATE_CANCELED'].includes(state)
    )
      return subjectAlterResponse(item)
    if (state === 'APPLYMENT_STATE_FINISHED') {
      const mch = merchant(item.merchant_code, true)
      const scope = item.request.alter_scope || 'ALTER_SCOPE_FULL'
      if (scope !== 'ALTER_SCOPE_UBO') {
        mch.organization_type = String(
          item.request.organization_type || mch.organization_type,
        )
        const license = optionalObject(item.request.business_license_info)
        const certificate = optionalObject(item.request.certificate_info)
        mch.cert_number = String(
          license.license_number || certificate.cert_number || mch.cert_number,
        )
        mch.merchant_name =
          license.merchant_name ||
          certificate.merchant_name ||
          mch.merchant_name
        mch.legal_person =
          license.legal_person || certificate.legal_person || mch.legal_person
        mch.subject_info = item.request
      }
      if (scope !== 'ALTER_SCOPE_BUSINESS_CERT')
        mch.ubo_info_list = item.request.ubo_info_list || []
      store.set('merchants', mch.sub_mchid, mch)
    }
    item.state = state
    if (state === 'APPLYMENT_STATE_REJECTED') {
      item.audit_reject_reason = body.reason || '模拟主体变更审核驳回'
      item.audit_reject_detail = body.audit_reject_detail || [
        {
          param_name: body.param_name || 'business_license_info',
          reject_reason: item.audit_reject_reason,
        },
      ]
    }
    store.set('subjectAlterations', item.apply_id, item)
    return subjectAlterResponse(item)
  }
  runtime.route(
    'POST',
    '/v3/mchalterapply/mchsubjectalterapplyment',
    ({ body }) => {
      const mchid = str(body, 'merchant_code')
      merchant(mchid, true)
      const outRequestNo = requestNumber(body, 'out_request_no', 64)
      const clean = obj(decrypt(body))
      const scope = oneOf(
        str(clean, 'alter_scope', false) || 'ALTER_SCOPE_FULL',
        ['ALTER_SCOPE_FULL', 'ALTER_SCOPE_BUSINESS_CERT', 'ALTER_SCOPE_UBO'],
        'alter_scope',
      )
      if (scope !== 'ALTER_SCOPE_UBO') {
        const subject = oneOf(
          str(clean, 'organization_type'),
          Object.values(SUBJECT_TYPES),
          'organization_type',
        )
        if (typeof clean.finance_institution !== 'boolean')
          fail(400, 'PARAM_ERROR', 'finance_institution 必须为布尔值')
        if (
          ['SUBJECT_TYPE_ENTERPRISE', 'SUBJECT_TYPE_INDIVIDUAL'].includes(
            subject,
          )
        )
          fields(
            clean.business_license_info,
            ['license_number', 'license_copy', 'merchant_name', 'legal_person'],
            'business_license_info',
          )
        else if (subject !== 'SUBJECT_TYPE_MICRO')
          fields(
            clean.certificate_info,
            [
              'cert_type',
              'cert_number',
              'cert_copy',
              'merchant_name',
              'legal_person',
              'company_address',
              'cert_period_begin',
              'cert_period_end',
            ],
            'certificate_info',
          )
        const legal = fields(
          clean.legal_person_info,
          ['id_holder_type'],
          'legal_person_info',
        )
        const holder = oneOf(
          str(legal, 'id_holder_type'),
          ['LEGAL', 'SUPER'],
          'legal_person_info.id_holder_type',
        )
        if (holder === 'SUPER') {
          if (
            ![
              'SUBJECT_TYPE_GOVERNMENT',
              'SUBJECT_TYPE_INSTITUTIONS_CLONED',
            ].includes(subject)
          )
            fail(400, 'PARAM_ERROR', '该主体类型仅支持法人证件')
          str(legal, 'authorize_letter_copy')
        } else {
          fields(
            legal,
            [
              'id_doc_type',
              'card_front',
              'card_name',
              'card_number',
              'card_period_begin',
              'card_period_end',
            ],
            'legal_person_info',
          )
          if (legal.id_doc_type !== 'IDENTIFICATION_TYPE_OVERSEA_PASSPORT')
            str(legal, 'card_back')
          if (subject === 'SUBJECT_TYPE_ENTERPRISE') {
            str(legal, 'card_address')
            if (typeof legal.as_ubo !== 'boolean')
              fail(400, 'PARAM_ERROR', 'legal_person_info.as_ubo 必须为布尔值')
          }
        }
        if (clean.finance_institution === true) {
          const finance = fields(
            clean.finance_institution_info,
            ['finance_type'],
            'finance_institution_info',
          )
          if (
            !Array.isArray(finance.finance_license_pics) ||
            !finance.finance_license_pics.length
          )
            fail(400, 'PARAM_ERROR', '金融机构许可证图片必填')
        }
        if (
          scope === 'ALTER_SCOPE_FULL' &&
          ['SUBJECT_TYPE_ENTERPRISE', 'SUBJECT_TYPE_OTHERS'].includes(
            subject,
          ) &&
          legal.as_ubo !== true &&
          (!Array.isArray(clean.ubo_info_list) || !clean.ubo_info_list.length)
        )
          fail(400, 'PARAM_ERROR', '最终受益人信息必填')
      }
      if (
        scope === 'ALTER_SCOPE_UBO' &&
        (!Array.isArray(clean.ubo_info_list) || !clean.ubo_info_list.length)
      )
        fail(400, 'PARAM_ERROR', '受益人资料必填')
      for (const ubo of Array.isArray(clean.ubo_info_list)
        ? clean.ubo_info_list
        : [])
        fields(
          ubo,
          [
            'id_doc_type',
            'card_front',
            'card_name',
            'card_number',
            'card_address',
            'card_period_begin',
            'card_period_end',
          ],
          'ubo_info_list',
        )
      const existing = store
        .values<SubjectAlteration>('subjectAlterations')
        .find(
          (item) =>
            item.merchant_code === mchid &&
            item.out_request_no === outRequestNo,
        )
      if (
        existing &&
        ['APPLYMENT_STATE_REJECTED', 'APPLYMENT_STATE_EDITTING'].includes(
          existing.state,
        )
      ) {
        existing.request = clean
        existing.request_fingerprint = fingerprint(body)
        setSubjectAlter(
          existing,
          runtime.config.autoComplete
            ? 'APPLYMENT_STATE_FINISHED'
            : 'APPLYMENT_STATE_AUDITING',
        )
        return { apply_id: existing.apply_id }
      }
      if (existing) {
        if (existing.request_fingerprint !== fingerprint(body))
          fail(
            400,
            'RESOURCE_ALREADY_EXISTS',
            '相同业务申请编号已有申请单且参数不一致',
          )
        return { apply_id: existing.apply_id }
      }
      if (
        store
          .values<SubjectAlteration>('subjectAlterations')
          .some(
            (item) =>
              item.merchant_code === mchid &&
              ['APPLYMENT_STATE_AUDITING', 'APPLYMENT_STATE_MODIFING'].includes(
                item.state,
              ),
          )
      )
        fail(400, 'RESOURCE_ALREADY_EXISTS', '存在进行中的主体修改申请')
      const item: SubjectAlteration = {
        apply_id: runtime.id(''),
        merchant_code: mchid,
        out_request_no: outRequestNo,
        state: 'APPLYMENT_STATE_AUDITING',
        request: clean,
        request_fingerprint: fingerprint(body),
      }
      setSubjectAlter(
        item,
        runtime.config.autoComplete
          ? 'APPLYMENT_STATE_FINISHED'
          : 'APPLYMENT_STATE_AUDITING',
      )
      return { apply_id: item.apply_id }
    },
  )
  runtime.route(
    'GET',
    '/v3/mchalterapply/mchsubjectalterapplyment/merchant/:merchant_code/out-request-no/:out_request_no',
    ({ params }) => {
      const mchid = str(params, 'merchant_code')
      merchant(mchid)
      const item = store
        .values<SubjectAlteration>('subjectAlterations')
        .find(
          (candidate) =>
            candidate.merchant_code === mchid &&
            candidate.out_request_no === params.out_request_no,
        )
      if (!item) fail(404, 'RESOURCE_NOT_EXISTS', '该商户的主体修改申请不存在')
      return subjectAlterResponse(item)
    },
  )
  runtime.route(
    'GET',
    '/v3/mchalterapply/mchsubjectalterapplyment/:apply_id',
    ({ params }) =>
      subjectAlterResponse(
        find('subjectAlterations', 'apply_id', str(params, 'apply_id')),
      ),
  )
  runtime.route(
    'POST',
    '/v3/mchalterapply/mchsubjectalterapplyment/:apply_id/revoke',
    ({ params }) => {
      const item = find<SubjectAlteration>(
        'subjectAlterations',
        'apply_id',
        str(params, 'apply_id'),
      )
      if (item.state === 'APPLYMENT_STATE_CANCELED')
        return { result: 'SUCCESS' }
      if (
        ![
          'APPLYMENT_STATE_EDITTING',
          'APPLYMENT_STATE_AUDITING',
          'APPLYMENT_STATE_REJECTED',
        ].includes(item.state)
      )
        return { result: 'FAIL' }
      setSubjectAlter(item, 'APPLYMENT_STATE_CANCELED')
      return { result: 'SUCCESS' }
    },
  )
  runtime.actions.set('subject-alter', (body) => {
    const item =
      body.apply_id !== undefined
        ? find<SubjectAlteration>(
            'subjectAlterations',
            'apply_id',
            String(body.apply_id),
          )
        : store
            .values<SubjectAlteration>('subjectAlterations')
            .find(
              (candidate) =>
                candidate.merchant_code === body.merchant_code &&
                candidate.out_request_no === body.out_request_no,
            )
    if (!item) fail(404, 'RESOURCE_NOT_EXISTS', '主体修改申请不存在')
    return setSubjectAlter(item, str(body, 'state'), body)
  })

  function localApplyment(id: string): Application {
    const item = find<Application>('applyments', 'applyment_id', id)
    if (item.sp_mchid !== undefined && item.sp_mchid !== runtime.config.spMchid)
      fail(403, 'NO_AUTH', '申请单不属于当前平台')
    if (item.sub_mchid && store.get<Merchant>('merchants', item.sub_mchid))
      merchant(item.sub_mchid)
    return item
  }
  runtime.route('GET', '/__mock/sign/:applyment_id', ({ params }) => {
    const item = localApplyment(str(params, 'applyment_id'))
    return confirmationPage(
      '商户签约确认',
      item.out_request_no,
      APPLYMENT_STATES[item.applyment_state],
      '确认签约',
      item.applyment_state === 'NEED_SIGN',
    )
  })
  runtime.route('POST', '/__mock/sign/:applyment_id', ({ params }) => {
    const item = localApplyment(str(params, 'applyment_id'))
    if (item.applyment_state === 'FINISH') return applymentResponse(item)
    if (item.applyment_state !== 'NEED_SIGN')
      fail(400, 'INVALID_REQUEST', '申请单当前不处于待签约阶段')
    item.applyment_state = 'FINISH'
    registerApplyment(item)
    return applymentResponse(item)
  })
  runtime.route('GET', '/__mock/verify/:applyment_id', ({ params }) => {
    const item = localApplyment(str(params, 'applyment_id'))
    return confirmationPage(
      '商户账户验证',
      item.out_request_no,
      APPLYMENT_STATES[item.applyment_state],
      '确认账户验证完成',
      item.applyment_state === 'ACCOUNT_NEED_VERIFY',
    )
  })
  runtime.route('POST', '/__mock/verify/:applyment_id', ({ params }) => {
    const item = localApplyment(str(params, 'applyment_id'))
    if (['AUDITING', 'NEED_SIGN', 'FINISH'].includes(item.applyment_state))
      return applymentResponse(item)
    if (item.applyment_state !== 'ACCOUNT_NEED_VERIFY')
      fail(400, 'INVALID_REQUEST', '申请单当前不处于待账户验证阶段')
    item.applyment_state = runtime.config.autoComplete ? 'FINISH' : 'AUDITING'
    registerApplyment(item)
    return applymentResponse(item)
  })
  runtime.route('GET', '/__mock/confirm-cancel/:applyment_id', ({ params }) => {
    const item = find<Cancellation>(
      'cancelWithdraws',
      'applyment_id',
      str(params, 'applyment_id'),
    )
    merchant(item.sub_mchid)
    return confirmationPage(
      '商户注销确认',
      item.out_request_no,
      CANCEL_STATES[item.cancel_state],
      '确认注销商户',
      item.cancel_state === 'WAITING_MERCHANT_CONFIRM',
    )
  })
  runtime.route(
    'POST',
    '/__mock/confirm-cancel/:applyment_id',
    ({ params }) => {
      const item = find<Cancellation>(
        'cancelWithdraws',
        'applyment_id',
        str(params, 'applyment_id'),
      )
      merchant(item.sub_mchid)
      if (
        ['SYSTEM_PROCESSING', 'CANCELED', 'FUND_PROCESSING', 'FINISH'].includes(
          item.cancel_state,
        )
      )
        return cancellationResponse(item)
      if (item.cancel_state !== 'WAITING_MERCHANT_CONFIRM')
        fail(400, 'INVALID_REQUEST', '申请单当前不处于等待商户确认阶段')
      return setCancellation(
        item,
        runtime.config.autoComplete ? 'FINISH' : 'SYSTEM_PROCESSING',
      )
    },
  )
}
