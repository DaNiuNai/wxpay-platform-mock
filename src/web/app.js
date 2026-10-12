import { createTemplates } from './templates.js'
import {
  escapeHtml as h,
  jsonText,
  parseObject,
  buildPath,
  setValue,
  getValue,
  leafFields,
  tableRows,
  matchContract,
  localDate,
  shellQuote,
} from './helpers.js'

const $ = (selector, root = document) => root.querySelector(selector)
const content = $('#content')
const state = {
  view: 'overview',
  snapshot: {},
  config: {},
  credentials: {},
  catalog: { apis: [], actions: [] },
  loading: false,
  refreshed: null,
  drafts: new Map(),
  scenario: 'pay-native',
  workbench: null,
  apiFilter: '',
  apiGroup: '',
  table: 'orders',
  recordFilter: '',
  notificationFilter: 'ALL',
  lastResponse: null,
  flow: { running: false, stopped: false, steps: [], result: null },
}
const viewInfo = {
  overview: ['运行总览', '查看本地模拟服务的交易状态、资金和回调。'],
  scenarios: ['模拟测试', '选择业务场景，修改参数并推动状态流转。'],
  workbench: ['API 工作台', '浏览全部接口，编辑请求并查看完整应答。'],
  records: ['业务数据', '查询订单、退款和申请单，对记录执行模拟操作。'],
  notifications: ['回调联调', '跟踪加密通知、重试结果和本地接收器解密内容。'],
  settings: ['联调设置', '调整模拟行为、测试余额和故障注入。'],
}
const tableNames = {
  orders: '支付订单',
  combines: '合单订单',
  refunds: '退款',
  profitsharing: '分账',
  profitsharing_returns: '分账回退',
  subsidies: '补差',
  subsidy_returns: '补差回退',
  subsidy_cancellations: '补差取消',
  withdrawals: '提现',
  merchants: '二级商户',
  accounts: '资金账户',
  applyments: '进件申请',
  settlements: '结算账户',
  settlementApplications: '结算账户修改申请',
  cancelWithdraws: '注销及提现申请',
  legacyCancellations: '旧版注销申请',
  riskWithdrawals: '注销后提现申请',
  subjectAlterations: '主体修改申请',
  overseas: '跨境出境申请',
  receivers: '分账接收方',
  bills: '账单',
  faults: '故障规则',
  requests: '请求日志',
  notifications: '通知队列',
  received_callbacks: '已接收回调',
}
const labels = {
  sp_appid: '平台 AppID',
  appid: 'AppID',
  sp_mchid: '平台商户号',
  sub_mchid: '二级商户号',
  sub_appid: '子商户 AppID',
  out_trade_no: '商户订单号',
  combine_out_trade_no: '合单订单号',
  combine_appid: '合单 AppID',
  combine_mchid: '合单平台商户号',
  out_refund_no: '商户退款单号',
  out_order_no: '商户业务单号',
  out_order_id: '商户出境单号',
  out_request_no: '业务申请编号',
  transaction_id: '微信支付订单号',
  refund_id: '微信退款单号',
  withdraw_id: '提现单号',
  applyment_id: '进件/申请单号',
  description: '描述',
  notify_url: '业务回调地址',
  total: '订单金额（分）',
  total_amount: '金额（分）',
  refund: '退款金额（分）',
  amount: '金额（分）',
  currency: '币种',
  profit_sharing: '订单开启分账',
  finish: '分账后解冻剩余金额',
  subsidy_amount: '下单补差金额（分）',
  account_type: '账户类型',
  bill_date: '账单日期',
  date: '日期',
  bill_type: '账单类型',
  tar_type: '压缩格式',
  reason: '原因',
  status: '状态',
  state: '目标状态',
  success: '是否成功',
  fail_reason: '失败原因',
  merchant_shortname: '商户简称',
  organization_type: '主体类型',
  account_number: '银行账号',
  account_name: '账户名称',
  account_bank: '开户银行',
  available: '可用余额（分）',
  frozen: '冻结余额（分）',
  mchid: '商户号',
  method: '请求方法',
  path: '请求路径',
  code: '错误代码',
  message: '错误说明',
  remaining: '生效次数',
  delay_ms: '延迟（毫秒）',
}
const enumOptions = {
  status: ['SUCCESS', 'PROCESSING', 'CLOSED', 'ABNORMAL', 'FAIL', 'REFUND'],
  account_type: ['BASIC', 'OPERATION', 'FEES', 'DEPOSIT'],
  currency: ['CNY'],
  tar_type: ['', 'GZIP'],
  bill_type: ['ALL', 'SUCCESS', 'REFUND'],
}
const currency = (value) =>
  `¥${(Number(value || 0) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const count = (table) => tableRows(state.snapshot, table).length
const values = (table) =>
  tableRows(state.snapshot, table).map((row) => row.value)
const latest = (table) => values(table).at(-1) ?? {}
const label = (path) => labels[path.split('.').at(-1)] ?? path
const button = (text, action, extra = '', type = '') =>
  `<button type="button" class="button ${type}" data-action="${h(action)}" ${extra}>${h(text)}</button>`
const badge = (value) =>
  `<span class="badge ${['SUCCESS', 'FINISHED', 'FINISH', 'NORMAL', 'VERIFY_SUCCESS', 'AUDIT_SUCCESS'].includes(value) || (typeof value === 'number' && value >= 200 && value < 300) ? 'success' : ['FAILED', 'FAIL', 'ABNORMAL', 'REJECTED', 'CLOSED', 'AUDIT_FAIL'].includes(value) || (typeof value === 'number' && value >= 400) ? 'danger' : 'neutral'}">${h(value || '—')}</span>`
const panel = (title, body, actions = '') =>
  `<section class="panel"><div class="panel-header"><h2>${h(title)}</h2>${actions}</div>${body}</section>`
const jsonBlock = (value) =>
  `<pre class="code">${h(typeof value === 'string' ? value : jsonText(value))}</pre>`
const empty = (text) => `<div class="empty">${h(text)}</div>`
const field = (name, title, value, options = {}) => {
  const id = options.id ?? name
  const attrs = `id="${h(id)}" name="${h(name)}" ${options.data ?? ''} ${options.required ? 'required' : ''}`
  const control =
    options.type === 'checkbox'
      ? `<label class="inline-field"><input type="checkbox" ${attrs} ${value ? 'checked' : ''}>${h(title)}</label>`
      : options.type === 'select'
        ? `<select ${attrs}>${(options.options ?? []).map((item) => `<option value="${h(typeof item === 'string' ? item : item.value)}" ${(typeof item === 'string' ? item : item.value) === value ? 'selected' : ''}>${h(typeof item === 'string' ? item || '不压缩' : item.label)}</option>`).join('')}</select>`
        : options.type === 'textarea'
          ? `<textarea ${attrs} class="json-editor" spellcheck="false" rows="${options.rows ?? 12}">${h(value)}</textarea>`
          : `<input ${attrs} type="${h(options.type ?? 'text')}" value="${h(value)}" ${options.type === 'number' ? 'step="1"' : ''} ${options.min !== undefined ? `min="${h(options.min)}"` : ''} ${options.placeholder ? `placeholder="${h(options.placeholder)}"` : ''}>`
  return `<div class="field ${options.wide ? 'wide' : ''}">${options.type === 'checkbox' ? '' : `<label for="${h(id)}">${h(title)}</label>`}${control}${options.hint ? `<small class="muted">${h(options.hint)}</small>` : ''}</div>`
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  })
  const text = await response.text()
  let body
  try {
    body = text ? JSON.parse(text) : undefined
  } catch {
    body = text
  }
  if (!response.ok)
    throw new Error(
      body?.message ?? `HTTP ${response.status} ${response.statusText}`,
    )
  return body
}
async function official(method, path, body, options = {}) {
  return request('/mock/console/request', {
    method: 'POST',
    body: JSON.stringify({
      method,
      path,
      ...(body === undefined ? {} : { body }),
      signed: options.signed ?? true,
      encryptSensitive: options.encryptSensitive ?? true,
      headers: options.headers ?? {},
    }),
  })
}
async function execute(method, path, body, options = {}) {
  if (path.startsWith('/v3/')) return official(method, path, body, options)
  const started = performance.now()
  const result = await request(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return {
    status: result === undefined ? 204 : 200,
    statusText: 'OK',
    headers: {},
    body: result === undefined ? '' : jsonText(result),
    json: result,
    duration_ms: Math.round(performance.now() - started),
    request: { method, path, body, headers: {} },
  }
}
function toast(message, error = false) {
  const region = $('#toast-region')
  const item = document.createElement('div')
  item.className = `toast ${error ? 'error' : ''}`
  item.setAttribute('role', error ? 'alert' : 'status')
  item.textContent = message
  region.append(item)
  setTimeout(() => item.remove(), error ? 10000 : 4500)
}
async function busy(element, work) {
  if (element?.disabled) return
  if (element) {
    element.disabled = true
    element.setAttribute('aria-busy', 'true')
  }
  try {
    await work()
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), true)
  } finally {
    if (element) {
      element.disabled = false
      element.removeAttribute('aria-busy')
    }
  }
}
function generatedTemplates() {
  return createTemplates(state.config, state.snapshot)
}
function setStatus(connected = true) {
  $('#status-indicator').className =
    `status-dot ${connected ? 'online' : 'offline'}`
  $('#status-label').textContent = connected
    ? `${state.config.strict ? '严格验签' : '宽松模式'} · ${state.refreshed?.toLocaleTimeString('zh-CN', { hour12: false }) ?? '已连接'}`
    : '服务连接失败'
}
async function refresh(initial = false) {
  if (state.loading) return
  state.loading = true
  $('#refresh-button').disabled = true
  try {
    const [snapshot, config, catalog, credentials] = await Promise.all([
      request('/mock/state'),
      request('/mock/config'),
      initial ? request('/mock/apis') : Promise.resolve(state.catalog),
      initial
        ? request('/mock/credentials')
        : Promise.resolve(state.credentials),
    ])
    Object.assign(state, {
      snapshot,
      config,
      catalog,
      credentials,
      refreshed: new Date(),
    })
    setStatus()
    if (initial) render()
    else if (state.view === 'overview') renderOverview()
    else if (state.view === 'records') renderRecordRows()
    else if (state.view === 'notifications') renderNotificationRows()
    else if (state.view === 'settings') renderSettingsStatus()
  } catch (error) {
    setStatus(false)
    if (initial)
      content.innerHTML = panel(
        '无法连接本地服务',
        `<p>${h(error.message)}</p><p class="muted">确认模拟服务已启动后，点击右上角“刷新”。</p>`,
      )
    throw error
  } finally {
    state.loading = false
    $('#refresh-button').disabled = false
  }
}

function navigate(view) {
  if (!viewInfo[view]) view = 'overview'
  state.view = view
  if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`)
  render()
}
function render() {
  const [title, subtitle] = viewInfo[state.view]
  $('#view-title').textContent = title
  $('#view-subtitle').textContent = subtitle
  $('#app-nav')
    .querySelectorAll('[data-view]')
    .forEach((element) => {
      const active = element.dataset.view === state.view
      element.classList.toggle('active', active)
      if (active) element.setAttribute('aria-current', 'page')
      else element.removeAttribute('aria-current')
    })
  if (!state.catalog.apis.length) {
    content.innerHTML =
      '<div class="panel loading"><span class="spinner" aria-hidden="true"></span><p>正在读取模拟服务状态…</p></div>'
    return
  }
  if (state.view === 'overview') renderOverview()
  if (state.view === 'scenarios') renderScenarios()
  if (state.view === 'workbench') renderWorkbench()
  if (state.view === 'records') renderRecords()
  if (state.view === 'notifications') renderNotifications()
  if (state.view === 'settings') renderSettings()
}

