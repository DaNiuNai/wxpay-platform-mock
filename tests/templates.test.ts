import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { contracts } from '../src/contracts.js'
import { defaults } from '../src/core.js'
import type { Data, MockConfig } from '../src/types.js'
import { validateFields } from '../src/validation.js'

interface Scenario {
  id: string
  method: string
  path: string
  body?: Data
  query?: Data
}
interface Action {
  id: string
  key?: string
  body: Data
}
interface Templates {
  scenarios: Scenario[]
  actions: Action[]
}
const templateModulePath = '../src/web/templates.js'
const { createTemplates } = (await import(templateModulePath)) as {
  createTemplates: (config: MockConfig, snapshot?: Data) => Templates
}

function fixture(autoComplete = true) {
  const mock = createApp({
    dataDir: null,
    callbacks: false,
    config: { autoComplete },
  })
  const templates = () =>
    createTemplates(mock.runtime.config, mock.runtime.store.snapshot())
  const scenario = (id: string) => {
    const selected = templates().scenarios.find((item) => item.id === id)
    assert.ok(selected, `模板 ${id} 不存在`)
    return selected
  }
  const send = async (selected: Scenario): Promise<Data> => {
    let path = selected.path
    if (selected.query)
      path += `?${new URLSearchParams(Object.entries(selected.query).map(([key, value]) => [key, String(value)]))}`
    let body: BodyInit | undefined
    let headers: Record<string, string> | undefined
    if (selected.body?.file) {
      const file = selected.body.file as Data
      const bytes = Buffer.from(String(file.content_base64), 'base64')
      const digest = createHash('sha256').update(bytes).digest('hex')
      const legacy = selected.path.includes('cancel-applications/media')
      const form = new FormData()
      form.set(
        'meta',
        JSON.stringify(
          legacy
            ? { file_name: file.name, file_digest: digest }
            : { filename: file.name, sha256: digest },
        ),
      )
      form.set(
        'file',
        new Blob([bytes], { type: String(file.type) }),
        String(file.name),
      )
      body = form
    } else if (selected.body) {
      body = JSON.stringify(selected.body)
      headers = { 'Content-Type': 'application/json' }
    }
    const response = await mock.app.request(path, {
      method: selected.method,
      body,
      headers,
    })
    const text = await response.text()
    assert.ok(response.ok, `${selected.id}: HTTP ${response.status} ${text}`)
    return text ? (JSON.parse(text) as Data) : {}
  }
  const request = (id: string) => send(scenario(id))
  const action = async (id: string, override: Data = {}) => {
    const selected = templates().actions.find(
      (item) => (item.key || item.id) === id,
    )
    assert.ok(selected, `动作 ${id} 不存在`)
    return (await mock.runtime.actions.get(selected.id)!({
      ...selected.body,
      ...override,
    })) as Data
  }
  return { ...mock, templates, scenario, send, request, action }
}

test('网页样例覆盖全部 74 个官方契约，提供合法必填参数和唯一业务单号', () => {
  const templates = createTemplates(defaults)
  assert.equal(
    new Set(templates.scenarios.map((item) => item.id)).size,
    templates.scenarios.length,
  )
  assert.equal(
    new Set(templates.actions.map((item) => item.key || item.id)).size,
    templates.actions.length,
  )
  for (const contract of contracts) {
    const expression = new RegExp(
      `^${contract.path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+')}$`,
    )
    const scenario = templates.scenarios.find(
      (item) => item.method === contract.method && expression.test(item.path),
    )
    assert.ok(scenario, `缺少 ${contract.method} ${contract.path} 样例`)
    if (scenario.body?.file) continue // 上传 JSON 由控制台代理转换为 multipart。
    validateFields(scenario.body || {}, contract.fields.body, 'body')
    validateFields(
      Object.fromEntries(
        Object.entries(scenario.query || {}).map(([key, value]) => [
          key,
          String(value),
        ]),
      ),
      contract.fields.query,
      'query',
    )
  }
  const first = templates.scenarios.find(
    (item) => item.id === 'pay-native',
  )!.body!
  const second = createTemplates(defaults).scenarios.find(
    (item) => item.id === 'pay-native',
  )!.body!
  assert.notEqual(first.out_trade_no, second.out_trade_no)
  assert.equal(first.amount && (first.amount as Data).total, 1000)
  assert.equal((first.out_trade_no as string).length <= 32, true)
})

test('网页普通支付及四种合单样例可下单、模拟支付并查询', async (t) => {
  const mock = fixture()
  t.after(() => mock.close())
  for (const kind of ['jsapi', 'app', 'native', 'h5']) {
    await mock.request(`pay-${kind}`)
    await mock.request('pay-query-number')
    const paid = await mock.action('pay')
    assert.equal(paid.trade_state, 'SUCCESS')
    assert.equal((await mock.request('pay-query-id')).trade_state, 'SUCCESS')
    await mock.request(`combine-${kind}`)
    await mock.action('pay-combine')
    const combined = await mock.request('combine-query')
    assert.equal((combined.sub_orders as Data[]).length, 2)
    assert.ok(
      (combined.sub_orders as Data[]).every(
        (order) => order.trade_state === 'SUCCESS',
      ),
    )
  }
  await mock.request('pay-native')
  await mock.request('pay-close')
  await mock.request('combine-native')
  await mock.request('combine-close')
})

