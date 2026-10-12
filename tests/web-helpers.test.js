import test from 'node:test'
import assert from 'node:assert/strict'
import {
  escapeHtml,
  parseObject,
  buildPath,
  setValue,
  getValue,
  leafFields,
  tableRows,
  matchContract,
  shellQuote,
} from '../src/web/helpers.js'

test('控制台插入文本时转义 HTML 标记及属性引号', () => {
  assert.equal(
    escapeHtml('<img src="x" onerror=\'alert(1)\'>&'),
    '&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;&amp;',
  )
  assert.equal(escapeHtml(undefined), '')
})

test('路径占位参数编码且空参数明确报错，查询参数不会改变资源路径', () => {
  assert.equal(
    buildPath(
      '/v3/orders/{id}',
      { id: '中文/ x?' },
      { sub_mchid: '1901', missing: '', amount: 0, finish: false },
    ),
    '/v3/orders/%E4%B8%AD%E6%96%87%2F%20x%3F?sub_mchid=1901&amount=0&finish=false',
  )
  assert.throws(() => buildPath('/v3/orders/{id}', { id: '' }), /id 必填/)
  assert.throws(() => buildPath('//outside.example/orders'), /单个/)
  assert.equal(
    buildPath('/v3/bills?token=abc', {}, { a: 'x&y' }),
    '/v3/bills?token=abc&a=x%26y',
  )
})

test('真实接口路径可匹配文档占位符但不会跨过斜杠或匹配其他接口', () => {
  const contract = '/v3/ecommerce/refunds/{refund_id}/return-advance'
  assert.equal(
    matchContract(contract, '/v3/ecommerce/refunds/refund_1/return-advance'),
    true,
  )
  assert.equal(
    matchContract(
      contract,
      '/v3/ecommerce/refunds/refund_1/return-advance?sub_mchid=1901',
    ),
    true,
  )
  assert.equal(
    matchContract(contract, '/v3/ecommerce/refunds/a/b/return-advance'),
    false,
  )
  assert.equal(
    matchContract(contract, '/v3/ecommerce/refunds/a/return-advance-extra'),
    false,
  )
  assert.equal(
    matchContract(
      '/v3/pay/partner/transactions/native',
      '/v3/pay/partner/transactions/native',
    ),
    true,
  )
})

test('结构化编辑保留未编辑字段和数组 JSON 草稿，并拒绝原型路径', () => {
  const body = {
    amount: { total: 1000, currency: 'CNY' },
    receivers: [{ account: '1901', amount: 100 }],
    attach: '用户草稿',
  }
  setValue(body, 'amount.total', 1200)
  assert.equal(getValue(body, 'amount.total'), 1200)
  assert.equal(getValue(body, 'amount.currency'), 'CNY')
  assert.deepEqual(body.receivers, [{ account: '1901', amount: 100 }])
  assert.equal(body.attach, '用户草稿')
  assert.throws(() => setValue(body, '__proto__.polluted', true), /字段名/)
  assert.equal({}.polluted, undefined)
  assert.deepEqual(
    leafFields(body).map((field) => [field.path, field.type]),
    [
      ['amount.total', 'number'],
      ['amount.currency', 'text'],
      ['receivers', 'json'],
      ['attach', 'text'],
    ],
  )
})

test('JSON 编辑器只接受完整对象并保留有业务意义的零和 false', () => {
  assert.deepEqual(parseObject('{"amount":0,"finish":false}'), {
    amount: 0,
    finish: false,
  })
  for (const text of ['null', '[]', 'true', '"abc"'])
    assert.throws(() => parseObject(text), /JSON 对象/)
  assert.throws(() => parseObject('{bad}'), /格式错误/)
})

test('状态表保留存储键且不修改原始数据；curl 参数使用 PowerShell 引号', () => {
  const snapshot = { orders: { '1901:ORDER': { out_trade_no: 'ORDER' } } }
  assert.deepEqual(tableRows(snapshot, 'orders'), [
    { key: '1901:ORDER', value: { out_trade_no: 'ORDER' } },
  ])
  assert.deepEqual(tableRows(snapshot, 'missing'), [])
  assert.equal(
    shellQuote(`{"description":"用户's 商品 $()"}`),
    `'${`{"description":"用户''s 商品 $()"}`}'`,
  )
})