function renderOverview() {
  const orders = values('orders')
  const payments = orders.filter((order) => order.success_time)
  const notifications = values('notifications')
  const stats = [
    ['支付订单', orders.length, `${payments.length} 笔已支付`],
    [
      '累计支付金额',
      currency(payments.reduce((sum, order) => sum + order.amount.total, 0)),
      '本地测试资金 · 单位：人民币',
    ],
    [
      '退款 / 分账',
      `${count('refunds')} / ${count('profitsharing')}`,
      `${count('withdrawals')} 笔提现申请`,
    ],
    [
      '回调送达',
      `${notifications.filter((item) => item.status === 'SUCCESS').length} / ${notifications.length}`,
      `${notifications.filter((item) => item.status === 'PENDING').length} 条等待发送`,
    ],
  ]
  const accounts = values('accounts')
  const recentOrders = orders.slice(-6).reverse()
  content.innerHTML = `<div class="summary-banner"><div><span class="eyebrow">LOCAL SANDBOX</span><h2>平台收付通联调环境</h2><p>已实现 ${h(state.catalog.implemented ?? state.catalog.total ?? 0)} 个接口，所有操作实时作用于当前模拟服务。</p></div><div class="actions">${button('开始模拟测试', 'navigate', 'data-view="scenarios"', 'primary')}${button('打开 API 工作台', 'navigate', 'data-view="workbench"')}</div></div>
    <div class="stat-grid">${stats.map(([title, value, hint]) => `<div class="stat-card"><span class="muted">${h(title)}</span><strong class="metric-value">${h(value)}</strong><span class="muted">${h(hint)}</span></div>`).join('')}</div>
    <div class="grid-2">${panel('资金账户', accounts.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>商户 / 账户</th><th>可用余额</th><th>冻结余额</th></tr></thead><tbody>${accounts.map((account) => `<tr><td><strong>${h(account.mchid)}</strong><small class="muted">${h(account.account_type)}</small></td><td>${currency(account.available)}</td><td>${currency(account.frozen)}</td></tr>`).join('')}</tbody></table></div>` : empty('暂无账户'), button('设置余额', 'navigate', 'data-view="settings"', 'small'))}
    ${panel('环境信息', `<dl class="detail-list"><div><dt>服务地址</dt><dd>${h(location.origin)}</dd></div><div><dt>平台商户号</dt><dd>${h(state.config.spMchid)}</dd></div><div><dt>二级商户号</dt><dd>${h(state.config.subMchid)}</dd></div><div><dt>自动支付 / 自动完成</dt><dd>${state.config.autoPay ? '已开启' : '手动支付'} / ${state.config.autoComplete ? '已开启' : '手动推进'}</dd></div><div><dt>签名策略</dt><dd>${state.config.strict ? '严格验签，网页请求自动签名' : '宽松模式，网页请求自动签名'}</dd></div></dl><p class="callout">默认回调示例使用本地接收器；联调业务系统时，将 notify_url 改为你的服务地址。</p>`, button('配置环境', 'navigate', 'data-view="settings"', 'small'))}</div>
    ${panel('最近支付订单', recentOrders.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>订单号 / 商品</th><th>二级商户</th><th>金额</th><th>状态</th><th>操作</th></tr></thead><tbody>${recentOrders.map((order) => `<tr><td><strong>${h(order.out_trade_no)}</strong><small class="muted">${h(order.description)}</small></td><td>${h(order.sub_mchid)}</td><td>${currency(order.amount.total)}</td><td>${badge(order.trade_state)}</td><td>${button('详情', 'order-detail', `data-id="${h(order.out_trade_no)}" data-sub="${h(order.sub_mchid)}"`, 'small')}${order.trade_state === 'NOTPAY' ? button('模拟支付', 'order-pay', `data-id="${h(order.out_trade_no)}" data-sub="${h(order.sub_mchid)}"`, 'small primary') : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('还没有订单。前往模拟测试创建第一笔支付。'), button('全部数据', 'navigate', 'data-view="records"', 'small'))}`
}

function scenarioTiles() {
  const scenarios = generatedTemplates().scenarios
  const tiles = [
    [
      '普通支付',
      '创建 JSAPI、Native、H5 或 APP 订单',
      '/v3/pay/partner/transactions/native',
      '↗',
    ],
    ['合单支付', '一次支付多个子订单', '/v3/combine-transactions/native', '▦'],
    [
      '退款处理',
      '部分退款、全额退款和异常退款',
      '/v3/ecommerce/refunds/apply',
      '↶',
    ],
    [
      '分账结算',
      '平台佣金、解冻与分账回退',
      '/v3/ecommerce/profitsharing/orders',
      '⇄',
    ],
    [
      '商户提现',
      '二级商户、平台与日终提现',
      '/v3/ecommerce/fund/withdraw',
      '↓',
    ],
    ['商户进件', '提交资料并模拟审核、签约', '/v3/ecommerce/applyments', '◎'],
    ['平台补差', '优惠补差、回退和取消', '/v3/ecommerce/subsidies/create', '+'],
    ['跨境付款', '资金出境及购付汇账单', '/v3/funds-to-oversea/orders', '↗'],
    ['账单下载', '申请账单、获取下载地址', '/v3/bill/tradebill', '≡'],
  ]
  return `<div class="scenario-grid">${tiles
    .map(([title, description, path, icon]) => {
      const scenario = scenarios.find(
        (item) =>
          item.path === path &&
          (path.includes('/orders') ? item.method === 'POST' : true),
      )
      return `<button type="button" class="scenario-card" data-action="scenario-select" data-id="${h(scenario?.id ?? '')}"><span class="scenario-icon">${h(icon)}</span><strong>${h(title)}</strong><span>${h(description)}</span></button>`
    })
    .join('')}</div>`
}
function renderScenarios() {
  const { scenarios, actions } = generatedTemplates()
  content.innerHTML = `<div class="callout">金额使用“分”。场景示例默认填入测试商户和最近的关联单据；每次“加载新示例”都会生成新的业务单号。</div>
    ${panel('完整业务链路', `<p class="muted">创建 10 元分账订单 → 支付 → 分账 1 元并解冻 → 退款 2 元 → 提现 2 元 → 申请并下载账单。只新增本次测试记录。</p><div class="actions">${button(state.flow.running ? '执行中…' : '一键运行交易链路', 'flow-start', state.flow.running ? 'disabled' : '', 'primary')}${button('停止后续步骤', 'flow-stop', state.flow.running ? '' : 'disabled')}<span id="flow-summary" class="muted">${h(state.flow.result ?? '')}</span></div><div id="flow-results" class="timeline">${flowMarkup()}</div>`)}
    ${panel('异常与幂等测试', `<p class="muted">发送预设错误请求，检查 HTTP 状态和微信错误代码。幂等冲突测试会新增一笔订单，再重复相同单号发送不同金额。</p><div class="actions">${button('缺少必填参数', 'negative-test', 'data-test="missing"')}${button('错误签名', 'negative-test', 'data-test="signature"')}${button('余额不足提现', 'negative-test', 'data-test="balance"')}${button('重复单号参数冲突', 'negative-test', 'data-test="idempotency"')}</div><div id="negative-response"></div>`)}
    ${scenarioTiles()}
    ${panel('业务场景与状态模拟', `<div class="form-grid">${field('scenario-picker', '选择业务接口', state.scenario ?? '', { type: 'select', options: [{ value: '', label: '选择一个业务场景…' }, ...scenarios.map((item) => ({ value: item.id, label: `${item.category} · ${item.label}` }))] })}${field('action-picker', '模拟状态流转', '', { type: 'select', options: [{ value: '', label: '选择控制动作…' }, ...actions.map((item) => ({ value: item.key ?? item.id, label: item.label }))] })}</div><div id="scenario-editor"></div>`)}
    ${panel(
      '真实文件上传',
      `<p class="muted">上传图片或注销材料，代理自动计算 SHA256 并使用测试商户签名。</p><form id="upload-form"><div class="form-grid">${field(
        'upload-path',
        '上传接口',
        '/v3/merchant/media/upload',
        {
          type: 'select',
          options: [
            { value: '/v3/merchant/media/upload', label: '商户资料图片' },
            {
              value: '/v3/ecommerce/account/cancel-applications/media',
              label: '注销申请材料',
            },
          ],
        },
      )}<div class="field"><label for="upload-file">选择本地文件</label><input id="upload-file" name="file" type="file" required></div></div><div class="actions"><button class="button" type="submit">上传文件</button></div></form><div id="upload-response"></div>`,
    )}
    <div id="scenario-response"></div>`
  if (state.scenario) renderScenarioEditor()
  if (responses.has('scenario'))
    showResponse('#scenario-response', responses.get('scenario'), 'scenario')
  if (responses.has('upload'))
    showResponse('#upload-response', responses.get('upload'), 'upload')
  if (responses.has('negative'))
    showResponse('#negative-response', responses.get('negative'), 'negative')
}
function selectScenario(id) {
  if (!id) return
  state.scenario = id
  if (state.view !== 'scenarios') navigate('scenarios')
  else {
    $('#scenario-picker').value = id
    renderScenarioEditor()
  }
  $('#scenario-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function getScenario(id = state.scenario) {
  return generatedTemplates().scenarios.find((item) => item.id === id)
}
function scenarioDraft(reset = false) {
  if (!reset && state.drafts.has(state.scenario))
    return state.drafts.get(state.scenario)
  const definition = getScenario()
  if (!definition) return null
  const draft = {
    ...structuredClone(definition),
    bodyText: jsonText(definition.body ?? {}),
    queryText: jsonText(definition.query ?? {}),
    paths: definition.pathValues ?? {},
    signed: true,
    encryptSensitive: true,
  }
  state.drafts.set(state.scenario, draft)
  return draft
}
function renderObjectFields(object, prefix, max = 24) {
  return leafFields(object)
    .filter((item) => item.type !== 'json')
    .slice(0, max)
    .map((item, index) =>
      field(
        item.path,
        `${label(item.path)}${item.path.includes('.') ? ` · ${item.path}` : ''}`,
        item.value,
        {
          id: `${prefix}-${index}`,
          type: item.type,
          data: `data-draft-field="${h(item.path)}" data-source="${h(prefix)}"`,
          min: item.type === 'number' ? 0 : undefined,
        },
      ),
    )
    .join('')
}
function renderScenarioEditor() {
  const draft = scenarioDraft()
  const target = $('#scenario-editor')
  if (!draft) {
    target.innerHTML = ''
    return
  }
  try {
    draft.body = parseObject(draft.bodyText)
    draft.query = parseObject(draft.queryText)
  } catch {
    /* 尚未完成的 JSON 草稿仍保留。 */
  }
  target.innerHTML = `<div class="scenario-editor"><div class="panel-header"><div><h3>${h(draft.label)}</h3><p class="muted">${h(draft.description)}</p></div>${button('加载新示例', 'scenario-reload', '', 'small')}</div>
    <form id="scenario-form"><div class="form-grid">${field('scenario-path', `${draft.method} 请求路径`, draft.path, { wide: true, required: true })}${renderObjectFields(draft.body ?? {}, 'scenario-body')}${renderObjectFields(draft.query ?? {}, 'scenario-query')}</div>
    <details class="advanced"><summary>高级 JSON 参数（数组及所有字段）</summary><div class="grid-2">${field('scenario-body-json', '请求体 JSON', draft.bodyText, { type: 'textarea', rows: 16 })}${field('scenario-query-json', '查询参数 JSON', draft.queryText, { type: 'textarea', rows: 16 })}</div></details>
    <div class="actions"><button type="submit" class="button primary">发送 ${h(draft.method)} 请求</button>${button('转到 API 工作台', 'scenario-workbench')}${button('复制请求 JSON', 'scenario-copy')}<span class="muted">自动签名 · 敏感字段自动加密</span></div></form></div>`
}
function readScenario() {
  const draft = scenarioDraft()
  if (!draft) throw new Error('请先选择业务场景')
  draft.path = $('#scenario-path').value.trim()
  const body = parseObject(draft.bodyText, '请求体 JSON')
  const query = parseObject(draft.queryText, '查询参数 JSON')
  return {
    method: draft.method,
    path: buildPath(draft.path, draft.paths, query),
    body: ['GET', 'DELETE'].includes(draft.method) ? undefined : body,
  }
}
function responseMarkup(response, prefix) {
  const ok = response.status >= 200 && response.status < 300
  const data =
    response.json ??
    (response.body_encoding === 'base64'
      ? `二进制文件 · Base64 编码 · ${response.body.length} 字符`
      : response.body)
  const downloadUrl = response.json?.download_url
  return `<section class="panel response"><div class="panel-header"><h2>请求结果 <span class="badge ${ok ? 'success' : 'danger'}">HTTP ${h(response.status)}</span></h2><span class="muted">${h(response.duration_ms ?? 0)} ms · ${h(response.statusText ?? '')}</span></div>
    <p class="request-line"><span class="pill">${h(response.request?.method ?? '')}</span> <code>${h(response.request?.path ?? '')}</code></p>
    <div class="actions">${button('复制响应', 'response-copy', `data-prefix="${h(prefix)}"`, 'small')}${response.body_encoding === 'base64' || response.headers?.['content-disposition'] ? button('下载响应文件', 'response-download', `data-prefix="${h(prefix)}"`, 'small') : ''}${downloadUrl ? button('下载账单', 'bill-download', `data-url="${h(downloadUrl)}" data-prefix="${h(prefix)}"`, 'small primary') : ''}</div>
    ${jsonBlock(data)}<details><summary>响应头 / 实际请求</summary><div class="grid-2">${jsonBlock(response.headers)}${jsonBlock(response.request)}</div></details></section>`
}
const responses = new Map()
function showResponse(target, response, prefix) {
  responses.set(prefix, response)
  const element = $(target)
  if (element) element.innerHTML = responseMarkup(response, prefix)
  state.lastResponse = response
}
function assertSuccess(response) {
  if (response.status >= 400)
    throw new Error(response.json?.message ?? `HTTP ${response.status}`)
  return response.json
}

async function negativeTest(test) {
  if (test === 'signature' && !state.config.strict)
    throw new Error(
      '错误签名测试需要先在“联调设置”开启严格验签，然后回到此处执行。',
    )
  const native = generatedTemplates().scenarios.find(
    (item) => item.id === 'pay-native',
  )
  const cases = {
    missing: {
      title: '缺少必填参数',
      method: 'POST',
      path: '/v3/pay/partner/transactions/native',
      body: {},
    },
    signature: {
      title: '未携带商户签名',
      method: 'POST',
      path: native.path,
      body: native.body,
      signed: false,
    },
    balance: {
      title: '提现金额超过可用余额',
      method: 'POST',
      path: '/v3/ecommerce/fund/withdraw',
      body: {
        sub_mchid: state.config.subMchid,
        out_request_no: `FAIL${Date.now()}`,
        amount:
          (values('accounts').find(
            (account) =>
              account.mchid === state.config.subMchid &&
              account.account_type === 'BASIC',
          )?.available ?? 0) + 1,
        notify_url: `${location.origin}/mock/receiver`,
      },
    },
    idempotency: {
      title: '同一订单号重复提交不同金额',
      method: 'POST',
      path: native.path,
      body: native.body,
    },
  }
  const input = cases[test]
  if (!input) return
  if (test === 'idempotency') {
    const initial = await official(input.method, input.path, input.body)
    showResponse('#negative-response', initial, 'negative-initial')
    assertSuccess(initial)
    input.body = {
      ...input.body,
      amount: { ...input.body.amount, total: input.body.amount.total + 1 },
    }
  }
  const response = await official(input.method, input.path, input.body, {
    signed: input.signed,
  })
  showResponse('#negative-response', response, 'negative')
  $('#negative-response')?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
  if (response.status >= 400)
    toast(
      `${input.title}：已收到预期错误 HTTP ${response.status} · ${response.json?.code ?? ''}`,
    )
  else toast('服务返回成功，未出现预期错误。请查看请求结果和运行设置。', true)
  await refresh()
}

function flowMarkup() {
  return state.flow.steps
    .map(
      (step, index) =>
        `<details class="flow-step" ${step.status === 'error' ? 'open' : ''}><summary><span class="step-number">${index + 1}</span><strong>${h(step.title)}</strong><span class="badge ${step.status === 'done' ? 'success' : step.status === 'error' ? 'danger' : 'neutral'}">${step.status === 'done' ? '完成' : step.status === 'error' ? '失败' : '执行中'}</span>${step.response ? `<span class="muted">HTTP ${h(step.response.status)} · ${h(step.response.duration_ms)} ms</span>` : ''}</summary>${step.response ? jsonBlock(step.response.json ?? (step.response.body_encoding === 'base64' ? '账单文件已下载' : step.response.body)) : ''}${step.error ? `<p class="callout error">${h(step.error)}</p>` : ''}</details>`,
    )
    .join('')
}
function updateFlow() {
  if ($('#flow-results')) $('#flow-results').innerHTML = flowMarkup()
  if ($('#flow-summary'))
    $('#flow-summary').textContent = state.flow.result ?? ''
  const start = $('[data-action="flow-start"]')
  const stop = $('[data-action="flow-stop"]')
  if (start) {
    start.disabled = state.flow.running
    start.textContent = state.flow.running ? '执行中…' : '一键运行交易链路'
  }
  if (stop) stop.disabled = !state.flow.running
}
async function runFlow() {
  if (state.flow.running) return
  Object.assign(state.flow, {
    running: true,
    stopped: false,
    steps: [],
    result: '正在执行…',
  })
  updateFlow()
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`
  const sub = state.config.subMchid,
    sp = state.config.spMchid,
    appid = state.config.spAppid
  const notify = `${location.origin}/mock/receiver`,
    outTradeNo = `UI${suffix}`,
    shareNo = `S${suffix}`
  let order, refund, withdrawal, bill, startingBalance, endingBalance
  const step = async (title, method, path, body, callback) => {
    if (state.flow.stopped)
      throw new Error('已停止后续步骤，已完成的记录已保留')
    const item = { title, status: 'running' }
    state.flow.steps.push(item)
    updateFlow()
    try {
      item.response = await execute(method, path, body)
      const result = assertSuccess(item.response)
      if (callback) await callback(result, item.response)
      item.status = 'done'
      updateFlow()
      return result
    } catch (error) {
      item.status = 'error'
      item.error = error.message
      updateFlow()
      throw error
    }
  }
  try {
    const balancePath = buildPath(
      '/v3/ecommerce/fund/balance/{sub_mchid}',
      { sub_mchid: sub },
      { account_type: 'BASIC' },
    )
    startingBalance = await step('读取测试前的资金余额', 'GET', balancePath)
    await step(
      '创建 Native 支付订单',
      'POST',
      '/v3/pay/partner/transactions/native',
      {
        sp_mchid: sp,
        sp_appid: appid,
        sub_mchid: sub,
        out_trade_no: outTradeNo,
        description: '网页全链路测试商品',
        notify_url: notify,
        amount: { total: 1000, currency: 'CNY' },
        settle_info: { profit_sharing: true },
      },
    )
    order = await step('模拟买家支付成功', 'POST', '/mock/actions/pay', {
      sub_mchid: sub,
      out_trade_no: outTradeNo,
    })
    await step(
      '分账 100 分并解冻剩余金额',
      'POST',
      '/v3/ecommerce/profitsharing/orders',
      {
        sub_mchid: sub,
        transaction_id: order.transaction_id,
        out_order_no: shareNo,
        finish: true,
        receivers: [
          {
            type: 'MERCHANT_ID',
            receiver_account: sp,
            receiver_name: '联调测试平台',
            amount: 100,
            description: '平台佣金',
          },
        ],
      },
    )
    await step('确认分账完成', 'POST', '/mock/actions/complete-profitsharing', {
      sub_mchid: sub,
      out_order_no: shareNo,
    })
    refund = await step(
      '申请部分退款 200 分',
      'POST',
      '/v3/ecommerce/refunds/apply',
      {
        sub_mchid: sub,
        sp_appid: appid,
        out_trade_no: outTradeNo,
        out_refund_no: `R${suffix}`,
        notify_url: notify,
        amount: { total: 1000, refund: 200, currency: 'CNY' },
      },
    )
    await step('确认退款成功', 'POST', '/mock/actions/complete-refund', {
      sub_mchid: sub,
      refund_id: refund.refund_id,
      status: 'SUCCESS',
    })
    withdrawal = await step(
      '申请提现 200 分',
      'POST',
      '/v3/ecommerce/fund/withdraw',
      {
        sub_mchid: sub,
        out_request_no: `W${suffix}`,
        amount: 200,
        notify_url: notify,
      },
    )
    await step('确认提现成功', 'POST', '/mock/actions/complete-withdrawal', {
      withdraw_id: withdrawal.withdraw_id,
      status: 'SUCCESS',
    })
    endingBalance = await step(
      '核对资金余额守恒',
      'GET',
      balancePath,
      undefined,
      (result) => {
        if (
          Number(result.available_amount) !==
            Number(startingBalance.available_amount) + 500 ||
          Number(result.pending_amount) !==
            Number(startingBalance.pending_amount)
        ) {
          throw new Error(
            `余额校验失败：预期可用余额 ${Number(startingBalance.available_amount) + 500} 分、冻结余额 ${startingBalance.pending_amount} 分；实际可用 ${result.available_amount} 分、冻结 ${result.pending_amount} 分。请检查其他并发模拟操作。`,
          )
        }
      },
    )
    bill = await step(
      '申请交易账单',
      'GET',
      buildPath(
        '/v3/bill/tradebill',
        {},
        {
          bill_date: localDate(),
          sub_mchid: sub,
          bill_type: 'ALL',
          tar_type: 'GZIP',
        },
      ),
    )
    const url = new URL(bill.download_url, location.origin)
    await step(
      '下载 GZIP 账单',
      'GET',
      `${url.pathname}${url.search}`,
      undefined,
      (_data, response) => downloadResponse(response),
    )
    state.flow.result = `交易链路全部完成，余额校验通过：可用余额 ${currency(startingBalance.available_amount)} → ${currency(endingBalance.available_amount)}，冻结余额 ${currency(endingBalance.pending_amount)}。`
    toast('完整交易链路已完成，账单已下载')
  } catch (error) {
    state.flow.result = error.message
    toast(error.message, !state.flow.stopped)
  } finally {
    state.flow.running = false
    updateFlow()
    await refresh()
  }
}

function contractTitle(contract) {
  const document = contract.documents?.[0] ?? ''
  return (
    document.split('/').at(-1)?.replace(/^\d+-/, '').replace(/\.md$/, '') ||
    contract.path
  )
}
function contractGroup(contract) {
  return (contract.documents?.[0]?.split('/')[1] ?? '其他').replace(/^\d+-/, '')
}
function defaultValue(name, type = '') {
  const order = latest('orders'),
    refund = latest('refunds'),
    sharing = latest('profitsharing'),
    withdrawal = latest('withdrawals')
  const samples = {
    sp_mchid: state.config.spMchid,
    combine_mchid: state.config.spMchid,
    mchid: state.config.spMchid,
    sp_appid: state.config.spAppid,
    appid: state.config.spAppid,
    combine_appid: state.config.spAppid,
    sub_mchid: state.config.subMchid,
    merchant_code: state.config.subMchid,
    transaction_id: order.transaction_id || 'MOCK_TRANSACTION_ID',
    out_trade_no: order.out_trade_no || `UI${Date.now()}`,
    refund_id: refund.refund_id || 'MOCK_REFUND_ID',
    out_refund_no: refund.out_refund_no || `R${Date.now()}`,
    out_order_no: sharing.out_order_no || `S${Date.now()}`,
    order_id: sharing.order_id || 'MOCK_SHARING_ID',
    withdraw_id: withdrawal.withdraw_id || 'MOCK_WITHDRAW_ID',
    out_request_no: withdrawal.out_request_no || `A${Date.now()}`,
    combine_out_trade_no:
      latest('combines').combine_out_trade_no || `C${Date.now()}`,
    applyment_id:
      latest('applyments').applyment_id ||
      latest('cancelWithdraws').applyment_id ||
      'MOCK_APPLYMENT_ID',
    apply_id: latest('subjectAlterations').apply_id || 'MOCK_APPLY_ID',
    application_no:
      latest('settlementApplications').application_no || 'MOCK_APPLICATION_NO',
    account_type: 'BASIC',
    bill_type: 'ALL',
    currency: 'CNY',
    bill_date: localDate(),
    date: localDate(),
    notify_url: `${location.origin}/mock/receiver`,
    description: '网页联调测试',
    total: 1000,
    amount: 100,
    token: latest('bills').token || 'MOCK_BILL_TOKEN',
    organization_type: 'SUBJECT_TYPE_ENTERPRISE',
    cert_number: latest('merchants').cert_number || '91440300MA5MOCK001',
    out_order_id: latest('overseas').out_order_id || `O${Date.now()}`,
    out_apply_no:
      latest('legacyCancellations').out_apply_no || `A${Date.now()}`,
  }
  if (Object.hasOwn(samples, name)) return samples[name]
  if (/integer|number/.test(type)) return 1
  if (/boolean/.test(type)) return true
  if (type.startsWith('array')) return [{}]
  if (type === 'object') return {}
  return `MOCK_${name.toUpperCase()}`
}
function genericBody(contract) {
  const result = {}
  for (const definition of contract.fields.body.filter(
    (item) => item.required,
  )) {
    const names = definition.name.split('.')
    let target = result
    for (const [index, name] of names.entries()) {
      if (index === names.length - 1) {
        if (target[name] === undefined)
          target[name] = defaultValue(name, definition.type)
        break
      }
      const ancestor = contract.fields.body.find(
        (item) => item.name === names.slice(0, index + 1).join('.'),
      )
      if (!target[name])
        target[name] = ancestor?.type.startsWith('array') ? [{}] : {}
      target = Array.isArray(target[name]) ? target[name][0] : target[name]
    }
  }
  return result
}
function selectContract(index, fromScenario) {
  const contract = state.catalog.apis[index]
  if (!contract) return
  const sample =
    fromScenario ??
    generatedTemplates().scenarios.find(
      (item) =>
        item.method === contract.method &&
        (item.path === contract.path ||
          matchContract(contract.path, item.path)),
    )
  const paths = Object.fromEntries(
    contract.fields.path.map((definition) => [
      definition.name,
      defaultValue(definition.name, definition.type),
    ]),
  )
  if (sample?.path && !sample.path.includes('{')) {
    const templateParts = contract.path.split('/'),
      actualParts = sample.path.split('?')[0].split('/')
    templateParts.forEach((part, partIndex) => {
      if (/^\{.+\}$/.test(part) && actualParts[partIndex])
        paths[part.slice(1, -1)] = decodeURIComponent(actualParts[partIndex])
    })
  }
  const query =
    sample?.query ??
    Object.fromEntries(
      contract.fields.query
        .filter((item) => item.required)
        .map((item) => [item.name, defaultValue(item.name, item.type)]),
    )
  state.workbench = {
    index,
    method: contract.method,
    path: contract.path,
    paths,
    queryText: jsonText(query),
    bodyText: jsonText(sample?.body ?? genericBody(contract)),
    headersText: '{}',
    signed: true,
    encryptSensitive: true,
  }
  if (state.view !== 'workbench') navigate('workbench')
  else renderWorkbenchDetail()
  renderApiList()
}
function renderWorkbench() {
  const groups = [...new Set(state.catalog.apis.map(contractGroup))]
  content.innerHTML = `<div class="split-panel"><aside class="panel api-catalog"><div class="panel-header"><h2>接口目录 <span class="badge">${h(state.catalog.apis.length)}</span></h2></div>
    <div class="catalog-filters">${field('api-search', '搜索接口', state.apiFilter, { placeholder: '接口名称、路径或方法' })}${field('api-group', '业务分类', state.apiGroup, { type: 'select', options: [{ value: '', label: '全部分类' }, ...groups] })}</div><div id="api-list" class="api-list"></div></aside>
    <div id="workbench-detail"></div></div>`
  if (!state.workbench) {
    const index = state.catalog.apis.findIndex(
      (item) => item.path === '/v3/pay/partner/transactions/native',
    )
    selectContract(index < 0 ? 0 : index)
  } else {
    renderApiList()
    renderWorkbenchDetail()
  }
}
function renderApiList() {
  const target = $('#api-list')
  if (!target) return
  const filter = state.apiFilter.toLowerCase()
  const contracts = state.catalog.apis
    .map((contract, index) => ({ contract, index }))
    .filter(
      ({ contract }) =>
        (!state.apiGroup || contractGroup(contract) === state.apiGroup) &&
        `${contractTitle(contract)} ${contract.method} ${contract.path}`
          .toLowerCase()
          .includes(filter),
    )
  target.innerHTML = contracts.length
    ? contracts
        .map(
          ({ contract, index }) =>
            `<button type="button" class="api-item ${state.workbench?.index === index ? 'active' : ''}" data-action="contract-select" data-index="${index}"><span class="api-title"><span class="method method-${h(contract.method.toLowerCase())}">${h(contract.method)}</span><strong>${h(contractTitle(contract))}</strong></span><code>${h(contract.path)}</code></button>`,
        )
        .join('')
    : empty('没有匹配的接口')
}
function renderWorkbenchDetail() {
  const draft = state.workbench,
    contract = state.catalog.apis[draft?.index]
  const target = $('#workbench-detail')
  if (!contract || !target) return
  const upload =
    contract.path.endsWith('/media/upload') ||
    contract.path.endsWith('/cancel-applications/media')
  target.innerHTML =
    panel(
      contractTitle(contract),
      `<p class="muted">${h(contractGroup(contract))} · ${contract.requiresSerial ? '要求平台证书序列号 · ' : ''}${contract.implemented ? '已实现' : '未实现'}</p>
    <form id="workbench-form"><div class="form-grid">${field('wb-method', '请求方法', draft.method, { type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] })}${field('wb-path', '接口路径', draft.path, { required: true })}
    ${contract.fields.path.map((definition, index) => field(definition.name, `${label(definition.name)} *`, draft.paths[definition.name], { id: `wb-path-${index}`, required: true, data: `data-path-field="${h(definition.name)}"` })).join('')}</div>
    <div class="grid-2">${field('wb-query', '查询参数 JSON', draft.queryText, { type: 'textarea', rows: 8 })}${field('wb-body', '请求体 JSON', draft.bodyText, { type: 'textarea', rows: 16 })}</div>
    <details><summary>签名、加密与自定义请求头</summary><div class="form-grid">${field('wb-signed', '自动生成 APIv3 商户签名', draft.signed, { type: 'checkbox' })}${field('wb-encrypt', '自动加密敏感字段', draft.encryptSensitive, { type: 'checkbox' })}${field('wb-headers', '额外请求头 JSON', draft.headersText, { type: 'textarea', rows: 4, wide: true })}</div><p class="muted">使用服务端保存的测试密钥。关闭自动签名可验证严格模式下的签名错误。</p></details>
    ${upload ? `<p class="callout">这个接口使用 multipart 文件上传。选择本地文件时优先上传该文件；不选文件时发送 JSON 中的内置样例。</p><div class="field"><label for="wb-file">选择文件</label><input id="wb-file" type="file"></div>` : ''}
    <div class="actions"><button type="submit" class="button primary">${upload ? '上传文件' : '发送请求'}</button>${button('加载新示例', 'workbench-reload')}${button('复制 curl', 'workbench-curl')}${button('复制请求 JSON', 'workbench-copy')}</div></form>
    <details class="contract-details"><summary>文档参数说明 · ${contract.fields.body.length + contract.fields.query.length + contract.fields.path.length} 个字段</summary>${[
      'path',
      'query',
      'body',
    ]
      .filter((source) => contract.fields[source].length)
      .map(
        (source) =>
          `<h3>${h({ path: '路径参数', query: '查询参数', body: '请求体参数' }[source])}</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>字段</th><th>类型</th><th>要求</th></tr></thead><tbody>${contract.fields[source].map((item) => `<tr><td><code>${h(item.name)}</code></td><td>${h(item.type)}</td><td>${item.required ? '<span class="badge danger">必填</span>' : '<span class="muted">可选</span>'}${item.sensitive ? ' <span class="badge">敏感</span>' : ''}</td></tr>`).join('')}</tbody></table></div>`,
      )
      .join(
        '',
      )}<p class="muted">来源：${contract.documents.map(h).join('<br>')}</p></details>`,
      `<span class="method method-${h(contract.method.toLowerCase())}">${h(contract.method)}</span>`,
    ) + '<div id="workbench-response"></div>'
  if (responses.has('workbench'))
    showResponse('#workbench-response', responses.get('workbench'), 'workbench')
}
function readWorkbench() {
  const draft = state.workbench
  if (!draft) throw new Error('请选择接口')
  draft.method = $('#wb-method').value
  draft.path = $('#wb-path').value.trim()
  draft.queryText = $('#wb-query').value
  draft.bodyText = $('#wb-body').value
  draft.headersText = $('#wb-headers').value
  draft.signed = $('#wb-signed').checked
  draft.encryptSensitive = $('#wb-encrypt').checked
  $('[id="workbench-form"]')
    .querySelectorAll('[data-path-field]')
    .forEach((input) => {
      draft.paths[input.dataset.pathField] = input.value
    })
  const query = parseObject(draft.queryText, '查询参数 JSON'),
    body = parseObject(draft.bodyText, '请求体 JSON'),
    headers = parseObject(draft.headersText, '请求头 JSON')
  return {
    method: draft.method,
    path: buildPath(draft.path, draft.paths, query),
    body: ['GET', 'DELETE'].includes(draft.method) ? undefined : body,
    signed: draft.signed,
    encryptSensitive: draft.encryptSensitive,
    headers,
  }
}

function renderRecords() {
  const tables = [
    ...new Set([...Object.keys(tableNames), ...Object.keys(state.snapshot)]),
  ].filter(
    (name) =>
      ![
        'meta',
        'idempotency',
        'dayend_balances',
        'console_ciphertexts',
      ].includes(name),
  )
  content.innerHTML = panel(
    '业务记录',
    `<div class="record-toolbar">${field('record-table', '数据类型', state.table, { type: 'select', options: tables.map((name) => ({ value: name, label: `${tableNames[name] ?? name} (${count(name)})` })) })}${field('record-search', '搜索当前数据', state.recordFilter, { placeholder: '单号、商户号、状态或任意内容' })}<div class="actions">${button('导出当前数据', 'record-export')}</div></div><div id="record-rows"></div>`,
  )
  renderRecordRows()
}
function rowSummary(value, key) {
  if (!value || typeof value !== 'object')
    return {
      id: key,
      description: String(value),
      merchant: '—',
      amount: '—',
      status: '—',
      time: '—',
    }
  const id =
    value.out_trade_no ||
    value.combine_out_trade_no ||
    value.out_refund_no ||
    value.out_order_no ||
    value.out_order_id ||
    value.out_request_no ||
    value.out_apply_no ||
    value.sub_mchid ||
    value.mchid ||
    value.id ||
    key
  const money =
    (value.refund_id ? value.amount?.refund : value.amount?.total) ??
    (typeof value.amount === 'number' ? value.amount : undefined) ??
    (Array.isArray(value.receivers)
      ? value.receivers.reduce(
          (sum, receiver) => sum + Number(receiver.amount ?? 0),
          0,
        )
      : undefined) ??
    value.available
  const combine = value.order_keys ? combineSummary(value) : null
  return {
    id,
    description:
      value.description ||
      value.merchant_shortname ||
      (value.method && `${value.method} ${value.path}`) ||
      value.account_type ||
      value.event_type ||
      '',
    merchant:
      value.sub_mchid ||
      value.sp_mchid ||
      value.mchid ||
      value.combine_mchid ||
      '—',
    amount: combine
      ? currency(combine.amount)
      : money === undefined
        ? '—'
        : currency(money),
    status:
      combine?.status ||
      value.trade_state ||
      value.applyment_state ||
      value.cancel_state ||
      value.merchant_state ||
      value.status ||
      value.result ||
      value.state ||
      value.verify_result ||
      '—',
    time:
      value.create_time ||
      value.created_at ||
      value.update_time ||
      value.time ||
      value.timestamp ||
      value.success_time ||
      '—',
  }
}
function combineSummary(combine) {
  const orders = (combine.order_keys ?? [])
    .map((key) => state.snapshot.orders?.[key])
    .filter(Boolean)
  let status = 'NOTPAY'
  if (!orders.length) status = 'UNKNOWN'
  else if (orders.every((order) => order.trade_state === 'CLOSED'))
    status = 'CLOSED'
  else if (
    orders.every((order) => ['SUCCESS', 'REFUND'].includes(order.trade_state))
  )
    status = orders.some((order) => order.trade_state === 'REFUND')
      ? 'REFUND'
      : 'SUCCESS'
  else if (orders.some((order) => order.success_time)) status = 'PARTIAL'
  return {
    status,
    amount: orders.reduce((sum, order) => sum + order.amount.total, 0),
  }
}
function recordActions(table, value, key) {
  const attributes = `data-table="${h(table)}" data-key="${h(key)}"`
  let result = button('详情', 'record-detail', attributes, 'small')
  if (table === 'orders') {
    if (value.trade_state === 'NOTPAY')
      result += button(
        '支付',
        'record-operate',
        `${attributes} data-operation="pay"`,
        'small primary',
      )
    if (value.success_time)
      result += button(
        '退款',
        'record-operate',
        `${attributes} data-operation="refund"`,
        'small',
      )
    if (
      value.success_time &&
      value.settle_info?.profit_sharing &&
      !value.sharing_finished
    )
      result += button(
        '分账',
        'record-operate',
        `${attributes} data-operation="share"`,
        'small',
      )
  }
  if (table === 'combines' && combineSummary(value).status === 'NOTPAY')
    result += button(
      '支付',
      'record-operate',
      `${attributes} data-operation="combine-pay"`,
      'small primary',
    )
  if (table === 'refunds' && ['PROCESSING', 'ABNORMAL'].includes(value.status))
    result += button(
      '模拟结果',
      'record-operate',
      `${attributes} data-operation="complete-refund"`,
      'small',
    )
  if (table === 'profitsharing' && value.status === 'PROCESSING')
    result += button(
      '完成分账',
      'record-operate',
      `${attributes} data-operation="complete-profitsharing"`,
      'small',
    )
  if (table === 'withdrawals')
    result += button(
      '模拟结果',
      'record-operate',
      `${attributes} data-operation="complete-withdrawal"`,
      'small',
    )
  if (table === 'applyments')
    result += button(
      '审核 / 签约',
      'record-operate',
      `${attributes} data-operation="applyment"`,
      'small',
    )
  if (table === 'merchants')
    result += button(
      '修改测试商户',
      'record-operate',
      `${attributes} data-operation="merchant"`,
      'small',
    )
  if (table === 'accounts')
    result += button(
      '设置余额',
      'record-operate',
      `${attributes} data-operation="account"`,
      'small',
    )
  const operations = {
    settlementApplications: 'settlement',
    cancelWithdraws: 'cancel-withdraw',
    legacyCancellations: 'cancel',
    riskWithdrawals: 'cancel-withdrawal',
    subjectAlterations: 'subject-alter',
    overseas: 'complete-overseas',
  }
  if (operations[table])
    result += button(
      '模拟状态',
      'record-operate',
      `${attributes} data-operation="${operations[table]}"`,
      'small',
    )
  return result
}
function renderRecordRows() {
  const target = $('#record-rows')
  if (!target) return
  const filter = state.recordFilter.toLowerCase()
  const rows = tableRows(state.snapshot, state.table)
    .filter((row) =>
      `${row.key} ${JSON.stringify(row.value)}`.toLowerCase().includes(filter),
    )
    .reverse()
  target.innerHTML =
    `<p class="muted">${h(tableNames[state.table] ?? state.table)} · ${rows.length} 条记录${rows.length > 200 ? '，显示最近 200 条，导出可获取全部' : ''}</p>` +
    (rows.length
      ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>标识 / 描述</th><th>商户</th><th>金额 / 可用余额</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>${rows
          .slice(0, 200)
          .map(({ key, value }) => {
            const summary = rowSummary(value, key)
            return `<tr><td><strong>${h(summary.id)}</strong><small class="muted">${h(summary.description)}</small></td><td>${h(summary.merchant)}</td><td>${h(summary.amount)}</td><td>${badge(summary.status)}</td><td class="time-cell">${h(summary.time)}</td><td class="table-actions">${recordActions(state.table, value, key)}</td></tr>`
          })
          .join('')}</tbody></table></div>`
      : empty('当前数据类型还没有记录，或搜索条件没有匹配结果'))
}
function operationDefinition(operation, value) {
  const sub = value.sub_mchid || state.config.subMchid
  const timestamp = `${Date.now()}${Math.floor(Math.random() * 100)}`
  const controls = {
    pay: { sub_mchid: sub, out_trade_no: value.out_trade_no },
    'combine-pay': { combine_out_trade_no: value.combine_out_trade_no },
    'complete-refund': {
      sub_mchid: sub,
      refund_id: value.refund_id,
      status: 'SUCCESS',
    },
    'complete-profitsharing': {
      sub_mchid: sub,
      out_order_no: value.out_order_no,
      success: true,
    },
    'complete-withdrawal': {
      withdraw_id: value.withdraw_id,
      status: 'SUCCESS',
      reason: '',
    },
    applyment: {
      applyment_id: value.applyment_id,
      state: 'FINISH',
      reason: '',
    },
    settlement: {
      sub_mchid: sub,
      application_no: value.application_no,
      state: 'AUDIT_SUCCESS',
    },
    'cancel-withdraw': {
      applyment_id: value.applyment_id,
      state: 'FINISH',
      reason: '',
    },
    cancel: {
      out_apply_no: value.out_apply_no,
      state: 'CANCEL_SUCCESS',
      reason: '',
    },
    'cancel-withdrawal': {
      applyment_id: value.applyment_id,
      state: 'PAY_SUCCEED',
      reason: '',
    },
    'subject-alter': {
      apply_id: value.apply_id,
      state: 'APPLYMENT_STATE_FINISHED',
      reason: '',
    },
    'complete-overseas': {
      sub_mchid: sub,
      out_order_id: value.out_order_id,
      success: true,
    },
    merchant: {
      sub_mchid: sub,
      merchant_state: value.merchant_state,
      organization_type: value.organization_type,
      cert_number: value.cert_number,
      merchant_shortname: value.merchant_shortname,
    },
  }
  if (operation === 'account')
    return {
      label: '设置资金账户余额',
      method: 'POST',
      path: '/mock/accounts',
      body: {
        mchid: value.mchid,
        account_type: value.account_type,
        available: value.available,
        frozen: value.frozen,
      },
    }
  if (operation === 'refund')
    return {
      label: '申请退款',
      method: 'POST',
      path: '/v3/ecommerce/refunds/apply',
      body: {
        sub_mchid: sub,
        sp_appid: value.sp_appid,
        out_trade_no: value.out_trade_no,
        out_refund_no: `R${timestamp}`,
        reason: '网页模拟退款',
        notify_url: `${location.origin}/mock/receiver`,
        amount: {
          total: value.amount.total,
          refund: Math.max(
            1,
            Math.min(100, value.amount.total - value.refunded),
          ),
          currency: 'CNY',
        },
      },
    }
  if (operation === 'share')
    return {
      label: '申请分账并解冻',
      method: 'POST',
      path: '/v3/ecommerce/profitsharing/orders',
      body: {
        sub_mchid: sub,
        transaction_id: value.transaction_id,
        out_order_no: `S${timestamp}`,
        finish: true,
        receivers: [
          {
            type: 'MERCHANT_ID',
            receiver_account: state.config.spMchid,
            receiver_name: '联调测试平台',
            amount: Math.max(1, Math.min(100, value.remaining)),
            description: '平台佣金',
          },
        ],
      },
    }
  const actual = operation === 'combine-pay' ? 'pay' : operation
  return {
    label:
      generatedTemplates().actions.find((item) => item.id === actual)?.label ??
      '模拟状态流转',
    method: 'POST',
    path: `/mock/actions/${actual}`,
    body:
      controls[operation] ??
      generatedTemplates().actions.find((item) => item.id === actual)?.body ??
      {},
  }
}
function showDialog(title, body, actions = '') {
  const dialog = document.createElement('dialog')
  dialog.className = 'dialog'
  dialog.innerHTML = `<div class="dialog-header"><h2>${h(title)}</h2><button type="button" class="button small" data-dialog-close aria-label="关闭对话框">关闭</button></div><div class="dialog-body">${body}</div>${actions ? `<div class="dialog-actions">${actions}</div>` : ''}`
  dialog.addEventListener('close', () => dialog.remove())
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-dialog-close]')) dialog.close()
  })
  document.body.append(dialog)
  dialog.showModal()
  return dialog
}
function showRecord(table, key) {
  const value = state.snapshot[table]?.[key]
  if (value === undefined) {
    toast('记录已不存在，请刷新', true)
    return
  }
  const dialog = showDialog(
    `${tableNames[table] ?? table}详情`,
    `<p class="muted">存储标识：${h(key)}</p>${jsonBlock(value)}`,
    button('复制 JSON', 'dialog-copy', '', 'small'),
  )
  $('[data-action="dialog-copy"]', dialog)?.addEventListener('click', () =>
    copy(jsonText(value)),
  )
}
function operationDialog(definition) {
  let body = structuredClone(definition.body ?? {})
  const operationStateChoices = {
    '/mock/actions/applyment': [
      'CHECKING',
      'ACCOUNT_NEED_VERIFY',
      'AUDITING',
      'REJECTED',
      'NEED_SIGN',
      'FINISH',
      'FROZEN',
      'CANCELED',
    ],
    '/mock/actions/settlement': ['AUDITING', 'AUDIT_SUCCESS', 'AUDIT_FAIL'],
    '/mock/actions/cancel-withdraw': [
      'ACCEPTED',
      'REVIEWING',
      'REJECTED',
      'WAITING_MERCHANT_CONFIRM',
      'REVOKED',
      'SYSTEM_PROCESSING',
      'CANCELED',
      'FUND_PROCESSING',
      'FINISH',
    ],
    '/mock/actions/cancel': ['REVIEWING', 'REJECTED', 'CANCEL_SUCCESS'],
    '/mock/actions/cancel-withdrawal': [
      'SUBMITTED',
      'PASSED',
      'PAY_SUCCEED',
      'REJECTED',
      'PAY_FAILED',
      'BANK_REFUNDED',
    ],
    '/mock/actions/subject-alter': [
      'APPLYMENT_STATE_AUDITING',
      'APPLYMENT_STATE_REJECTED',
      'APPLYMENT_STATE_MODIFING',
      'APPLYMENT_STATE_FINISHED',
      'APPLYMENT_STATE_CANCELED',
      'APPLYMENT_STATE_EDITTING',
    ],
  }
  const fields = leafFields(body)
    .filter((item) => item.type !== 'json')
    .map((item, index) => {
      let options =
        item.path === 'state'
          ? operationStateChoices[definition.path]
          : item.path === 'status'
            ? definition.path.endsWith('complete-refund')
              ? ['SUCCESS', 'CLOSED', 'ABNORMAL']
              : ['SUCCESS', 'FAIL', 'REFUND', 'CLOSE']
            : item.path === 'merchant_state'
              ? ['NORMAL', 'HAS_BEEN_CANCELLED']
              : undefined
      return field(
        item.path,
        `${label(item.path)}${item.path.includes('.') ? ` · ${item.path}` : ''}`,
        item.value,
        {
          id: `operation-${index}`,
          type: options ? 'select' : item.type,
          options,
          data: `data-operation-field="${h(item.path)}"`,
        },
      )
    })
    .join('')
  const dialog = showDialog(
    definition.label,
    `<p class="request-line"><span class="pill">${h(definition.method)}</span> <code>${h(definition.path)}</code></p><form id="operation-form"><div class="form-grid">${fields}</div>${field('operation-json', '完整请求 JSON（可覆盖表单）', jsonText(body), { type: 'textarea', rows: 12 })}<div class="actions"><button class="button primary" type="submit">执行操作</button></div></form><div id="operation-response"></div>`,
  )
  dialog.querySelectorAll('[data-operation-field]').forEach((input) =>
    input.addEventListener('input', () => {
      try {
        body = parseObject($('#operation-json', dialog).value)
      } catch {
        toast('JSON 未完成，请先修正 JSON 再修改表单', true)
        return
      }
      setValue(
        body,
        input.dataset.operationField,
        input.type === 'checkbox'
          ? input.checked
          : input.type === 'number'
            ? Number(input.value)
            : input.value,
      )
      $('#operation-json', dialog).value = jsonText(body)
    }),
  )
  $('#operation-form', dialog).addEventListener('submit', (event) => {
    event.preventDefault()
    busy($('button[type="submit"]', dialog), async () => {
      const response = await execute(
        definition.method,
        definition.path,
        parseObject($('#operation-json', dialog).value),
      )
      const prefix = `operation-${Date.now()}`
      responses.set(prefix, response)
      $('#operation-response', dialog).innerHTML = responseMarkup(
        response,
        prefix,
      )
      assertSuccess(response)
      toast('模拟操作已完成')
      await refresh()
    })
  })
  dialog.addEventListener('click', (event) => {
    const element = event.target.closest('[data-action]')
    if (element) busy(element, () => handleResponseAction(element))
  })
}

