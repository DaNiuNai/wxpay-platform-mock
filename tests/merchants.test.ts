import assert from 'node:assert/strict'
import {
  createHash,
  constants,
  privateDecrypt,
  publicEncrypt,
} from 'node:crypto'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import type { Data } from '../src/types.js'

function applyment(outRequestNo = 'Applyment001'): Data {
  return {
    out_request_no: outRequestNo,
    organization_type: '2401',
    merchant_shortname: '测试店铺',
    id_card_info: {
      id_card_copy: 'test_front',
      id_card_national: 'test_back',
      id_card_name: '张三',
      id_card_number: '110101199001010011',
      id_card_valid_time_begin: '2020-01-01',
      id_card_valid_time: '长期',
    },
    account_info: {
      bank_account_type: '75',
      account_name: '张三',
      account_bank: '工商银行',
      account_number: '6222021234567890123',
    },
    contact_info: {
      contact_type: '65',
      contact_name: '张三',
      mobile_phone: '13800138000',
    },
    sales_scene_info: {
      store_name: '测试店铺',
      store_url: 'https://example.test/shop',
    },
  }
}

const corporatePayee = {
  account_type: 'ACCOUNT_TYPE_CORPORATE',
  bank_account_info: {
    account_name: '联调测试有限公司',
    account_bank: '工商银行',
    account_number: '6222021234567890123',
  },
}

const licenseChange = {
  alter_scope: 'ALTER_SCOPE_BUSINESS_CERT',
  organization_type: 'SUBJECT_TYPE_ENTERPRISE',
  finance_institution: false,
  business_license_info: {
    license_number: '91440300MA5NEW00001',
    license_copy: 'license_image',
    merchant_name: '新的测试有限公司',
    legal_person: '李四',
  },
  legal_person_info: {
    id_holder_type: 'LEGAL',
    id_doc_type: 'IDENTIFICATION_TYPE_IDCARD',
    card_front: 'front_image',
    card_back: 'back_image',
    card_name: '李四',
    card_number: '110101199001010011',
    card_address: '广东省深圳市测试地址',
    card_period_begin: '2020-01-01',
    card_period_end: '长期',
    as_ubo: true,
  },
}

test('进件完成后可以按两种单号查单，并按主体分页；同号重试只创建一个商户', async (t) => {
  const { app, runtime, close } = createApp({ callbacks: false })
  t.after(close)
  const body = applyment()
  const submit = () =>
    app.request('/v3/ecommerce/applyments/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  const response = await submit()
  assert.equal(response.status, 200, await response.clone().text())
  const result = (await response.json()) as Data
  assert.equal(typeof result.applyment_id, 'number')
  assert.deepEqual(await (await submit()).json(), result)
  const byId = (await (
    await app.request(`/v3/ecommerce/applyments/${result.applyment_id}`)
  ).json()) as Data
  const byOutNo = (await (
    await app.request('/v3/ecommerce/applyments/out-request-no/Applyment001')
  ).json()) as Data
  assert.deepEqual(byId, byOutNo)
  assert.equal(byId.applyment_state, 'FINISH')
  assert.equal(byId.sign_state, 'SIGNED')
  assert.ok(byId.sub_mchid)
  assert.equal(runtime.store.values('applyments').length, 1)
  const subjects = (await (
    await app.request(
      '/v3/ecommerce/subject-sub-merchants?organization_type=SUBJECT_TYPE_MICRO&cert_number=110101199001010011&limit=1&offset=0',
    )
  ).json()) as Data
  assert.equal(subjects.total_count, 1)
  assert.equal((subjects.data as Data[])[0]?.sub_mchid, byId.sub_mchid)
  const conflict = await app.request('/v3/ecommerce/applyments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, merchant_shortname: '其他店铺' }),
  })
  assert.equal(conflict.status, 400)
  assert.equal(
    (
      (await (
        await app.request('/v3/ecommerce/applyments/123456789')
      ).json()) as Data
    ).code,
    'RESOURCE_NOT_EXISTS',
  )
  const foreign = await app.request(
    '/v3/apply4sub/sub_merchants/9999999999/settlement',
  )
  assert.equal(foreign.status, 403)
})

