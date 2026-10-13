import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { createApp } from '../src/app.js'
import type { Data } from '../src/types.js'

type Instance = ReturnType<typeof createApp>
interface RecordResult {
  key: string
  value: Data
  revision: number
  created_at: string
  updated_at: string
}

const api = (
  instance: Instance,
  method: string,
  path: string,
  body?: unknown,
) =>
  instance.app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
const recordPath = (table: string, key: string, revision?: number) =>
  `/mock/database/${encodeURIComponent(table)}/record?${new URLSearchParams({ key, ...(revision === undefined ? {} : { revision: String(revision) }) })}`
async function record(
  instance: Instance,
  table: string,
  key: string,
): Promise<RecordResult> {
  const response = await api(instance, 'GET', recordPath(table, key))
  const body = await response.text()
  assert.equal(response.status, 200, body)
  return JSON.parse(body) as RecordResult
}
const account = (mchid = '1900000999', available = 1000) => ({
  mchid,
  account_type: 'BASIC',
  available,
  frozen: 0,
})
const payment = {
  sp_appid: 'wx_mock_platform',
  sp_mchid: '1900000100',
  sub_mchid: '1900000101',
  description: '数据库测试商品',
  out_trade_no: 'DBORDER01',
  notify_url: 'http://127.0.0.1:1/notify',
  amount: { total: 1000, currency: 'CNY' },
}

test('数据库元数据展示真实 SQLite 和逻辑表，内部表隐藏及日志只读', async (t) => {
  const instance = createApp({ callbacks: false })
  t.after(() => instance.close())
  const response = await api(instance, 'GET', '/mock/database')
  assert.equal(response.status, 200)
  const data = (await response.json()) as {
    info: {
      engine: string
      mode: string
      sqliteVersion: string
      recordCount: number
    }
    tables: { name: string; label: string; count: number; editable: boolean }[]
  }
  assert.match(data.info.engine, /sqlite/i)
  assert.match(data.info.sqliteVersion, /^\d+\.\d+/)
  assert.ok(data.info.recordCount >= 4)
  assert.ok(data.tables.find((table) => table.name === 'accounts')!.editable)
  assert.equal(
    data.tables.find((table) => table.name === 'requests')!.editable,
    false,
  )
  assert.equal(
    data.tables.find((table) => table.name === 'received_callbacks')!.editable,
    false,
  )
  assert.equal(
    data.tables.some((table) =>
      ['meta', 'idempotency', 'console_ciphertexts', 'sqlite_schema'].includes(
        table.name,
      ),
    ),
    false,
  )
  const page = (await (
    await api(instance, 'GET', '/mock/database/accounts/records')
  ).json()) as {
    items: RecordResult[]
    total: number
    page: number
    pageSize: number
  }
  assert.equal(page.page, 1)
  assert.equal(page.pageSize, 25)
  assert.equal(page.total, 2)
  assert.ok(
    page.items.every(
      (item) => item.revision >= 1 && item.created_at && item.updated_at,
    ),
  )
})