function renderNotifications() {
  content.innerHTML = `<div class="callout">每条通知使用 APIv3 资源加密和平台签名。${h(location.origin)}/mock/receiver 会验证签名并保存解密内容；也可指向你的业务回调接口。</div>
    ${panel(
      '回调发送队列',
      `<div class="filter-bar">${field(
        'notification-filter',
        '通知状态',
        state.notificationFilter,
        {
          type: 'select',
          options: [
            { value: 'ALL', label: '全部状态' },
            { value: 'PENDING', label: '等待发送' },
            { value: 'SUCCESS', label: '已送达' },
            { value: 'FAILED', label: '重试耗尽' },
          ],
        },
      )}<div class="actions">${button('使用本地回调接收器', 'receiver-config')}${button('查看已接收数据', 'received-view')}</div></div><div id="notification-rows"></div>`,
    )}
    ${panel('本地已接收并解密的回调', '<div id="received-rows"></div>')}`
  renderNotificationRows()
}
function renderNotificationRows() {
  const target = $('#notification-rows')
  if (!target) return
  const notifications = values('notifications')
    .filter(
      (item) =>
        state.notificationFilter === 'ALL' ||
        item.status === state.notificationFilter,
    )
    .reverse()
  target.innerHTML = notifications.length
    ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>事件 / 创建时间</th><th>目标地址</th><th>状态</th><th>发送次数 / 响应</th><th>操作</th></tr></thead><tbody>${notifications
        .slice(0, 200)
        .map(
          (item) =>
            `<tr><td><strong>${h(item.body.event_type)}</strong><small class="muted">${h(item.created_at)}</small></td><td class="url-cell">${h(item.url)}${item.last_error ? `<small class="error-text">${h(item.last_error)}</small>` : ''}</td><td>${badge(item.status)}</td><td>${h(item.attempts)} 次 / ${h(item.last_status ?? '—')}</td><td>${button('密文详情', 'notification-detail', `data-id="${h(item.id)}"`, 'small')}${button('重发', 'notification-retry', `data-id="${h(item.id)}"`, 'small')}</td></tr>`,
        )
        .join('')}</tbody></table></div>`
    : empty('暂无匹配通知。创建订单并模拟支付后会生成回调。')
  const received = tableRows(state.snapshot, 'received_callbacks').reverse()
  $('#received-rows').innerHTML = received.length
    ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>事件</th><th>通知 ID</th><th>业务标识</th><th>操作</th></tr></thead><tbody>${received
        .slice(0, 100)
        .map(
          ({ key, value }) =>
            `<tr><td>${h(value.body?.event_type)}</td><td><code>${h(key)}</code></td><td>${h(value.decrypted?.out_trade_no ?? value.decrypted?.out_refund_no ?? value.decrypted?.out_request_no ?? value.decrypted?.out_order_no ?? '—')}</td><td>${button('解密详情', 'record-detail', `data-table="received_callbacks" data-key="${h(key)}"`, 'small')}</td></tr>`,
        )
        .join('')}</tbody></table></div>`
    : empty('本地接收器还没有收到通知。通知发送后，解密结果会出现在这里。')
}