test('merchant 控制动作可种子商户、查询资料和设置注销阻断原因，仅改变元资料', async (t) => {
  const { app, runtime, close } = createApp({ callbacks: false })
  t.after(close)
  const sub = '1900000888'
  const control = (body: Data) =>
    app.request('/mock/actions/merchant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  const seeded = await control({
    sub_mchid: sub,
    organization_type: '2',
    cert_number: '91440300MA5MOCK888',
    merchant_shortname: '多商户测试',
    block_reasons: [
      { type: 'HAS_BLOCKING_CONTROL', description: '模拟注销管控' },
    ],
  })
  assert.equal(seeded.status, 200, await seeded.clone().text())
  assert.equal(
    ((await (await control({ sub_mchid: sub })).json()) as Data)
      .merchant_shortname,
    '多商户测试',
  )
  runtime.account(sub).available = 123
  const url = `/v3/ecommerce/account/apply-cancel-withdraw/validate-cancel/${sub}`
  const blocked = (await (await app.request(url)).json()) as Data
  assert.equal(blocked.validate_result, 'NOT_ALLOW_CANCEL_WITHDRAW')
  assert.equal(
    (blocked.block_reasons as Data[])[0]?.description,
    '模拟注销管控',
  )
  await control({ sub_mchid: sub, block_reasons: [] })
  assert.equal(
    ((await (await app.request(url)).json()) as Data).validate_result,
    'ALLOW_CANCEL_WITHDRAW',
  )
  await control({ sub_mchid: sub, merchant_state: 'HAS_BEEN_CANCELLED' })
  await control({ sub_mchid: sub, merchant_state: 'NORMAL' })
  assert.equal(runtime.account(sub).available, 123)
  assert.equal(runtime.account(sub).frozen, 0)
  assert.equal(
    (await control({ sub_mchid: sub, merchant_state: 'INVALID' })).status,
    400,
  )
  assert.equal(
    runtime.store.get<Data>('merchants', sub)?.merchant_state,
    'NORMAL',
  )
})