test('记录新增、更新、删除支持含斜杠的复合键，业务余额接口立即读取修改', async (t) => {
  const instance = createApp({ callbacks: false })
  t.after(() => instance.close())
  const value = account('test/merchant', 1234)
  const key = `${value.mchid}:BASIC`
  const created = await api(
    instance,
    'POST',
    '/mock/database/accounts/records',
    { key, value },
  )
  assert.equal(created.status, 201, await created.clone().text())
  assert.deepEqual(await created.json(), { key, value })
  const initial = await record(instance, 'accounts', key)
  const changed = {
    ...value,
    available: 9999,
    scenario_status: 'INTENTIONAL_ABNORMAL_TEST',
  }
  const updated = await api(instance, 'PUT', '/mock/database/accounts/record', {
    key,
    value: changed,
    revision: initial.revision,
  })
  assert.equal(updated.status, 200, await updated.clone().text())
  assert.equal(Object.hasOwn((await updated.json()) as Data, 'revision'), false)
  const current = await record(instance, 'accounts', key)
  assert.ok(current.revision > initial.revision)
  assert.deepEqual(current.value, changed)
  const balance = await api(
    instance,
    'GET',
    `/v3/ecommerce/fund/balance/${encodeURIComponent(value.mchid)}`,
  )
  assert.equal(balance.status, 200, await balance.clone().text())
  assert.equal(((await balance.json()) as Data).available_amount, 9999)
  assert.equal(
    (await api(instance, 'DELETE', recordPath('accounts', key))).status,
    400,
  )
  assert.equal(
    (
      await api(
        instance,
        'DELETE',
        recordPath('accounts', key, current.revision),
      )
    ).status,
    204,
  )
  assert.equal(
    (await api(instance, 'GET', recordPath('accounts', key))).status,
    404,
  )
})

test('修改订单完整记录立即影响官方查单，允许异常状态但不自动联动账户', async (t) => {
  const instance = createApp({ callbacks: false })
  t.after(() => instance.close())
  assert.equal(
    (
      await api(
        instance,
        'POST',
        '/v3/pay/partner/transactions/native',
        payment,
      )
    ).status,
    200,
  )
  const key = '1900000101:DBORDER01'
  const initial = await record(instance, 'orders', key)
  const value = {
    ...initial.value,
    description: '通过数据库修改',
    trade_state: 'CUSTOM_FAILURE_FOR_TEST',
    amount: { total: 1200, currency: 'CNY' },
  }
  const updated = await api(instance, 'PUT', '/mock/database/orders/record', {
    key,
    value,
    revision: initial.revision,
  })
  assert.equal(updated.status, 200, await updated.clone().text())
  const response = await api(
    instance,
    'GET',
    '/v3/pay/partner/transactions/out-trade-no/DBORDER01?sp_mchid=1900000100&sub_mchid=1900000101',
  )
  assert.equal(response.status, 200, await response.clone().text())
  const order = (await response.json()) as Data
  assert.equal(
    (await record(instance, 'orders', key)).value.description,
    value.description,
  )
  assert.equal(order.trade_state, value.trade_state)
  assert.equal((order.amount as Data).total, 1200)
  assert.equal(instance.runtime.account('1900000101').available, 0)
  assert.equal(instance.runtime.account('1900000101').frozen, 0)
  const added = {
    ...initial.value,
    out_trade_no: 'DBORDER02',
    transaction_id: 'DBTRANSACTION02',
    prepay_id: 'DBPREPAY02',
  }
  assert.equal(
    (
      await api(instance, 'POST', '/mock/database/orders/records', {
        key: '1900000101:DBORDER02',
        value: added,
      })
    ).status,
    201,
  )
  assert.equal(
    (
      await api(
        instance,
        'GET',
        '/v3/pay/partner/transactions/out-trade-no/DBORDER02?sp_mchid=1900000100&sub_mchid=1900000101',
      )
    ).status,
    200,
  )
})