function renderSettings() {
  content.innerHTML = `<div id="settings-status"></div><div class="grid-2">
    ${panel('运行模式', `<form id="config-form"><div class="form-grid">${field('config-strict', '严格验证 APIv3 签名', state.config.strict, { type: 'checkbox', hint: '网页可自动签名；你的业务系统需使用测试证书和密钥。' })}${field('config-autoPay', '下单后自动支付', state.config.autoPay, { type: 'checkbox', hint: '关闭时可在业务数据中手动模拟支付。' })}${field('config-autoComplete', '自动完成退款、分账、提现及审核', state.config.autoComplete, { type: 'checkbox', wide: true })}${field('config-serviceNotifyUrl', '服务级通知地址', state.config.serviceNotifyUrl, { wide: true, placeholder: `${location.origin}/mock/receiver`, hint: '退款、分账等未指定回调地址时使用。' })}</div><div class="actions"><button type="submit" class="button primary">保存运行设置</button>${button('填入本地接收器', 'config-local')}</div></form>`)}
    ${panel('测试账户余额', `<p class="muted">直接设置测试资金，金额单位为分。</p><form id="account-form"><div class="form-grid">${field('account-mchid', '商户号', state.config.subMchid, { required: true })}${field('account-type', '账户类型', 'BASIC', { type: 'select', options: enumOptions.account_type })}${field('account-available', '可用余额（分）', 100000, { type: 'number', min: 0, required: true })}${field('account-frozen', '冻结余额（分）', 0, { type: 'number', min: 0, required: true })}</div><div class="actions"><button type="submit" class="button">设置测试余额</button>${button('填入平台运营账户', 'account-platform')}</div></form>`)}
    </div>${panel('故障注入', `<p class="muted">对指定官方接口注入 HTTP 错误和延迟，验证业务系统的重试、幂等和异常处理。规则按照精确路径匹配。</p><form id="fault-form"><div class="form-grid">${field('fault-method', '方法', 'POST', { type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] })}${field('fault-path', '精确接口路径', '/v3/pay/partner/transactions/native', { required: true })}${field('fault-status', 'HTTP 状态码', 500, { type: 'number', min: 400, required: true })}${field('fault-code', '微信错误代码', 'SYSTEM_ERROR', { required: true })}${field('fault-message', '错误说明', '网页模拟服务故障', { required: true })}${field('fault-remaining', '生效次数', 1, { type: 'number', min: 1, required: true })}${field('fault-delay', '延迟毫秒（最多 30000）', 0, { type: 'number', min: 0 })}</div><div class="actions"><button type="submit" class="button">添加故障规则</button>${button('查看故障规则', 'fault-view')}</div></form>`)}
    ${panel(
      '业务系统接入参数',
      `<p class="muted">将业务系统的微信支付服务地址改为当前本地服务。测试私钥保存在服务端，网页不会读取私钥。</p><dl class="detail-list"><div><dt>接口地址</dt><dd><code>${h(location.origin)}</code></dd></div>${[
        ['平台商户号', 'sp_mchid'],
        ['平台 AppID', 'sp_appid'],
        ['二级商户号', 'sub_mchid'],
        ['APIv3 密钥', 'api_v3_key'],
        ['商户证书序列号', 'merchant_serial'],
        ['平台证书序列号', 'platform_serial'],
      ]
        .map(
          ([name, key]) =>
            `<div><dt>${h(name)}</dt><dd><code>${h(state.credentials[key])}</code> ${button('复制', 'credential-copy', `data-key="${h(key)}"`, 'small')}</dd></div>`,
        )
        .join(
          '',
        )}</dl><div class="actions">${button('复制全部接入参数', 'credentials-copy')}${button('下载平台证书', 'certificate-download')}${button('复制平台公钥', 'credential-copy', 'data-key="platform_public_key"')}</div><details><summary>平台证书 PEM</summary>${jsonBlock(state.credentials.platform_certificate ?? '')}</details>`,
    )}
    ${panel('测试数据管理', `<p class="muted">导出当前状态可用于排查联调问题。重置会清空业务记录，并恢复初始商户和测试账户。</p><div class="actions">${button('导出完整状态 JSON', 'state-export')}${button('重置所有测试数据', 'state-reset', '', 'danger')}</div>`)} `
  renderSettingsStatus()
}
function renderSettingsStatus() {
  const target = $('#settings-status')
  if (target)
    target.innerHTML = `<p class="callout">当前模式：${state.config.strict ? '严格验签' : '宽松模式'} · 自动支付：${state.config.autoPay ? '开' : '关'} · 自动完成：${state.config.autoComplete ? '开' : '关'} · ${values('faults').filter((item) => item.remaining > 0).length} 条有效故障规则</p>`
}

