import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { contracts } from '../src/contracts.ts'
import * as helpers from '../src/web/helpers.js'
import { createTemplates } from '../src/web/templates.js'

// 没有浏览器依赖的 DOM 测试夹具，只验证应用事件与服务协议；不替代视觉检查。
const decode = (text) =>
  text.replace(
    /&(?:quot|#39|lt|gt|amp);/g,
    (value) =>
      ({ '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>', '&amp;': '&' })[
        value
      ],
  )
class Element {
  constructor(tag = 'div', attrs = {}, owner) {
    this.tag = tag
    this.attrs = attrs
    this.owner = owner
    this.id = attrs.id
    this.value = attrs.value ?? ''
    this.type = attrs.type ?? ''
    this.disabled = 'disabled' in attrs
    this.checked = 'checked' in attrs
    this.children = []
    this.events = new Map()
    this.dataset = Object.fromEntries(
      Object.entries(attrs)
        .filter(([name]) => name.startsWith('data-'))
        .map(([name, value]) => [
          name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
          value,
        ]),
    )
    this.classList = { toggle() {} }
    this.style = {}
    this._html = ''
  }
  set innerHTML(value) {
    this._html = value
    this.children = []
    for (const match of value.matchAll(
      /<(input|textarea|select|button|form|div|aside|section|dialog|nav|span|p)\b([^>]*)>(?:([^<]*)<\/textarea>)?/g,
    )) {
      const attrs = Object.fromEntries(
        [...match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((item) => [
          item[1],
          decode(item[2] ?? ''),
        ]),
      )
      const child = new Element(match[1], attrs, this.owner)
      child._html = value
        .slice(match.index + match[0].length)
        .split(`</${child.tag}>`)[0]
      if (child.tag === 'textarea') child.value = decode(match[3] ?? '')
      if (child.tag === 'select') {
        const remainder = value
          .slice(match.index + match[0].length)
          .split('</select>')[0]
        const options = [
          ...remainder.matchAll(/<option value="([^"]*)"([^>]*)>/g),
        ]
        child.value = decode(
          (options.find((option) => option[2].includes('selected')) ??
            options[0])?.[1] ?? '',
        )
      }
      this.children.push(child)
    }
  }
  get innerHTML() {
    return this._html
  }
  append(child) {
    this.children.push(child)
  }
  remove() {
    this.removed = true
    this.children = []
  }
  addEventListener(type, callback) {
    this.events.set(type, callback)
  }
  setAttribute(name, value) {
    this.attrs[name] = value
  }
  removeAttribute(name) {
    delete this.attrs[name]
  }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1)
    const attribute = selector.match(/^(\w+)?\[([\w-]+)(?:="([^"]*)")?\]$/)
    return Boolean(
      attribute &&
      (!attribute[1] || this.tag === attribute[1]) &&
      attribute[2] in this.attrs &&
      (attribute[3] === undefined || this.attrs[attribute[2]] === attribute[3]),
    )
  }
  closest(selector) {
    return this.matches(selector) ? this : null
  }
  querySelectorAll(selector) {
    return this.owner.nodes().filter((node) => node.matches(selector))
  }
  querySelector(selector) {
    if (selector === 'button[type="submit"]')
      return new Element('button', { type: 'submit' }, this.owner)
    return this.querySelectorAll(selector)[0] ?? null
  }
  scrollIntoView() {}
  showModal() {}
  close() {
    this.events.get('close')?.()
  }
  click() {}
  select() {}
}