test('重复键和并发旧 revision 返回 409，过期删除不会覆盖最新业务更新', async (t) => {
  const instance = createApp({ callbacks: false })
  t.after(() => instance.close())
  const key = '1900000101:BASIC'
  const initial = await record(instance, 'accounts', key)
  assert.equal(
    (
      await api(instance, 'POST', '/mock/database/accounts/records', {
        key,
        value: initial.value,
      })
    ).status,
    409,
  )
  assert.equal(
    (
      await api(instance, 'POST', '/mock/accounts', {
        mchid: '1900000101',
        available: 7777,
      })
    ).status,
    200,
  )
  const current = await record(instance, 'accounts', key)
  assert.ok(current.revision > initial.revision)
  const stale = await api(instance, 'PUT', '/mock/database/accounts/record', {
    key,
    value: { ...initial.value, available: 1 },
    revision: initial.revision,
  })
  assert.equal(stale.status, 409)
  assert.equal(((await stale.json()) as Data).code, 'CONFLICT')
  assert.equal(
    (
      await api(
        instance,
        'DELETE',
        recordPath('accounts', key, initial.revision),
      )
    ).status,
    409,
  )
  assert.equal((await record(instance, 'accounts', key)).value.available, 7777)
  assert.equal(
    (
      await api(instance, 'PUT', '/mock/database/accounts/record', {
        key: 'missing:BASIC',
        value: account('missing'),
        revision: 1,
      })
    ).status,
    404,
  )
  assert.equal(
    (await api(instance, 'DELETE', recordPath('accounts', 'missing:BASIC', 1)))
      .status,
    404,
  )
  assert.equal(
    (
      await api(
        instance,
        'DELETE',
        recordPath('accounts', key, current.revision),
      )
    ).status,
    204,
  )
  assert.equal(
    (
      await api(instance, 'POST', '/mock/database/accounts/records', {
        key,
        value: current.value,
      })
    ).status,
    201,
  )
  const recreated = await record(instance, 'accounts', key)
  assert.ok(recreated.revision > current.revision)
  assert.equal(
    (
      await api(instance, 'PUT', '/mock/database/accounts/record', {
        key,
        value: initial.value,
        revision: current.revision,
      })
    ).status,
    409,
  )
})

test('分页及搜索使用字面 JSON 内容，SQL 注入字符和通配符不会改变查询', async (t) => {
  const instance = createApp({ callbacks: false })
  t.after(() => instance.close())
  for (const mchid of [
    'SQL%_TEST01',
    "SQL'; DROP TABLE records; --",
    'SQLTEST03',
  ]) {
    const value = { ...account(mchid), note: `场景 ${mchid}` }
    assert.equal(
      (
        await api(instance, 'POST', '/mock/database/accounts/records', {
          key: `${mchid}:BASIC`,
          value,
        })
      ).status,
      201,
    )
  }
  const page = (await (
    await api(
      instance,
      'GET',
      '/mock/database/accounts/records?search=SQL&page=2&pageSize=2',
    )
  ).json()) as {
    items: RecordResult[]
    total: number
    page: number
    pageSize: number
  }
  assert.equal(page.total, 3)
  assert.equal(page.items.length, 1)
  assert.equal(page.page, 2)
  assert.equal(page.pageSize, 2)
  for (const search of ['%', '_TEST', "'; DROP TABLE records; --"]) {
    const result = (await (
      await api(
        instance,
        'GET',
        `/mock/database/accounts/records?${new URLSearchParams({ search })}`,
      )
    ).json()) as { items: RecordResult[]; total: number }
    assert.equal(result.total, 1, search)
    assert.equal(result.items.length, 1)
  }
  assert.equal(
    (await api(instance, 'GET', '/mock/database/accounts/records?page=0'))
      .status,
    400,
  )
  assert.equal(
    (await api(instance, 'GET', '/mock/database/accounts/records?pageSize=101'))
      .status,
    400,
  )
  assert.equal(
    (await api(instance, 'GET', '/mock/database/accounts/records?page=1.5'))
      .status,
    400,
  )
})