async function copy(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    toast('已复制到剪贴板')
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) {
    showDialog(
      '复制内容',
      field('copy-fallback', '请手动复制', text, {
        type: 'textarea',
        rows: 16,
      }),
    )
    return
  }
  toast('已复制到剪贴板')
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function downloadJSON(value, filename) {
  downloadBlob(
    new Blob([jsonText(value)], { type: 'application/json;charset=utf-8' }),
    filename,
  )
}
function downloadResponse(response) {
  const headers = response.headers ?? {}
  const disposition = headers['content-disposition'] ?? ''
  const name =
    disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1] ??
    disposition.match(/filename="?([^";]+)"?/i)?.[1]
  let filename =
    name ||
    `mock-bill-${localDate()}${headers['content-type']?.includes('gzip') ? '.csv.gz' : '.csv'}`
  try {
    filename = decodeURIComponent(filename)
  } catch {
    /* 保留服务端原始文件名。 */
  }
  filename = filename.replace(/[\\/:*?"<>|]/g, '_')
  const bytes =
    response.body_encoding === 'base64'
      ? Uint8Array.from(atob(response.body), (character) =>
          character.charCodeAt(0),
        )
      : response.body
  downloadBlob(
    new Blob([bytes], {
      type: headers['content-type'] ?? 'application/octet-stream',
    }),
    filename,
  )
}
async function handleResponseAction(element) {
  if (!element) return false
  const action = element.dataset.action,
    response = responses.get(element.dataset.prefix)
  if (action === 'response-copy' && response) {
    await copy(
      response.json === undefined ? response.body : jsonText(response.json),
    )
    return true
  }
  if (action === 'response-download' && response) {
    downloadResponse(response)
    return true
  }
  if (action === 'bill-download') {
    const url = new URL(element.dataset.url, location.origin)
    const result = await official('GET', `${url.pathname}${url.search}`)
    assertSuccess(result)
    downloadResponse(result)
    toast('账单文件已下载')
    return true
  }
  return false
}

content.addEventListener('click', (event) => {
  const element = event.target.closest('[data-action]')
  if (!element) return
  busy(element, async () => {
    if (await handleResponseAction(element)) return
    const { action } = element.dataset
    if (action === 'navigate') navigate(element.dataset.view)
    else if (action === 'scenario-select') selectScenario(element.dataset.id)
    else if (action === 'scenario-reload') {
      scenarioDraft(true)
      renderScenarioEditor()
    } else if (action === 'scenario-copy') await copy(jsonText(readScenario()))
    else if (action === 'scenario-workbench') {
      const input = readScenario()
      const index = state.catalog.apis.findIndex(
        (item) =>
          item.method === input.method && matchContract(item.path, input.path),
      )
      if (index < 0)
        throw new Error('当前请求没有匹配官方接口，请在工作台选择接口')
      const draft = scenarioDraft()
      selectContract(index, {
        ...draft,
        body: parseObject(draft.bodyText),
        query: parseObject(draft.queryText),
      })
    } else if (action === 'flow-start') await runFlow()
    else if (action === 'flow-stop') {
      state.flow.stopped = true
      state.flow.result = '当前请求完成后停止；已完成数据会保留。'
      updateFlow()
    } else if (action === 'negative-test')
      await negativeTest(element.dataset.test)
    else if (action === 'contract-select')
      selectContract(Number(element.dataset.index))
    else if (action === 'workbench-reload')
      selectContract(state.workbench.index)
    else if (action === 'workbench-copy') await copy(jsonText(readWorkbench()))
    else if (action === 'workbench-curl') {
      const input = readWorkbench()
      await copy(
        `curl.exe --request POST ${shellQuote(`${location.origin}/mock/console/request`)} --header 'Content-Type: application/json' --data-raw ${shellQuote(JSON.stringify(input))}`,
      )
    } else if (action === 'record-detail')
      showRecord(element.dataset.table, element.dataset.key)
    else if (action === 'order-detail' || action === 'order-pay') {
      const row = tableRows(state.snapshot, 'orders').find(
        (item) =>
          item.value.out_trade_no === element.dataset.id &&
          item.value.sub_mchid === element.dataset.sub,
      )
      if (!row) throw new Error('订单不存在，请刷新')
      if (action === 'order-detail') showRecord('orders', row.key)
      else operationDialog(operationDefinition('pay', row.value))
    } else if (action === 'record-operate')
      operationDialog(
        operationDefinition(
          element.dataset.operation,
          state.snapshot[element.dataset.table]?.[element.dataset.key] ?? {},
        ),
      )
    else if (action === 'record-export')
      downloadJSON(
        state.snapshot[state.table] ?? {},
        `mock-${state.table}-${localDate()}.json`,
      )
    else if (action === 'notification-detail')
      showRecord('notifications', element.dataset.id)
    else if (action === 'notification-retry') {
      await request(
        `/mock/notifications/${encodeURIComponent(element.dataset.id)}/retry`,
        { method: 'POST', body: '{}' },
      )
      toast('已重新加入发送队列')
      await refresh()
    } else if (action === 'receiver-config') {
      await request('/mock/config', {
        method: 'PATCH',
        body: JSON.stringify({
          serviceNotifyUrl: `${location.origin}/mock/receiver`,
        }),
      })
      toast('服务级通知已指向本地接收器')
      await refresh()
    } else if (action === 'received-view')
      $('#received-rows').scrollIntoView({ behavior: 'smooth' })
    else if (action === 'config-local')
      $('#config-serviceNotifyUrl').value = `${location.origin}/mock/receiver`
    else if (action === 'account-platform') {
      $('#account-mchid').value = state.config.spMchid
      $('#account-type').value = 'OPERATION'
    } else if (action === 'fault-view') {
      state.table = 'faults'
      state.recordFilter = ''
      navigate('records')
    } else if (action === 'credential-copy')
      await copy(String(state.credentials[element.dataset.key] ?? ''))
    else if (action === 'credentials-copy')
      await copy(jsonText({ base_url: location.origin, ...state.credentials }))
    else if (action === 'certificate-download')
      downloadBlob(
        new Blob([state.credentials.platform_certificate ?? ''], {
          type: 'application/x-pem-file',
        }),
        'mock-platform-certificate.pem',
      )
    else if (action === 'state-export')
      downloadJSON(state.snapshot, `mock-state-${localDate()}.json`)
    else if (action === 'state-reset') {
      if (state.flow.running)
        throw new Error(
          '完整交易链路仍在执行，请先停止后续步骤并等待当前请求完成，再重置数据。',
        )
      const dialog = showDialog(
        '重置所有测试数据',
        `<p>将清空订单、退款、分账、提现、申请单、回调及故障规则，并恢复初始测试商户和账户。</p><p class="muted">此操作无法撤销。可以先导出完整状态保存当前测试结果。</p>`,
        '<button type="button" class="button" data-dialog-close>取消</button><button type="button" class="button danger" id="confirm-reset">确认重置</button>',
      )
      $('#confirm-reset', dialog).addEventListener('click', (event) =>
        busy(event.currentTarget, async () => {
          await request('/mock/reset', { method: 'POST', body: '{}' })
          state.drafts.clear()
          state.workbench = null
          responses.clear()
          Object.assign(state.flow, { steps: [], result: null, stopped: false })
          dialog.close()
          await refresh()
          toast('测试数据已重置')
        }),
      )
    }
  })
})

content.addEventListener('input', (event) => {
  const input = event.target
  if (input.id === 'api-search') {
    state.apiFilter = input.value
    renderApiList()
  }
  if (input.id === 'record-search') {
    state.recordFilter = input.value
    renderRecordRows()
  }
  if (input.dataset.draftField) {
    const draft = scenarioDraft()
    const bodyField = input.dataset.source === 'scenario-body',
      textKey = bodyField ? 'bodyText' : 'queryText'
    try {
      const object = parseObject(draft[textKey])
      setValue(
        object,
        input.dataset.draftField,
        input.type === 'checkbox'
          ? input.checked
          : input.type === 'number'
            ? Number(input.value)
            : input.value,
      )
      draft[textKey] = jsonText(object)
      draft[bodyField ? 'body' : 'query'] = object
      $(`#scenario-${bodyField ? 'body' : 'query'}-json`).value = draft[textKey]
    } catch {
      toast('请先修正高级 JSON，再修改表单参数', true)
    }
  }
  if (input.id === 'scenario-path') scenarioDraft().path = input.value
  if (input.id === 'scenario-body-json') scenarioDraft().bodyText = input.value
  if (input.id === 'scenario-query-json')
    scenarioDraft().queryText = input.value
  const workbenchProperties = {
    'wb-method': 'method',
    'wb-path': 'path',
    'wb-query': 'queryText',
    'wb-body': 'bodyText',
    'wb-headers': 'headersText',
    'wb-signed': 'signed',
    'wb-encrypt': 'encryptSensitive',
  }
  if (state.workbench && workbenchProperties[input.id])
    state.workbench[workbenchProperties[input.id]] =
      input.type === 'checkbox' ? input.checked : input.value
  if (state.workbench && input.dataset.pathField)
    state.workbench.paths[input.dataset.pathField] = input.value
})
content.addEventListener('change', (event) => {
  const input = event.target
  if (input.id === 'scenario-picker') {
    state.scenario = input.value || null
    renderScenarioEditor()
  }
  if (input.id === 'action-picker' && input.value) {
    const action = generatedTemplates().actions.find(
      (item) => (item.key ?? item.id) === input.value,
    )
    if (action)
      operationDialog({
        label: action.label,
        method: 'POST',
        path: `/mock/actions/${action.id}`,
        body: action.body,
      })
    input.value = ''
  }
  if (input.id === 'api-group') {
    state.apiGroup = input.value
    renderApiList()
  }
  if (input.id === 'record-table') {
    state.table = input.value
    renderRecordRows()
  }
  if (input.id === 'notification-filter') {
    state.notificationFilter = input.value
    renderNotificationRows()
  }
})
content.addEventListener('submit', (event) => {
  event.preventDefault()
  const form = event.target,
    submit = $('button[type="submit"]', form)
  busy(submit, async () => {
    if (form.id === 'scenario-form') {
      const input = readScenario(),
        response = await execute(input.method, input.path, input.body)
      showResponse('#scenario-response', response, 'scenario')
      $('#scenario-response')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
      assertSuccess(response)
      toast('请求执行成功')
      await refresh()
    } else if (form.id === 'workbench-form') {
      const input = readWorkbench()
      let response
      const file = $('#wb-file')?.files?.[0]
      if (file) {
        const data = new FormData()
        data.set('file', file)
        data.set('path', input.path)
        data.set('signed', String(input.signed))
        response = await request('/mock/console/upload', {
          method: 'POST',
          body: data,
        })
      } else
        response = await official(input.method, input.path, input.body, input)
      showResponse('#workbench-response', response, 'workbench')
      assertSuccess(response)
      toast('请求执行成功')
      await refresh()
    } else if (form.id === 'upload-form') {
      const file = $('#upload-file').files[0]
      if (!file) throw new Error('请选择要上传的文件')
      const data = new FormData()
      data.set('file', file)
      data.set('path', $('#upload-path').value)
      data.set('signed', 'true')
      const response = await request('/mock/console/upload', {
        method: 'POST',
        body: data,
      })
      showResponse('#upload-response', response, 'upload')
      assertSuccess(response)
      toast('上传成功，media_id 可用于进件资料')
      await refresh()
    } else if (form.id === 'config-form') {
      const body = {
        strict: $('#config-strict').checked,
        autoPay: $('#config-autoPay').checked,
        autoComplete: $('#config-autoComplete').checked,
        serviceNotifyUrl: $('#config-serviceNotifyUrl').value.trim(),
      }
      await request('/mock/config', {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      await refresh()
      toast('运行设置已保存')
    } else if (form.id === 'account-form') {
      const body = {
        mchid: $('#account-mchid').value.trim(),
        account_type: $('#account-type').value,
        available: Number($('#account-available').value),
        frozen: Number($('#account-frozen').value),
      }
      await request('/mock/accounts', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      await refresh()
      toast('测试余额已更新')
    } else if (form.id === 'fault-form') {
      const body = {
        method: $('#fault-method').value,
        path: $('#fault-path').value.trim(),
        status: Number($('#fault-status').value),
        code: $('#fault-code').value.trim(),
        message: $('#fault-message').value.trim(),
        remaining: Number($('#fault-remaining').value),
        delay_ms: Number($('#fault-delay').value),
      }
      await request('/mock/faults', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      await refresh()
      toast('故障规则已添加')
    }
  })
})

$('#app-nav').addEventListener('click', (event) => {
  const element = event.target.closest('[data-view]')
  if (element) navigate(element.dataset.view)
})
$('#refresh-button').addEventListener('click', (event) =>
  busy(event.currentTarget, () => refresh(!state.catalog.apis.length)),
)
window.addEventListener('hashchange', () => navigate(location.hash.slice(1)))
state.view = viewInfo[location.hash.slice(1)]
  ? location.hash.slice(1)
  : 'overview'
setInterval(() => {
  if ($('#auto-refresh').checked && document.visibilityState === 'visible')
    refresh().catch(() => {})
}, 5000)
refresh(true).catch((error) => toast(error.message, true))