test('进件审核可控，账户验证信息使用商户公钥加密，驳回后允许原单修正重提', async (t) => {
  const { app, runtime, close } = createApp({
    config: { autoComplete: false },
    callbacks: false,
  })
  t.after(close)
  const body = applyment('Manual001')
  const submit = (data: Data) =>
    app.request('/v3/ecommerce/applyments/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  const result = (await (await submit(body)).json()) as Data
  const action = runtime.actions.get('applyment')!
  const waiting = (await action({
    applyment_id: result.applyment_id,
    state: 'ACCOUNT_NEED_VERIFY',
  })) as Data
  const account = waiting.account_validation as Data
  assert.equal(
    privateDecrypt(
      {
        key: runtime.crypto.merchantPrivateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha1',
      },
      Buffer.from(String(account.account_name), 'base64'),
    ).toString(),
    '张三',
  )
  const rejected = (await action({
    out_request_no: 'Manual001',
    state: 'REJECTED',
    reason: '证件不清晰',
  })) as Data
  assert.equal(
    (rejected.audit_detail as Data[])[0]?.reject_reason,
    '证件不清晰',
  )
  const revised = { ...body, merchant_shortname: '修正的店铺' }
  assert.deepEqual(await (await submit(revised)).json(), result)
  assert.deepEqual(await (await submit(revised)).json(), result)
  const finish = (await action({
    applyment_id: result.applyment_id,
    state: 'FINISH',
  })) as Data
  assert.equal(finish.applyment_state, 'FINISH')
  assert.equal(runtime.store.values('merchants').length, 2)
})

test('结算账户修改通过审核才生效，支持两种掩码和商户隔离', async (t) => {
  const { app, runtime, close } = createApp({
    config: { autoComplete: false },
    callbacks: false,
  })
  t.after(close)
  const sub = runtime.config.subMchid
  const currentUrl = `/v3/apply4sub/sub_merchants/${sub}/settlement`
  const current = (await (await app.request(currentUrl)).json()) as Data
  const body = {
    account_type: 'ACCOUNT_TYPE_BUSINESS',
    account_bank: '建设银行',
    account_number: '123456789012345678',
  }
  const submit = () =>
    app.request(`/v3/apply4sub/sub_merchants/${sub}/modify-settlement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  const created = (await (await submit()).json()) as Data
  const queryUrl = `/v3/apply4sub/sub_merchants/${sub}/application/${created.application_no}`
  const pending = (await (await app.request(queryUrl)).json()) as Data
  assert.equal(pending.verify_result, 'AUDITING')
  assert.equal(pending.account_number, '12**************78')
  assert.equal(pending.account_name, '联*******')
  assert.deepEqual(await (await app.request(currentUrl)).json(), current)
  assert.equal((await submit()).status, 400)
  const failResult = (await runtime.actions.get('settlement')!({
    application_no: created.application_no,
    state: 'AUDIT_FAIL',
    reason: '账户错误',
  })) as Data
  assert.equal(failResult.verify_fail_reason, '账户错误')
  assert.deepEqual(await (await app.request(currentUrl)).json(), current)
  const retry = (await (await submit()).json()) as Data
  await runtime.actions.get('settlement')!({
    application_no: retry.application_no,
    state: 'AUDIT_SUCCESS',
  })
  const updated = (await (
    await app.request(
      `${currentUrl}?account_number_rule=ACCOUNT_NUMBER_RULE_MASK_V2`,
    )
  ).json()) as Data
  assert.equal(updated.account_number, '123456********5678')
  assert.equal(updated.account_bank, '建设银行')
  assert.equal(updated.verify_result, 'VERIFY_SUCCESS')
  runtime.store.set('merchants', '1900000102', {
    ...runtime.store.get<Data>('merchants', sub),
    sub_mchid: '1900000102',
  })
  assert.equal(
    (
      await app.request(
        `/v3/apply4sub/sub_merchants/1900000102/application/${retry.application_no}`,
      )
    ).status,
    404,
  )
})

test('上传验证实际字节的 SHA256、文件类型及各接口大小限制', async (t) => {
  const { app, close } = createApp({ callbacks: false })
  t.after(close)
  const bytes = Buffer.from('mock PNG bytes')
  const digest = createHash('sha256').update(bytes).digest('hex')
  const upload = (
    data: Uint8Array,
    filename: string,
    hash: string,
    legacy = false,
  ) => {
    const form = new FormData()
    form.set(
      'meta',
      JSON.stringify(
        legacy
          ? { file_name: filename, file_digest: hash }
          : { filename, sha256: hash },
      ),
    )
    form.set('file', new Blob([data as Uint8Array<ArrayBuffer>]), filename)
    return app.request(
      legacy
        ? '/v3/ecommerce/account/cancel-applications/media'
        : '/v3/merchant/media/upload',
      { method: 'POST', body: form },
    )
  }
  assert.equal((await upload(bytes, 'test.png', digest)).status, 200)
  assert.equal(
    (await upload(bytes, 'test.PNG', digest.toUpperCase(), true)).status,
    200,
  )
  assert.equal((await upload(bytes, 'test.png', '0'.repeat(64))).status, 400)
  assert.equal((await upload(bytes, 'test.exe', digest)).status, 400)
  assert.equal((await upload(bytes, 'test.pdf', digest, true)).status, 400)
  const oversized = new Uint8Array(2 * 1024 * 1024 + 1)
  assert.equal(
    (
      await upload(
        oversized,
        'test.png',
        createHash('sha256').update(oversized).digest('hex'),
        true,
      )
    ).status,
    400,
  )
})

test('新注销流程检查冻结资金、确认链接并清退所有账户，退票金额只返还一次', async (t) => {
  const { app, runtime, close } = createApp({
    config: { autoComplete: false },
    callbacks: false,
  })
  t.after(close)
  const sub = runtime.config.subMchid
  runtime.account(sub).available = 700
  runtime.account(sub, 'OPERATION').available = 300
  runtime.account(sub, 'DEPOSIT').available = 50
  runtime.account(sub).frozen = 1
  const validationUrl = `/v3/ecommerce/account/apply-cancel-withdraw/validate-cancel/${sub}`
  const blocked = (await (await app.request(validationUrl)).json()) as Data
  assert.equal(blocked.validate_result, 'NOT_ALLOW_CANCEL_WITHDRAW')
  runtime.account(sub).frozen = 0
  const valid = (await (await app.request(validationUrl)).json()) as Data
  assert.equal(valid.validate_result, 'ALLOW_CANCEL_WITHDRAW')
  assert.ok(
    (valid.account_info as Data[]).some(
      (item) =>
        item.out_account_type === 'MARGIN_ACCOUNT' && item.amount === 50,
    ),
  )
  const body = {
    sub_mchid: sub,
    out_request_no: 'CancelNew001',
    withdraw: 'APPLY_WITHDRAW',
    payee_info: corporatePayee,
  }
  const submit = () =>
    app.request('/v3/ecommerce/account/apply-cancel-withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  const created = (await (await submit()).json()) as Data
  assert.deepEqual(await (await submit()).json(), created)
  const action = runtime.actions.get('cancel-withdraw')!
  const confirm = (await action({
    applyment_id: created.applyment_id,
    state: 'WAITING_MERCHANT_CONFIRM',
  })) as Data
  assert.ok((confirm.confirm_cancel as Data).confirm_cancel_url)
  await action({ out_request_no: 'CancelNew001', state: 'FUND_PROCESSING' })
  assert.equal(runtime.account(sub).available, 0)
  assert.equal(runtime.account(sub).frozen, 700)
  const finished = (await action({
    applyment_id: created.applyment_id,
    state: 'FINISH',
  })) as Data
  assert.equal(finished.withdraw_state, 'WITHDRAW_SUCCEED')
  assert.equal(runtime.account(sub).frozen, 0)
  assert.equal(
    runtime.store.get<Data>('merchants', sub)?.merchant_state,
    'HAS_BEEN_CANCELLED',
  )
  await action({
    applyment_id: created.applyment_id,
    state: 'FINISH',
    withdraw_state: 'WITHDRAW_EXCEPTION',
    reason: '银行退票',
  })
  await action({
    applyment_id: created.applyment_id,
    state: 'FINISH',
    withdraw_state: 'WITHDRAW_EXCEPTION',
    reason: '银行退票',
  })
  assert.equal(runtime.account(sub).available, 700)
  assert.equal(runtime.account(sub, 'OPERATION').available, 300)
  assert.equal(runtime.account(sub, 'DEPOSIT').available, 50)
  const byOut = await (
    await app.request(
      '/v3/ecommerce/account/apply-cancel-withdraw/out-request-no/CancelNew001',
    )
  ).json()
  const byId = await (
    await app.request(
      `/v3/ecommerce/account/apply-cancel-withdraw/applyment-id/${created.applyment_id}`,
    )
  ).json()
  assert.deepEqual(byOut, byId)
})

test('旧流程先注销再提现；失败、银行退票及同单重试不会重复扣款', async (t) => {
  const { app, runtime, close } = createApp({ callbacks: false })
  t.after(close)
  const sub = runtime.config.subMchid
  runtime.account(sub).available = 1_000
  const cancellation = {
    sub_mchid: sub,
    out_apply_no: 'CancelOld001',
    application_info: [
      {
        application_type: 'SP_CANCEL_ACCOUNT_APPLICATION',
        application_media_id: 'test_media',
      },
    ],
  }
  const canceled = await app.request(
    '/v3/ecommerce/account/cancel-applications',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cancellation),
    },
  )
  assert.equal(canceled.status, 200, await canceled.clone().text())
  assert.equal(((await canceled.json()) as Data).cancel_state, 'CANCEL_SUCCESS')
  const body = {
    sub_mchid: sub,
    out_account_type: 'BASIC_ACCOUNT',
    amount: 400,
    out_request_no: 'Risk001',
    payee_type: 'CONTRIBUTION_MERCHANT',
    payee_mchid: sub,
    payee_info: corporatePayee,
  }
  const submit = () =>
    app.request('/v3/mch_operate/risk/withdrawl-apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  const createdResponse = await submit()
  assert.equal(
    createdResponse.status,
    200,
    await createdResponse.clone().text(),
  )
  const created = (await createdResponse.json()) as Data
  assert.equal(runtime.account(sub).available, 600)
  assert.deepEqual(await (await submit()).json(), created)
  assert.equal(runtime.account(sub).available, 600)
  const queried = (await (
    await app.request(
      `/v3/mch_operate/risk/withdrawl-apply/applyment-id/${created.applyment_id}`,
    )
  ).json()) as Data
  assert.equal((queried.withdrawl_apply as Data).state, 'PAY_SUCCEED')
  const action = runtime.actions.get('cancel-withdrawal')!
  await action({
    applyment_id: created.applyment_id,
    state: 'BANK_REFUNDED',
    reason: '银行退票',
  })
  await action({
    applyment_id: created.applyment_id,
    state: 'BANK_REFUNDED',
    reason: '银行退票',
  })
  assert.equal(runtime.account(sub).available, 1_000)
})

test('旧注销后提现审核失败释放预约资金，不能提现未注销的商户', async (t) => {
  const { app, runtime, close } = createApp({
    config: { autoComplete: false },
    callbacks: false,
  })
  t.after(close)
  const sub = runtime.config.subMchid
  runtime.account(sub).available = 900
  const body = {
    sub_mchid: sub,
    out_account_type: 'BASIC_ACCOUNT',
    amount: 400,
    out_request_no: 'RiskManual001',
    payee_type: 'CONTRIBUTION_MERCHANT',
    payee_mchid: sub,
    payee_info: corporatePayee,
  }
  const submit = () =>
    app.request('/v3/mch_operate/risk/withdrawl-apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  assert.equal((await submit()).status, 400)
  await app.request('/v3/ecommerce/account/cancel-applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sub_mchid: sub,
      out_apply_no: 'ManualCancel001',
      application_info: [
        {
          application_type: 'SP_CANCEL_ACCOUNT_APPLICATION',
          application_media_id: 'test_media',
        },
      ],
    }),
  })
  await runtime.actions.get('cancel')!({
    out_apply_no: 'ManualCancel001',
    state: 'CANCEL_SUCCESS',
  })
  const response = await submit()
  assert.equal(response.status, 200, await response.clone().text())
  const created = (await response.json()) as Data
  assert.equal(runtime.account(sub).available, 500)
  assert.equal(runtime.account(sub).frozen, 400)
  await runtime.actions.get('cancel-withdrawal')!({
    applyment_id: created.applyment_id,
    state: 'REJECTED',
    reason: '资料错误',
  })
  const queried = (await (
    await app.request(
      '/v3/mch_operate/risk/withdrawl-apply/out-request-no/RiskManual001',
    )
  ).json()) as Data
  assert.equal((queried.withdrawl_apply as Data).fail_reason, '资料错误')
  assert.equal(runtime.account(sub).available, 900)
  assert.equal(runtime.account(sub).frozen, 0)
  assert.deepEqual(await (await submit()).json(), created)
  assert.equal(runtime.account(sub).available, 900)
})

test('主体变更支持原单驳回重提、撤销和通过后按新主体证件查询商户', async (t) => {
  const { app, runtime, close } = createApp({
    config: { autoComplete: false },
    callbacks: false,
  })
  t.after(close)
  const sub = runtime.config.subMchid
  const base = {
    merchant_code: sub,
    out_request_no: 'Subject001',
    ...licenseChange,
  }
  const submit = (body: Data) =>
    app.request('/v3/mchalterapply/mchsubjectalterapplyment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  const response = await submit(base)
  assert.equal(response.status, 200, await response.clone().text())
  const created = (await response.json()) as Data
  const action = runtime.actions.get('subject-alter')!
  const rejected = (await action({
    apply_id: created.apply_id,
    state: 'APPLYMENT_STATE_REJECTED',
    reason: '证件错误',
  })) as Data
  assert.equal(rejected.audit_reject_reason, '证件错误')
  const corrected = {
    ...base,
    business_license_info: {
      ...licenseChange.business_license_info,
      merchant_name: '修正的有限公司',
    },
  }
  assert.deepEqual(await (await submit(corrected)).json(), created)
  assert.deepEqual(await (await submit(corrected)).json(), created)
  await action({
    apply_id: created.apply_id,
    state: 'APPLYMENT_STATE_FINISHED',
  })
  const byOutNo = await (
    await app.request(
      `/v3/mchalterapply/mchsubjectalterapplyment/merchant/${sub}/out-request-no/Subject001`,
    )
  ).json()
  assert.deepEqual(
    await (
      await app.request(
        `/v3/mchalterapply/mchsubjectalterapplyment/${created.apply_id}`,
      )
    ).json(),
    byOutNo,
  )
  const subjects = (await (
    await app.request(
      '/v3/ecommerce/subject-sub-merchants?organization_type=SUBJECT_TYPE_ENTERPRISE&cert_number=91440300MA5NEW00001',
    )
  ).json()) as Data
  assert.equal(subjects.total_count, 1)
  assert.equal(
    (
      (await (
        await app.request(
          `/v3/mchalterapply/mchsubjectalterapplyment/${created.apply_id}/revoke`,
          { method: 'POST' },
        )
      ).json()) as Data
    ).result,
    'FAIL',
  )
  const second = (await (
    await submit({ ...base, out_request_no: 'Subject002' })
  ).json()) as Data
  assert.equal(
    (
      (await (
        await app.request(
          `/v3/mchalterapply/mchsubjectalterapplyment/${second.apply_id}/revoke`,
          { method: 'POST' },
        )
      ).json()) as Data
    ).result,
    'SUCCESS',
  )
  const revoked = (await (
    await app.request(
      `/v3/mchalterapply/mchsubjectalterapplyment/${second.apply_id}`,
    )
  ).json()) as Data
  assert.equal(revoked.state, 'APPLYMENT_STATE_CANCELED')
})

test('敏感字段可以使用平台公钥加密提交，查询返回掩码而非密文', async (t) => {
  const { app, runtime, close } = createApp({ callbacks: false })
  t.after(close)
  const encrypt = (text: string) =>
    publicEncrypt(
      {
        key: runtime.crypto.platformPublicKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha1',
      },
      Buffer.from(text),
    ).toString('base64')
  const body = {
    account_type: 'ACCOUNT_TYPE_BUSINESS',
    account_bank: '工商银行',
    account_name: encrypt('联调测试有限公司'),
    account_number: encrypt('6222021234567890123'),
  }
  const changed = await app.request(
    `/v3/apply4sub/sub_merchants/${runtime.config.subMchid}/modify-settlement`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  assert.equal(changed.status, 200, await changed.clone().text())
  const result = (await (
    await app.request(
      `/v3/apply4sub/sub_merchants/${runtime.config.subMchid}/settlement`,
    )
  ).json()) as Data
  assert.equal(result.account_number, '62***************23')
  const query = new URLSearchParams({
    organization_type: 'SUBJECT_TYPE_ENTERPRISE',
    cert_number: encrypt('91440300MA5MOCK001'),
  })
  const subjects = (await (
    await app.request(`/v3/ecommerce/subject-sub-merchants?${query}`)
  ).json()) as Data
  assert.equal(subjects.total_count, 1)
})

test('账户验证、签约及注销确认链接可以打开，确认幂等且校验阶段和平台归属', async (t) => {
  const { app, runtime, close } = createApp({
    config: { autoComplete: false },
    callbacks: false,
  })
  t.after(close)
  const outRequestNo = 'Html_<img src=x onerror=alert(1)>'
  const submit = await app.request('/v3/ecommerce/applyments/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(applyment(outRequestNo)),
  })
  assert.equal(submit.status, 200, await submit.clone().text())
  const created = (await submit.json()) as Data
  const post = (url: string) =>
    app.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
  assert.equal((await post(`/__mock/sign/${created.applyment_id}`)).status, 400)
  const verification = (await runtime.actions.get('applyment')!({
    applyment_id: created.applyment_id,
    state: 'ACCOUNT_NEED_VERIFY',
  })) as Data
  const verificationUrl = String(verification.legal_validation_url)
  const verifyPage = await app.request(verificationUrl)
  assert.equal(verifyPage.status, 200)
  assert.match(verifyPage.headers.get('Content-Type')!, /text\/html/)
  const html = await verifyPage.text()
  assert.match(html, /确认账户验证完成/)
  assert.ok(html.includes('Html_&lt;img src=x onerror=alert(1)&gt;'))
  assert.ok(!html.includes('Html_<img src=x onerror=alert(1)>'))
  const verified = (await (await post(verificationUrl)).json()) as Data
  assert.equal(verified.applyment_state, 'AUDITING')
  assert.equal(
    ((await (await post(verificationUrl)).json()) as Data).applyment_state,
    'AUDITING',
  )
  const signing = (await runtime.actions.get('applyment')!({
    applyment_id: created.applyment_id,
    state: 'NEED_SIGN',
  })) as Data
  const signUrl = String(signing.sign_url)
  assert.match(await (await app.request(signUrl)).text(), /确认签约/)
  const signed = (await (await post(signUrl)).json()) as Data
  assert.equal(signed.applyment_state, 'FINISH')
  assert.deepEqual(await (await post(signUrl)).json(), signed)
  assert.equal(
    runtime.store.get<Data>('merchants', String(signed.sub_mchid))
      ?.merchant_state,
    'NORMAL',
  )
  const stored = runtime.store.get<Data>(
    'applyments',
    String(created.applyment_id),
  )!
  stored.sp_mchid = '9999999999'
  assert.equal((await app.request(signUrl)).status, 403)
  assert.equal((await post(signUrl)).status, 403)
  runtime.store.get<Data>(
    'applyments',
    String(created.applyment_id),
  )!.sp_mchid = runtime.config.spMchid

  const sub = runtime.config.subMchid
  const cancelRequest = await app.request(
    '/v3/ecommerce/account/apply-cancel-withdraw',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sub_mchid: sub,
        out_request_no: 'CancelLink001',
        withdraw: 'NOT_APPLY_WITHDRAW',
      }),
    },
  )
  const canceled = (await cancelRequest.json()) as Data
  assert.equal(
    (await post(`/__mock/confirm-cancel/${canceled.applyment_id}`)).status,
    400,
  )
  const waiting = (await runtime.actions.get('cancel-withdraw')!({
    applyment_id: canceled.applyment_id,
    state: 'WAITING_MERCHANT_CONFIRM',
  })) as Data
  const confirmUrl = String((waiting.confirm_cancel as Data).confirm_cancel_url)
  assert.match(await (await app.request(confirmUrl)).text(), /确认注销商户/)
  const confirmed = (await (await post(confirmUrl)).json()) as Data
  assert.equal(confirmed.cancel_state, 'SYSTEM_PROCESSING')
  assert.deepEqual(await (await post(confirmUrl)).json(), confirmed)
  assert.equal(
    runtime.store.get<Data>('merchants', sub)?.merchant_state,
    'NORMAL',
  )
  await runtime.actions.get('cancel-withdraw')!({
    applyment_id: canceled.applyment_id,
    state: 'FINISH',
  })
  assert.ok(
    !(await (await app.request(confirmUrl)).text()).includes('id="confirm"'),
  )

  await runtime.actions.get('merchant')!({ sub_mchid: '1900000999' })
  const secondRequest = await app.request(
    '/v3/ecommerce/account/apply-cancel-withdraw',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sub_mchid: '1900000999',
        out_request_no: 'CancelLink002',
      }),
    },
  )
  const second = (await secondRequest.json()) as Data
  await runtime.actions.get('cancel-withdraw')!({
    applyment_id: second.applyment_id,
    state: 'WAITING_MERCHANT_CONFIRM',
  })
  runtime.config.autoComplete = true
  assert.equal(
    (
      (await (
        await post(`/__mock/confirm-cancel/${second.applyment_id}`)
      ).json()) as Data
    ).cancel_state,
    'FINISH',
  )
  assert.equal(
    runtime.store.get<Data>('merchants', '1900000999')?.merchant_state,
    'HAS_BEEN_CANCELLED',
  )
})