test('结构错误、原型、内部表、跨站和超过 1 MiB 的写入均不能污染业务数据', async (t) => {
  const instance = createApp({ callbacks: false })
  t.after(() => instance.close())
  for (const table of [
    'meta',
    'idempotency',
    'console_ciphertexts',
    'sqlite_schema',
    'unknown',
    '__proto__',
  ]) {
    assert.equal(
      (await api(instance, 'GET', `/mock/database/${table}/records`)).status,
      404,
      table,
    )
    assert.equal(
      (
        await api(instance, 'POST', `/mock/database/${table}/records`, {
          key: 'invalid',
          value: {},
        })
      ).status,
      404,
      table,
    )
  }
  for (const table of ['requests', 'received_callbacks'])
    assert.equal(
      (
        await api(instance, 'POST', `/mock/database/${table}/records`, {
          key: 'fake',
          value: {},
        })
      ).status,
      403,
    )
  for (const body of [
    { key: '1900000999:BASIC', value: [] },
    { key: '1900000999:BASIC', value: { ...account(), available: -1 } },
    { key: '1900000999:BASIC', value: { ...account(), frozen: 1.5 } },
    {
      key: '1900000999:BASIC',
      value: { ...account(), available: Number.MAX_SAFE_INTEGER + 1 },
    },
    { key: 'wrong:BASIC', value: account() },
    { key: 'bad\u0000key', value: account() },
    { key: 'a'.repeat(257), value: account() },
    {
      key: '1900000999:BASIC',
      value: {
        ...account(),
        custom: JSON.parse('{"__proto__":{"polluted":true}}'),
      },
    },
  ])
    assert.equal(
      (await api(instance, 'POST', '/mock/database/accounts/records', body))
        .status,
      400,
    )
  assert.equal(
    (
      await api(instance, 'POST', '/mock/database/orders/records', {
        key: '1900000101:missing',
        value: { amount: { total: 100 } },
      })
    ).status,
    400,
  )
  assert.equal(
    (
      await api(instance, 'POST', '/mock/database/merchants/records', {
        key: 'other',
        value: {
          ...instance.runtime.store.get<Data>('merchants', '1900000101'),
          sub_mchid: '1900000101',
        },
      })
    ).status,
    400,
  )
  const giant = {
    key: '1900000999:BASIC',
    value: { ...account(), text: 'x'.repeat(1024 * 1024) },
  }
  assert.equal(
    (await api(instance, 'POST', '/mock/database/accounts/records', giant))
      .status,
    413,
  )
  const crossSite = await instance.app.request(
    '/mock/database/accounts/records',
    {
      method: 'POST',
      headers: {
        Origin: 'https://example.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key: '1900000999:BASIC', value: account() }),
    },
  )
  assert.equal(crossSite.status, 400)
  assert.equal(
    instance.runtime.store.get('accounts', '1900000999:BASIC'),
    undefined,
  )
  assert.equal(instance.runtime.account('1900000101').available, 0)
})

test('文件 SQLite 中新增及编辑记录真实持久化，重启后官方接口仍读取最新数据', async () => {
  const directory = mkdtempSync(join(resolve('tests'), '.database-state-'))
  let instance: Instance | undefined
  try {
    instance = createApp({ dataDir: directory, callbacks: false })
    const key = '1900000101:BASIC'
    const current = await record(instance, 'accounts', key)
    assert.equal(
      (
        await api(instance, 'PUT', '/mock/database/accounts/record', {
          key,
          value: { ...current.value, available: 4321 },
          revision: current.revision,
        })
      ).status,
      200,
    )
    const changed = await record(instance, 'accounts', key)
    const info = instance.runtime.store.info()
    assert.ok(info.path)
    instance.close()
    instance = undefined
    assert.equal(
      readFileSync(info.path!).subarray(0, 16).toString('utf8'),
      'SQLite format 3\u0000',
    )
    instance = createApp({ dataDir: directory, callbacks: false })
    const reloaded = await record(instance, 'accounts', key)
    assert.equal(reloaded.revision, changed.revision)
    assert.equal(reloaded.value.available, 4321)
    assert.equal(
      (
        (await (
          await api(instance, 'GET', '/v3/ecommerce/fund/balance/1900000101')
        ).json()) as Data
      ).available_amount,
      4321,
    )
  } finally {
    instance?.close()
    assert.ok(directory.startsWith(join(resolve('tests'), '.database-state-')))
    rmSync(directory, { recursive: true, force: true })
  }
})
