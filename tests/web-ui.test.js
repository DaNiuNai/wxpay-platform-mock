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
      /<(input|textarea|select|button|form|div|aside|section|dialog|nav|span)\b([^>]*)>(?:([^<]*)<\/textarea>)?/g,
    )) {
      const attrs = Object.fromEntries(
        [...match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((item) => [
          item[1],
          decode(item[2] ?? ''),
        ]),
      )
      const child = new Element(match[1], attrs, this.owner)
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
    'notifications',
    'settings',
  ])
    nav.append(new Element('button', { 'data-view': view }, document))
  const config = {
    baseUrl: 'http://127.0.0.1:3000',
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
    hooks = { onProxy: null }
  const ok = (data, status = 200) =>
    new Response(data === undefined ? null : JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  const fetch = async (path, options = {}) => {
    calls.push({ path, options })
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
    setTimeout() {
      return 1
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
    `${code}\nglobalThis.ui = { state, navigate, refresh, selectContract, readWorkbench, scenarioDraft, runFlow };`,
    context,
    { filename: 'app.js' },
  )
  await new Promise((resolve) => setImmediate(resolve))
  return { document, ui: context.ui, calls, downloads, config, snapshot, hooks }
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