async function fixture() {
  const root = new Element('body')
  const document = {
    visibilityState: 'visible',
    body: root,
    nodes() {
      const walk = (element) => [element, ...element.children.flatMap(walk)]
      return walk(root).filter((node) => !node.removed)
    },
    querySelector(selector) {
      return this.nodes().find((node) => node.matches(selector)) ?? null
    },
    createElement(tag) {
      return new Element(tag, {}, this)
    },
    execCommand() {
      return true
    },
  }
  root.owner = document
  for (const id of [
    'app-nav',
    'view-title',
    'view-subtitle',
    'status-indicator',
    'status-label',
    'refresh-button',
    'auto-refresh',
    'content',
    'toast-region',
  ])
    root.append(new Element('div', { id }, document))
  document.querySelector('#auto-refresh').checked = true
  const nav = document.querySelector('#app-nav')
  for (const view of [
    'overview',
    'scenarios',
    'workbench',
    'records',
    'database',
    'notifications',
    'settings',
  ])
    nav.append(new Element('button', { 'data-view': view }, document))
  const config = {
    baseUrl: 'http://127.0.0.1:18397',
    spMchid: '1900000100',
    spAppid: 'wx_mock_platform',
    subMchid: '1900000101',
    strict: false,
    autoPay: false,
    autoComplete: true,
    serviceNotifyUrl: '',
  }
  const snapshot = {
    accounts: {
      '1900000101:BASIC': {
        mchid: '1900000101',
        account_type: 'BASIC',
        available: 0,
        frozen: 0,
      },
    },
    merchants: {
      1900000101: { sub_mchid: '1900000101', merchant_state: 'NORMAL' },
    },
  }
  const calls = [],
    downloads = [],
    hooks = { onProxy: null, databaseResponse: null }
  const ok = (data, status = 200) =>
    new Response(data === undefined ? null : JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  const databaseRecords = new Map()
  const databaseTables = [
    { name: 'orders', label: '支付订单', editable: true },
    { name: 'accounts', label: '资金账户', editable: true },
    { name: 'merchants', label: '二级商户', editable: true },
    { name: 'requests', label: '请求日志', editable: false },
    { name: 'meta', label: '系统元数据', editable: false },
  ]
  const seedRecord = (table, key, value) => {
    if (!databaseRecords.has(table)) databaseRecords.set(table, new Map())
    const records = databaseRecords.get(table)
    const previous = records.get(key)
    const record = {
      key,
      value: structuredClone(value),
      revision: (previous?.revision ?? 0) + 1,
      created_at: previous?.created_at ?? '2026-10-13T08:00:00Z',
      updated_at: '2026-10-13T08:01:00Z',
    }
    records.set(key, record)
    snapshot[table] ??= {}
    snapshot[table][key] = structuredClone(value)
    return record
  }
  for (const [table, entries] of Object.entries(snapshot))
    for (const [key, value] of Object.entries(entries))
      seedRecord(table, key, value)
  seedRecord('meta', 'seeded', { seeded: true })
  const fetch = async (path, options = {}) => {
    calls.push({ path, options })
    const url = new URL(path, config.baseUrl)
    if (url.pathname === '/mock/database')
      return ok({
        info: {
          engine: 'sqlite',
          mode: 'memory',
          path: null,
          schemaVersion: 1,
          sqliteVersion: '3.51.0',
          journalMode: 'memory',
          legacyImported: false,
          recordCount: [...databaseRecords.values()].reduce(
            (sum, records) => sum + records.size,
            0,
          ),
        },
        tables: databaseTables.map((table) => ({
          ...table,
          count: databaseRecords.get(table.name)?.size ?? 0,
        })),
      })
    if (url.pathname.startsWith('/mock/database/')) {
      const intercepted = await hooks.databaseResponse?.(url, options)
      if (intercepted) return intercepted
      const [, , , table, resource] = url.pathname.split('/')
      const records = databaseRecords.get(table) ?? new Map()
      const method = options.method ?? 'GET'
      if (
        method !== 'GET' &&
        !databaseTables.find((item) => item.name === table)?.editable
      )
        return ok({ code: 'NO_AUTH', message: '内部表只允许查看' }, 403)
      if (method === 'GET' && resource === 'records') {
        const search = url.searchParams.get('search') ?? '',
          page = Number(url.searchParams.get('page') ?? 1),
          pageSize = Number(url.searchParams.get('pageSize') ?? 25)
        const rows = [...records.values()].filter((record) =>
          `${record.key} ${JSON.stringify(record.value)}`.includes(search),
        )
        return ok({
          items: rows.slice((page - 1) * pageSize, page * pageSize),
          total: rows.length,
          page,
          pageSize,
        })
      }
      const input = options.body ? JSON.parse(options.body) : {}
      const key =
        method === 'GET' || method === 'DELETE'
          ? url.searchParams.get('key')
          : input.key
      const record = records.get(key)
      if (method === 'POST') {
        if (record)
          return ok(
            { code: 'RESOURCE_ALREADY_EXISTS', message: '存储键已存在' },
            409,
          )
        seedRecord(table, key, input.value)
        return ok({ key, value: input.value }, 201)
      }
      if (!record)
        return ok({ code: 'RESOURCE_NOT_EXISTS', message: '记录不存在' }, 404)
      if (method === 'GET') return ok(record)
      const revision =
        method === 'DELETE'
          ? Number(url.searchParams.get('revision'))
          : input.revision
      if (record.revision !== revision)
        return ok(
          { code: 'CONFLICT', message: '记录已变更，请加载最新版本' },
          409,
        )
      if (method === 'PUT') {
        seedRecord(table, key, input.value)
        return ok({ key, value: input.value })
      }
      if (method === 'DELETE') {
        records.delete(key)
        delete snapshot[table][key]
        return ok(undefined, 204)
      }
    }
    if (path === '/mock/state') return ok(snapshot)
    if (path === '/mock/config') return ok(config)
    if (path === '/mock/apis')
      return ok({
        implemented: contracts.length,
        total: contracts.length,
        apis: contracts.map((item) => ({ ...item, implemented: true })),
        actions: [],
      })
    if (path === '/mock/credentials')
      return ok({
        sp_mchid: config.spMchid,
        sub_mchid: config.subMchid,
        sp_appid: config.spAppid,
      })
    if (path === '/mock/console/request') {
      const input = JSON.parse(options.body)
      hooks.onProxy?.(input)
      let status = 200,
        body = {}
      const account = snapshot.accounts['1900000101:BASIC']
      if (input.path.startsWith('/v3/ecommerce/fund/balance/'))
        body = {
          available_amount: account.available,
          pending_amount: account.frozen,
        }
      if (input.path === '/v3/pay/partner/transactions/native') {
        if (!input.signed && config.strict) {
          status = 401
          body = { code: 'SIGN_ERROR', message: '签名错误' }
        } else if (!input.body.sp_appid) {
          status = 400
          body = { code: 'PARAM_ERROR', message: 'sp_appid 必填' }
        } else {
          snapshot.orders ??= {}
          snapshot.orders[
            `${input.body.sub_mchid}:${input.body.out_trade_no}`
          ] = {
            ...input.body,
            trade_state: 'NOTPAY',
            transaction_id: 'TX1',
            refunded: 0,
            remaining: input.body.amount.total,
          }
          body = { code_url: 'weixin://mock', prepay_id: 'PRE1' }
        }
      }
      if (input.path === '/v3/ecommerce/profitsharing/orders') {
        account.available += 900
        account.frozen -= 1000
        body = { status: 'FINISHED' }
      }
      if (input.path === '/v3/ecommerce/refunds/apply') {
        account.available -= 200
        body = { refund_id: 'REF1', status: 'SUCCESS' }
      }
      if (input.path === '/v3/ecommerce/fund/withdraw') {
        account.available -= 200
        body = { withdraw_id: 'WD1', status: 'SUCCESS' }
      }
      if (input.path.startsWith('/v3/bill/tradebill'))
        body = {
          download_url: `${config.baseUrl}/v3/billdownload/file?token=TEST`,
        }
      if (input.path.startsWith('/v3/billdownload/file'))
        return ok({
          status: 200,
          headers: { 'content-type': 'application/gzip' },
          body: 'QQ==',
          body_encoding: 'base64',
          duration_ms: 1,
          request: input,
        })
      return ok({
        status,
        statusText: status < 400 ? 'OK' : 'Bad Request',
        headers: { 'content-type': 'application/json' },
        json: body,
        body: JSON.stringify(body),
        duration_ms: 1,
        request: input,
      })
    }
    if (path === '/mock/actions/pay') {
      snapshot.accounts['1900000101:BASIC'].frozen += 1000
      return ok({ transaction_id: 'TX1', trade_state: 'SUCCESS' })
    }
    if (path.startsWith('/mock/actions/')) return ok({ status: 'SUCCESS' })
    throw new Error(`测试未模拟请求 ${path}`)
  }
  const location = { origin: config.baseUrl, hash: '' }
  const scheduled = new Map()
  let nextTimer = 0
  const context = {
    ...helpers,
    h: helpers.escapeHtml,
    createTemplates,
    document,
    fetch,
    location,
    history: {
      replaceState(_state, _title, hash) {
        location.hash = hash
      },
    },
    window: { addEventListener() {} },
    navigator: { clipboard: { async writeText() {} } },
    console,
    performance,
    URL: class extends URL {
      static createObjectURL(blob) {
        downloads.push(blob)
        return 'blob:test'
      }
      static revokeObjectURL() {}
    },
    URLSearchParams,
    Blob,
    FormData,
    atob,
    structuredClone,
    setTimeout(callback, delay) {
      const id = ++nextTimer
      scheduled.set(id, { callback, delay })
      return id
    },
    clearTimeout(id) {
      scheduled.delete(id)
    },
    setInterval() {
      return 1
    },
  }
  const code = readFileSync(
    new URL('../src/web/app.js', import.meta.url),
    'utf8',
  ).replace(/^import\s*\{[^}]*\}\s*from\s*(['"])[^'"\r\n]+\1;?[ \t]*\r?$/gm, '')
  vm.runInNewContext(
    `${code}\nglobalThis.ui = { state, navigate, refresh, selectContract, readWorkbench, scenarioDraft, runFlow, loadDatabase, databaseEditor, databaseEdit, databaseDelete, databaseDetail };`,
    context,
    { filename: 'app.js' },
  )
  await new Promise((resolve) => setImmediate(resolve))
  return {
    document,
    ui: context.ui,
    calls,
    downloads,
    config,
    snapshot,
    hooks,
    databaseRecords,
    seedRecord,
    flushSearch() {
      for (const [id, timer] of scheduled)
        if (timer.delay === 300) {
          scheduled.delete(id)
          timer.callback()
        }
    },
  }
}

test('控制台模块读取真实接口目录，六个页面可初始化且全部接口路径可选', async () => {
  const { document, ui } = await fixture()
  assert.equal(ui.state.catalog.apis.length, 74)
  assert.match(document.querySelector('#content').innerHTML, /74 个接口/)
  for (const view of [
    'scenarios',
    'workbench',
    'records',
    'notifications',
    'settings',
  ]) {
    ui.navigate(view)
    assert.ok(document.querySelector('#content').innerHTML.length > 100)
  }
  ui.navigate('workbench')
  ui.state.catalog.apis.forEach((contract, index) => {
    ui.selectContract(index)
    const input = ui.readWorkbench()
    assert.equal(input.method, contract.method)
    assert.ok(!input.path.includes('{'), `未填充路径参数 ${contract.path}`)
    assert.ok(input.path.startsWith('/v3/'))
  })
})

test('高级 JSON 草稿经过刷新保持不变，表单请求送入签名代理并展示 HTTP 应答', async () => {
  const { document, ui, calls } = await fixture()
  ui.navigate('scenarios')
  const content = document.querySelector('#content'),
    editor = document.querySelector('#scenario-body-json')
  const body = JSON.parse(editor.value)
  body.description = '用户编辑的草稿'
  body.amount.total = 1234
  editor.value = JSON.stringify(body)
  content.events.get('input')({ target: editor })
  await ui.refresh()
  assert.equal(document.querySelector('#scenario-body-json'), editor)
  assert.equal(JSON.parse(editor.value).amount.total, 1234)
  const form = document.querySelector('#scenario-form')
  content.events.get('submit')({ preventDefault() {}, target: form })
  await new Promise((resolve) => setImmediate(resolve))
  const proxy = calls.find((call) => call.path === '/mock/console/request')
  const payload = JSON.parse(proxy.options.body)
  assert.equal(payload.body.description, '用户编辑的草稿')
  assert.equal(payload.body.amount.total, 1234)
  assert.equal(payload.signed, true)
  assert.equal(payload.encryptSensitive, true)
  assert.match(
    document.querySelector('#scenario-response').innerHTML,
    /HTTP 200/,
  )
})

test('官方接口业务错误保留状态码和响应，而恶意订单描述不会成为 HTML', async () => {
  const { document, ui, snapshot } = await fixture()
  ui.navigate('scenarios')
  document.querySelector('#scenario-body-json').value = '{}'
  const content = document.querySelector('#content')
  content.events.get('input')({
    target: document.querySelector('#scenario-body-json'),
  })
  content.events.get('submit')({
    preventDefault() {},
    target: document.querySelector('#scenario-form'),
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.match(
    document.querySelector('#scenario-response').innerHTML,
    /HTTP 400/,
  )
  assert.match(
    document.querySelector('#scenario-response').innerHTML,
    /PARAM_ERROR/,
  )
  snapshot.orders = {
    X: {
      out_trade_no: 'X',
      sub_mchid: '1900000101',
      amount: { total: 1 },
      description: '<img src=x onerror="alert(1)">',
      trade_state: 'NOTPAY',
    },
  }
  await ui.refresh()
  ui.navigate('records')
  assert.ok(!document.querySelector('#record-rows').innerHTML.includes('<img'))
  assert.match(document.querySelector('#record-rows').innerHTML, /&lt;img/)
})

test('一键交易链路使用新业务单号，执行全部步骤且下载二进制账单', async () => {
  const { document, ui, calls, downloads } = await fixture()
  ui.navigate('scenarios')
  await ui.runFlow()
  assert.equal(ui.state.flow.steps.length, 12)
  assert.equal(
    ui.state.flow.steps.every((step) => step.status === 'done'),
    true,
  )
  assert.equal(ui.state.flow.running, false)
  assert.equal(downloads.length, 1)
  assert.equal(downloads[0].size, 1)
  assert.equal(
    calls.some((call) => call.path === '/mock/reset'),
    false,
  )
  const create = calls
    .filter((call) => call.path === '/mock/console/request')
    .map((call) => JSON.parse(call.options.body))
    .find((input) => input.path.endsWith('/native'))
  assert.equal(create.body.settle_info.profit_sharing, true)
  assert.equal(create.body.amount.total, 1000)
  assert.match(document.querySelector('#flow-summary').textContent, /全部完成/)
})

test('停止链路保留已经创建的订单，并且不再支付或发送后续业务请求', async () => {
  const { ui, calls, snapshot, hooks, downloads } = await fixture()
  ui.navigate('scenarios')
  hooks.onProxy = (input) => {
    if (input.path.endsWith('/native')) ui.state.flow.stopped = true
  }
  await ui.runFlow()
  assert.equal(ui.state.flow.steps.length, 2)
  assert.equal(
    ui.state.flow.steps.every((step) => step.status === 'done'),
    true,
  )
  assert.equal(Object.keys(snapshot.orders).length, 1)
  assert.equal(
    calls.some((call) => call.path === '/mock/actions/pay'),
    false,
  )
  assert.equal(downloads.length, 0)
  assert.match(ui.state.flow.result, /已停止后续步骤/)
})

test('合单列表汇总子订单金额和真实状态，支付后隐藏再次支付按钮', async () => {
  const { ui, document, snapshot } = await fixture()
  snapshot.orders = {
    A: {
      out_trade_no: 'A',
      amount: { total: 500 },
      trade_state: 'SUCCESS',
      success_time: '2026-10-12T00:00:00+08:00',
    },
    B: {
      out_trade_no: 'B',
      amount: { total: 700 },
      trade_state: 'REFUND',
      success_time: '2026-10-12T00:00:00+08:00',
    },
  }
  snapshot.combines = {
    C: {
      combine_out_trade_no: 'C',
      combine_mchid: '1900000100',
      order_keys: ['A', 'B'],
    },
  }
  await ui.refresh()
  ui.state.table = 'combines'
  ui.navigate('records')
  const html = document.querySelector('#record-rows').innerHTML
  assert.match(html, /REFUND/)
  assert.match(html, /¥12\.00/)
  assert.ok(!html.includes('data-operation="combine-pay"'))
})

const settle = () => new Promise((resolve) => setImmediate(resolve))
async function openDatabase(fixture) {
  fixture.ui.navigate('database')
  await settle()
  assert.equal(fixture.ui.state.database.loading, false)
}
async function databaseTableChange(fixture, table) {
  const picker = fixture.document.querySelector('#database-table')
  picker.value = table
  fixture.document.querySelector('#content').events.get('change')({
    target: picker,
  })
  await settle()
}
async function databaseClick(fixture, action, key) {
  const element = fixture.document
    .nodes()
    .find(
      (node) =>
        node.dataset.action === action &&
        (key === undefined || node.dataset.key === key),
    )
  assert.ok(element, `找不到数据库操作 ${action}`)
  fixture.document.querySelector('#content').events.get('click')({
    target: element,
  })
  await settle()
}
async function databaseSubmit(fixture) {
  const form = fixture.document.querySelector('#database-record-form')
  await form.events.get('submit')({ preventDefault() {}, target: form })
  await settle()
}

test('数据库页面新增、编辑、确认删除测试记录，并刷新业务状态', async () => {
  const f = await fixture()
  await openDatabase(f)
  await databaseTableChange(f, 'accounts')
  await databaseClick(f, 'database-create')
  const key = '1900000200:BASIC'
  assert.equal(f.document.querySelector('#database-record-key').value, key)
  f.document.querySelector('#database-record-value').value = '[]'
  await databaseSubmit(f)
  assert.equal(
    f.calls.some(
      (call) =>
        call.options.method === 'POST' && call.path.includes('/mock/database/'),
    ),
    false,
  )
  f.document.querySelector('#database-record-value').value = JSON.stringify({
    mchid: '1900000200',
    account_type: 'BASIC',
    available: 12000,
    frozen: 0,
  })
  await databaseSubmit(f)
  assert.equal(
    f.databaseRecords.get('accounts').get(key).value.available,
    12000,
  )
  assert.equal(f.ui.state.snapshot.accounts[key].available, 12000)
  await databaseClick(f, 'database-edit', key)
  assert.equal(f.document.querySelector('#database-record-key').readOnly, true)
  const edited = JSON.parse(
    f.document.querySelector('#database-record-value').value,
  )
  edited.available = 24000
  f.document.querySelector('#database-record-value').value =
    JSON.stringify(edited)
  await databaseSubmit(f)
  const put = f.calls.find(
    (call) =>
      call.options.method === 'PUT' && call.path.includes('/mock/database/'),
  )
  assert.equal(JSON.parse(put.options.body).revision, 1)
  assert.equal(f.databaseRecords.get('accounts').get(key).revision, 2)
  await databaseClick(f, 'database-delete', key)
  assert.equal(
    f.calls.some((call) => call.options.method === 'DELETE'),
    false,
  )
  assert.match(
    f.document.querySelector('#database-delete-preview').innerHTML,
    /24000/,
  )
  const confirm = f.document.querySelector('#database-delete-confirm')
  await confirm.events.get('click')({ currentTarget: confirm })
  assert.equal(f.databaseRecords.get('accounts').has(key), false)
  assert.equal(f.ui.state.snapshot.accounts[key], undefined)
  const deleted = f.calls.find((call) => call.options.method === 'DELETE')
  assert.equal(
    new URL(deleted.path, f.config.baseUrl).searchParams.get('key'),
    key,
  )
  assert.equal(
    new URL(deleted.path, f.config.baseUrl).searchParams.get('revision'),
    '2',
  )
})

test('数据库编辑冲突不会覆盖服务器内容，重新加载保留用户草稿和最新版本', async () => {
  const f = await fixture(),
    key = '1900000101:BASIC'
  await openDatabase(f)
  await databaseTableChange(f, 'accounts')
  await databaseClick(f, 'database-edit', key)
  const editor = f.document.querySelector('#database-record-value')
  const draft = JSON.parse(editor.value)
  draft.available = 50
  editor.value = JSON.stringify(draft)
  f.seedRecord('accounts', key, { ...draft, available: 900 })
  await databaseSubmit(f)
  assert.equal(f.databaseRecords.get('accounts').get(key).value.available, 900)
  assert.equal(f.document.querySelector('#database-record-save').disabled, true)
  assert.match(
    f.document.querySelector('#database-editor-message').innerHTML,
    /本次保存未写入/,
  )
  await f.ui.refresh()
  assert.equal(f.document.querySelector('#database-record-value'), editor)
  assert.equal(JSON.parse(editor.value).available, 50)
  const reload = f.document.querySelector('#database-conflict-reload')
  await reload.events.get('click')({ currentTarget: reload })
  assert.equal(JSON.parse(editor.value).available, 900)
  assert.equal(
    JSON.parse(f.document.querySelector('#database-preserved-draft').value)
      .available,
    50,
  )
  assert.equal(
    f.document.querySelector('#database-record-save').disabled,
    false,
  )
  editor.value = JSON.stringify({ ...draft, available: 1000 })
  await databaseSubmit(f)
  const puts = f.calls.filter((call) => call.options.method === 'PUT')
  assert.equal(JSON.parse(puts.at(-1).options.body).revision, 2)
  assert.equal(f.databaseRecords.get('accounts').get(key).value.available, 1000)
})

test('数据库分页来自服务端 API，删除末页最后记录后回到有效页', async () => {
  const f = await fixture()
  for (let index = 0; index < 27; index++)
    f.seedRecord('orders', `1900000101:ORDER${index}`, {
      out_trade_no: `ORDER${index}`,
      description: '分页测试订单',
    })
  await openDatabase(f)
  assert.equal(f.ui.state.database.total, 27)
  assert.equal(f.ui.state.database.items.length, 25)
  const next = f.document
    .nodes()
    .find(
      (node) =>
        node.dataset.action === 'database-page' && node.dataset.page === '2',
    )
  f.document.querySelector('#content').events.get('click')({ target: next })
  await settle()
  assert.equal(f.ui.state.database.page, 2)
  assert.equal(f.ui.state.database.items.length, 2)
  for (const key of ['1900000101:ORDER25', '1900000101:ORDER26']) {
    await databaseClick(f, 'database-delete', key)
    const confirm = f.document.querySelector('#database-delete-confirm')
    await confirm.events.get('click')({ currentTarget: confirm })
  }
  assert.equal(f.ui.state.database.page, 1)
  assert.equal(f.ui.state.database.items.length, 25)
  const lists = f.calls.filter((call) =>
    call.path.includes('/mock/database/orders/records'),
  )
  assert.ok(
    lists.some(
      (call) =>
        new URL(call.path, f.config.baseUrl).searchParams.get('page') === '2',
    ),
  )
  assert.equal(
    new URL(lists.at(-1).path, f.config.baseUrl).searchParams.get('page'),
    '1',
  )
})

test('数据库只读权限来自元数据，JSON 和特殊存储键安全显示并用查询参数传递', async () => {
  const f = await fixture(),
    key = '特殊:键/带"引号'
  f.seedRecord('requests', key, {
    method: 'POST',
    description: '<img src=x onerror="alert(1)">',
  })
  await openDatabase(f)
  await databaseTableChange(f, 'requests')
  assert.equal(f.document.querySelector('#database-create').disabled, true)
  const rows = f.document.querySelector('#database-results').innerHTML
  assert.ok(!rows.includes('<img'))
  assert.match(rows, /&lt;img/)
  assert.ok(!rows.includes('data-action="database-edit"'))
  assert.ok(!rows.includes('data-action="database-delete"'))
  assert.throws(() => f.ui.databaseEditor('requests'), /只允许查看/)
  await databaseClick(f, 'database-detail', key)
  const detail = f.calls.find((call) =>
    call.path.startsWith('/mock/database/requests/record?'),
  )
  assert.equal(
    new URL(detail.path, f.config.baseUrl).searchParams.get('key'),
    key,
  )
  assert.ok(detail.path.includes('%2F'))
})

test('数据库搜索防抖保留输入，较早请求的迟到应答不会覆盖较新结果', async () => {
  const f = await fixture()
  f.seedRecord('orders', 'slow', { marker: 'slow' })
  f.seedRecord('orders', 'fast', { marker: 'fast' })
  await openDatabase(f)
  const search = f.document.querySelector('#database-search'),
    content = f.document.querySelector('#content')
  const previousCalls = f.calls.filter((call) =>
    call.path.includes('/mock/database/orders/records'),
  ).length
  for (const value of ['f', 'fa', 'fast']) {
    search.value = value
    content.events.get('input')({ target: search })
  }
  assert.equal(
    f.calls.filter((call) =>
      call.path.includes('/mock/database/orders/records'),
    ).length,
    previousCalls,
  )
  f.flushSearch()
  await settle()
  assert.equal(
    f.calls.filter((call) =>
      call.path.includes('/mock/database/orders/records'),
    ).length,
    previousCalls + 1,
  )
  assert.equal(f.ui.state.database.items[0].key, 'fast')
  assert.equal(f.document.querySelector('#database-search'), search)
  let resolveSlow
  const delayed = new Promise((resolve) => {
    resolveSlow = resolve
  })
  f.hooks.databaseResponse = (url) =>
    url.searchParams.get('search') === 'slow' ? delayed : undefined
  f.ui.state.database.search = 'slow'
  const slowRequest = f.ui.loadDatabase({ metadata: false })
  f.ui.state.database.search = 'fast'
  await f.ui.loadDatabase({ metadata: false })
  resolveSlow(
    new Response(
      JSON.stringify({
        items: [f.databaseRecords.get('orders').get('slow')],
        total: 1,
        page: 1,
        pageSize: 25,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    ),
  )
  await slowRequest
  assert.equal(f.ui.state.database.items[0].key, 'fast')
  assert.equal(f.ui.state.database.loading, false)
})

test('数据库删除冲突保持记录，重新核对最新版本后才允许再次确认', async () => {
  const f = await fixture(),
    key = '1900000101:BASIC'
  await openDatabase(f)
  await databaseTableChange(f, 'accounts')
  await databaseClick(f, 'database-delete', key)
  f.seedRecord('accounts', key, {
    mchid: '1900000101',
    account_type: 'BASIC',
    available: 99,
    frozen: 0,
  })
  const confirm = f.document.querySelector('#database-delete-confirm')
  await confirm.events.get('click')({ currentTarget: confirm })
  assert.equal(f.databaseRecords.get('accounts').has(key), true)
  assert.equal(confirm.disabled, true)
  assert.match(
    f.document.querySelector('#database-delete-message').innerHTML,
    /本次删除未执行/,
  )
  const reload = f.document.querySelector('#database-delete-reload')
  await reload.events.get('click')({ currentTarget: reload })
  assert.equal(confirm.disabled, false)
  assert.match(
    f.document.querySelector('#database-delete-preview').innerHTML,
    /99/,
  )
  await confirm.events.get('click')({ currentTarget: confirm })
  assert.equal(f.databaseRecords.get('accounts').has(key), false)
})

test('数据库元信息按北京时间跨日显示，记录中的原始 UTC JSON 保持不变', async () => {
  const f = await fixture()
  const created = '2026-10-13T15:59:59Z',
    updated = '2026-10-13T16:00:01Z'
  const record = f.seedRecord('requests', 'timezone-test', { time: updated })
  record.created_at = created
  record.updated_at = updated
  await openDatabase(f)
  await databaseTableChange(f, 'requests')
  const rows = f.document.querySelector('#database-results').innerHTML
  assert.match(rows, /最后更新（北京时间）/)
  assert.match(rows, /2026-10-14 00:00:01/)
  await databaseClick(f, 'database-detail', 'timezone-test')
  const dialog = f.document.nodes().find((node) => node.tag === 'dialog')
  assert.match(dialog.innerHTML, /2026-10-13 23:59:59/)
  assert.match(dialog.innerHTML, /2026-10-14 00:00:01/)
  assert.match(dialog.innerHTML, /2026-10-13T16:00:01Z/)
  assert.equal(record.created_at, created)
  assert.equal(record.updated_at, updated)
  assert.equal(record.value.time, updated)
})