test('网页模板选择合适的分账及补差订单，可分账、回退、解冻和补差回退', async (t) => {
  const mock = fixture()
  t.after(() => mock.close())
  await mock.request('pay-sharing')
  await mock.action('pay')
  await mock.request('receiver-add')
  await mock.request('receiver-delete')
  await mock.request('profitsharing-create')
  assert.equal((await mock.request('profitsharing-query')).status, 'FINISHED')
  await mock.request('profitsharing-amounts')
  await mock.request('profitsharing-return')
  assert.equal(
    (await mock.request('profitsharing-return-query')).result,
    'SUCCESS',
  )
  await mock.request('profitsharing-finish')
  await mock.request('pay-subsidy')
  await mock.action('pay')
  mock.runtime.account(mock.runtime.config.spMchid, 'OPERATION').available =
    1000
  assert.equal((await mock.request('subsidy-create')).result, 'SUCCESS')
  assert.equal((await mock.request('subsidy-return')).result, 'SUCCESS')
  await mock.request('pay-subsidy')
  await mock.action('pay')
  await mock.request('refund-apply')
  assert.equal((await mock.request('subsidy-cancel')).result, 'SUCCESS')
})

test('网页退款模板可普通退款、异常银行卡退款及平台垫付回补', async (t) => {
  const mock = fixture()
  t.after(() => mock.close())
  await mock.request('pay-native')
  await mock.action('pay')
  await mock.request('refund-apply')
  assert.equal((await mock.request('refund-query-id')).status, 'SUCCESS')
  assert.equal((await mock.request('refund-query-number')).status, 'SUCCESS')
  mock.runtime.account(mock.runtime.config.spMchid).available = 1000
  mock.runtime.account(mock.runtime.config.subMchid).available = 0
  await mock.request('refund-advance')
  mock.runtime.account(mock.runtime.config.subMchid).available = 1000
  assert.equal((await mock.request('refund-return-advance')).result, 'SUCCESS')
  assert.equal((await mock.request('refund-query-advance')).result, 'SUCCESS')
  mock.runtime.config.autoComplete = false
  await mock.request('refund-apply')
  await mock.action('complete-refund', { status: 'ABNORMAL' })
  assert.equal((await mock.request('refund-abnormal')).status, 'PROCESSING')
  await mock.action('complete-refund')
})

test('网页资金、提现和跨境模板可完成实际模拟业务', async (t) => {
  const mock = fixture()
  t.after(() => mock.close())
  mock.runtime.account(mock.runtime.config.subMchid).available = 5000
  mock.runtime.account(mock.runtime.config.spMchid).available = 5000
  for (const id of [
    'balance-sub',
    'balance-sub-endday',
    'balance-platform',
    'balance-platform-endday',
    'withdraw-sub',
    'withdraw-sub-query-id',
    'withdraw-sub-query-number',
    'withdraw-platform',
    'withdraw-platform-query-id',
    'withdraw-platform-query-number',
    'withdraw-day-end',
    'withdraw-day-end-query',
  ])
    await mock.request(id)
  await mock.request('pay-native')
  await mock.action('pay')
  await mock.request('overseas-available')
  assert.equal((await mock.request('overseas-create')).result, 'SUCCESS')
  assert.equal((await mock.request('overseas-query')).result, 'SUCCESS')
  for (const id of [
    'withdraw-exception-bill',
    'bill-trade',
    'bill-fund',
    'bill-sharing',
    'bill-subfund',
    'overseas-bill',
  ])
    await mock.request(id)
  const bill = mock.scenario('bill-download')
  const result = await mock.app.request(
    `${bill.path}?token=${String(bill.query!.token)}`,
  )
  assert.equal(result.status, 200)
})

test('网页完整进件、媒体、结算及主体变更样例通过服务端验证', async (t) => {
  const mock = fixture()
  t.after(() => mock.close())
  await mock.request('media-upload')
  await mock.request('cancel-media-upload')
  await mock.request('applyment-create')
  assert.equal(
    (await mock.request('applyment-query-id')).applyment_state,
    'FINISH',
  )
  await mock.request('applyment-query-number')
  await mock.request('applyment-micro')
  await mock.request('settlement-modify')
  assert.equal(
    (await mock.request('settlement-query')).verify_result,
    'VERIFY_SUCCESS',
  )
  await mock.request('settlement-query-application')
  await mock.request('subject-merchants')
  await mock.request('subject-alter-create')
  await mock.request('subject-alter-query-id')
  await mock.request('subject-alter-query-number')
  mock.runtime.config.autoComplete = false
  await mock.request('subject-alter-create')
  assert.equal((await mock.request('subject-alter-revoke')).result, 'SUCCESS')
})

test('网页新旧注销模板及注销后提现具备完整合法资料', async (t) => {
  const fresh = fixture()
  t.after(() => fresh.close())
  fresh.runtime.account(fresh.runtime.config.subMchid).available = 1000
  await fresh.request('cancel-validate')
  await fresh.request('cancel-withdraw-create')
  await fresh.request('cancel-withdraw-query-id')
  assert.equal(
    (await fresh.request('cancel-withdraw-query-number')).cancel_state,
    'FINISH',
  )

  const legacy = fixture()
  t.after(() => legacy.close())
  legacy.runtime.account(legacy.runtime.config.subMchid).available = 1000
  await legacy.request('cancel-legacy-create')
  assert.equal(
    (await legacy.request('cancel-legacy-query')).cancel_state,
    'CANCEL_SUCCESS',
  )
  await legacy.request('cancel-risk-withdraw-create')
  await legacy.request('cancel-risk-withdraw-query-id')
  await legacy.request('cancel-risk-withdraw-query-number')
})
