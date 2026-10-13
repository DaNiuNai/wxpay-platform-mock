import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import type { TestContext } from 'node:test'
import { Store } from '../src/store.js'

const fileStores = new WeakMap<TestContext, Set<Store>>()

function temporaryDirectory(t: TestContext): string {
  const root = resolve('tests')
  const directory = mkdtempSync(join(root, '.store-test-'))
  fileStores.set(t, new Set())
  t.after(() => {
    for (const store of fileStores.get(t) ?? []) store.close()
    assert.equal(dirname(directory), root)
    rmSync(directory, { recursive: true, force: true })
  })
  return directory
}

function fileStore(
  t: TestContext,
  file: string,
  options: { legacyFile?: string } = {},
): Store {
  const store = new Store(file, options)
  fileStores.get(t)!.add(store)
  return store
}

function memoryStore(t: TestContext): Store {
  const store = new Store()
  t.after(() => store.close())
  return store
}

test('内存模式也使用 SQLite，每条业务记录独立保存并支持标量', (t) => {
  const store = memoryStore(t)
  assert.equal(store.info().engine, 'sqlite')
  assert.equal(store.info().mode, 'memory')
  assert.equal(store.info().path, null)
  assert.match(store.info().sqliteVersion, /^3\./)
  assert.equal(store.info().journalMode, 'memory')
  store.set('meta', 'id', 42)
  store.set('orders', 'ORDER01', { amount: 100, paid: false })
  store.set('other', 'null', null)
  store.set('other', 'string', '模拟记录')
  store.set('other', 'array', [1, 2])
  assert.equal(store.record('meta', 'id'), undefined)
  store.save()
  assert.equal(store.info().recordCount, 5)
  assert.equal(store.record('meta', 'id')?.value, 42)
  assert.equal(store.record('other', 'null')?.value, null)
  assert.deepEqual(store.record('other', 'array')?.value, [1, 2])
  assert.deepEqual(store.listBuckets(), [
    { name: 'meta', count: 1 },
    { name: 'orders', count: 1 },
    { name: 'other', count: 3 },
  ])
})

test('文件库真实 SQLite 格式启用 WAL，关闭重开保留记录和元数据', (t) => {
  const directory = temporaryDirectory(t)
  const file = join(directory, 'state.sqlite')
  const first = fileStore(t, file)
  first.set('orders', 'ORDER01', { amount: 100, state: 'SUCCESS' })
  first.set('meta', 'sequence', 1)
  first.save()
  const before = first.record('orders', 'ORDER01')!
  assert.equal(first.info().journalMode, 'wal')
  assert.equal(first.info().mode, 'file')
  assert.equal(first.info().path, resolve(file))
  first.close()
  assert.equal(
    readFileSync(file).subarray(0, 16).toString(),
    'SQLite format 3\0',
  )
  const second = fileStore(t, file)
  t.after(() => second.close())
  assert.deepEqual(second.record('orders', 'ORDER01'), before)
  assert.deepEqual(second.get('orders', 'ORDER01'), {
    amount: 100,
    state: 'SUCCESS',
  })
  const database = new DatabaseSync(file, { readOnly: true })
  try {
    assert.equal(
      database.prepare('SELECT count(*) AS count FROM records').get()?.count,
      2,
    )
    assert.equal(
      database
        .prepare('SELECT value FROM records WHERE bucket = ? AND key = ?')
        .get('meta', 'sequence')?.value,
      '1',
    )
  } finally {
    database.close()
  }
})

test('可变对象引用无需 set 即可保存，无变化保存不增加版本', (t) => {
  const store = memoryStore(t)
  const account = { available: 1000, nested: { frozen: 0 } }
  store.set('accounts', 'MCH01:BASIC', account)
  store.save()
  const first = store.record('accounts', 'MCH01:BASIC')!
  assert.equal(first.revision, 1)
  assert.equal(store.get('accounts', 'MCH01:BASIC'), account)
  assert.equal(store.values('accounts')[0], account)
  account.available -= 200
  const same = store.values<typeof account>('accounts')[0]!
  same.nested.frozen = 200
  assert.deepEqual(store.record('accounts', 'MCH01:BASIC')?.value, {
    available: 1000,
    nested: { frozen: 0 },
  })
  store.save()
  const changed = store.record('accounts', 'MCH01:BASIC')!
  assert.deepEqual(changed.value, { available: 800, nested: { frozen: 200 } })
  assert.equal(changed.revision, 2)
  assert.equal(changed.created_at, first.created_at)
  store.save()
  assert.deepEqual(store.record('accounts', 'MCH01:BASIC'), changed)
  const detached = store.record('accounts', 'MCH01:BASIC')!
  ;(detached.value as typeof account).available = 0
  assert.equal(account.available, 800)
  assert.equal(store.record('accounts', 'MCH01:BASIC')?.revision, 2)
})

test('snapshot 和 restore 隔离引用，失败业务变更不会进入提交记录', (t) => {
  const store = memoryStore(t)
  store.set('accounts', 'MCH01', { available: 1000 })
  store.save()
  const before = store.snapshot()
  store.get<{ available: number }>('accounts', 'MCH01')!.available = 0
  store.set('refunds', 'REFUND01', { amount: 1000 })
  store.delete('accounts', 'MCH01')
  store.restore(before)
  store.save()
  assert.equal(
    store.get<{ available: number }>('accounts', 'MCH01')?.available,
    1000,
  )
  assert.equal(store.record('refunds', 'REFUND01'), undefined)
  assert.equal(store.record('accounts', 'MCH01')?.revision, 1)
  store.get<{ available: number }>('accounts', 'MCH01')!.available = 800
  store.restore(before)
  assert.equal(
    store.get<{ available: number }>('accounts', 'MCH01')?.available,
    1000,
  )
})

test('删除记录保留空集合，reset 原子清空全部业务集合且重启仍为空', (t) => {
  const directory = temporaryDirectory(t)
  const file = join(directory, 'state.sqlite')
  const store = fileStore(t, file)
  store.set('orders', 'ORDER01', { amount: 100 })
  store.save()
  store.delete('orders', 'ORDER01')
  assert.equal(store.record('orders', 'ORDER01')?.revision, 1)
  store.save()
  assert.equal(store.record('orders', 'ORDER01'), undefined)
  assert.deepEqual(store.listBuckets(), [{ name: 'orders', count: 0 }])
  store.set('orders', 'ORDER02', { amount: 200 })
  store.save()
  store.reset()
  store.save()
  assert.equal(store.info().recordCount, 0)
  assert.deepEqual(store.listBuckets(), [])
  store.close()
  const restarted = fileStore(t, file)
  t.after(() => restarted.close())
  assert.deepEqual(restarted.listBuckets(), [])
})

test('首次创建空库原子迁移旧 JSON，保留旧文件且后续不会重新覆盖 SQLite', (t) => {
  const directory = temporaryDirectory(t)
  const file = join(directory, 'state.sqlite')
  const legacyFile = join(directory, 'state.json')
  const original = JSON.stringify({
    orders: { ORDER01: { amount: 100 } },
    meta: { sequence: 10 },
    empty: {},
  })
  writeFileSync(legacyFile, original, 'utf8')
  const store = fileStore(t, file, { legacyFile })
  assert.equal(store.info().legacyImported, true)
  assert.equal(store.info().recordCount, 2)
  assert.equal(store.record('meta', 'sequence')?.value, 10)
  assert.deepEqual(store.listBuckets(), [
    { name: 'empty', count: 0 },
    { name: 'meta', count: 1 },
    { name: 'orders', count: 1 },
  ])
  assert.equal(readFileSync(legacyFile, 'utf8'), original)
  store.get<{ amount: number }>('orders', 'ORDER01')!.amount = 200
  store.close()
  writeFileSync(legacyFile, '{ invalid replaced legacy', 'utf8')
  const second = fileStore(t, file, { legacyFile })
  t.after(() => second.close())
  assert.deepEqual(second.record('orders', 'ORDER01')?.value, { amount: 200 })
  assert.equal(second.info().legacyImported, true)
})

test('已有非空库或已清空库不会导入后来出现的旧 JSON', (t) => {
  const directory = temporaryDirectory(t)
  const file = join(directory, 'state.sqlite')
  const legacyFile = join(directory, 'state.json')
  const store = fileStore(t, file)
  store.set('orders', 'SQLITE01', { amount: 500 })
  store.close()
  writeFileSync(legacyFile, '{"orders":{"LEGACY01":{"amount":100}}}', 'utf8')
  const nonempty = fileStore(t, file, { legacyFile })
  assert.equal(nonempty.get('orders', 'LEGACY01'), undefined)
  assert.equal(nonempty.info().legacyImported, false)
  nonempty.reset()
  nonempty.close()
  const emptied = fileStore(t, file, { legacyFile })
  t.after(() => emptied.close())
  assert.equal(emptied.info().recordCount, 0)
  assert.equal(emptied.get('orders', 'LEGACY01'), undefined)
  assert.equal(emptied.info().legacyImported, false)
})

test('迁移非法结构和损坏 JSON 不留下部分记录，修复原文件后可重新迁移', (t) => {
  const directory = temporaryDirectory(t)
  const file = join(directory, 'state.sqlite')
  const legacyFile = join(directory, 'state.json')
  const invalid = '{"orders":{"ORDER01":{"amount":100}},"broken":[1]}'
  writeFileSync(legacyFile, invalid, 'utf8')
  assert.throws(() => fileStore(t, file, { legacyFile }), /必须是对象/)
  assert.equal(readFileSync(legacyFile, 'utf8'), invalid)
  const inspect = new DatabaseSync(file, { readOnly: true })
  try {
    assert.equal(
      inspect.prepare('SELECT count(*) AS count FROM records').get()?.count,
      0,
    )
    assert.equal(
      inspect.prepare('SELECT count(*) AS count FROM buckets').get()?.count,
      0,
    )
    assert.equal(
      inspect.prepare('SELECT count(*) AS count FROM storage_meta').get()
        ?.count,
      0,
    )
  } finally {
    inspect.close()
  }
  writeFileSync(legacyFile, '{ invalid', 'utf8')
  assert.throws(() => fileStore(t, file, { legacyFile }), SyntaxError)
  writeFileSync(legacyFile, '{"orders":{"ORDER01":{"amount":100}}}', 'utf8')
  const repaired = fileStore(t, file, { legacyFile })
  t.after(() => repaired.close())
  assert.equal(repaired.info().legacyImported, true)
  assert.equal(repaired.info().recordCount, 1)
})

test('保存遇到数据库约束错误会回滚全部新增、更新和删除，修复后可重试', (t) => {
  const directory = temporaryDirectory(t)
  const file = join(directory, 'state.sqlite')
  const store = fileStore(t, file)
  t.after(() => store.close())
  store.set('orders', 'EXISTING', { amount: 100 })
  store.set('orders', 'DELETE', { amount: 200 })
  store.save()
  const inspector = new DatabaseSync(file)
  try {
    inspector.exec(
      "CREATE TRIGGER reject_bad_record BEFORE INSERT ON records WHEN NEW.key = 'REJECT' BEGIN SELECT RAISE(ABORT, 'test forced failure'); END;",
    )
    store.get<{ amount: number }>('orders', 'EXISTING')!.amount = 999
    store.delete('orders', 'DELETE')
    store.set('orders', 'NEW', { amount: 300 })
    store.set('orders', 'REJECT', { amount: 400 })
    assert.throws(() => store.save(), /test forced failure/)
    assert.deepEqual(store.record('orders', 'EXISTING')?.value, { amount: 100 })
    assert.equal(store.record('orders', 'EXISTING')?.revision, 1)
    assert.deepEqual(store.record('orders', 'DELETE')?.value, { amount: 200 })
    assert.equal(store.record('orders', 'NEW'), undefined)
    assert.equal(store.info().recordCount, 2)
    inspector.exec('DROP TRIGGER reject_bad_record')
    store.save()
    assert.deepEqual(store.record('orders', 'EXISTING')?.value, { amount: 999 })
    assert.ok(store.record('orders', 'EXISTING')!.revision > 2)
    assert.equal(store.record('orders', 'DELETE'), undefined)
    assert.equal(store.info().recordCount, 3)
  } finally {
    inspector.close()
  }
})

test('无法序列化的记录不会导致其他变更部分提交', (t) => {
  const store = memoryStore(t)
  store.set('meta', 'id', 1)
  store.save()
  const snapshot = store.snapshot()
  store.set('meta', 'id', 2)
  store.set('bad', 'undefined', undefined)
  assert.throws(() => store.save(), /无法序列化为 JSON/)
  assert.equal(store.record('meta', 'id')?.value, 1)
  store.delete('bad', 'undefined')
  store.set('bad', 'bigint', 1n)
  assert.throws(() => store.save(), /BigInt/i)
  assert.equal(store.record('meta', 'id')?.value, 1)
  store.restore(snapshot)
  store.save()
  assert.equal(store.info().recordCount, 1)
})

test('分页保持插入顺序，搜索 key 和 JSON 使用字面子串而非 SQL 通配符', (t) => {
  const store = memoryStore(t)
  store.set('orders', 'Z-FIRST', { description: '测试商品100%' })
  store.set('orders', 'A-SECOND', { description: '联调_订单' })
  store.set('orders', 'Q-THIRD', { description: 'quote' })
  store.set('orders', 'SQL-LITERAL', { description: "' OR 1=1--" })
  store.set('other', 'Z-FIRST', { description: '测试商品100%' })
  store.save()
  assert.deepEqual(
    store.page('orders', { pageSize: 2 }).items.map((item) => item.key),
    ['Z-FIRST', 'A-SECOND'],
  )
  const second = store.page('orders', { page: 2, pageSize: 2 })
  assert.equal(second.total, 4)
  assert.deepEqual(
    second.items.map((item) => item.key),
    ['Q-THIRD', 'SQL-LITERAL'],
  )
  assert.equal(store.page('orders', { page: 9, pageSize: 2 }).items.length, 0)
  assert.deepEqual(
    store.page('orders', { search: '%' }).items.map((item) => item.key),
    ['Z-FIRST'],
  )
  assert.deepEqual(
    store.page('orders', { search: '_' }).items.map((item) => item.key),
    ['A-SECOND'],
  )
  assert.deepEqual(
    store
      .page('orders', { search: "' OR 1=1--" })
      .items.map((item) => item.key),
    ['SQL-LITERAL'],
  )
  assert.equal(store.page("orders' OR 1=1--").total, 0)
  assert.equal(store.page('orders', { search: 'SECOND' }).total, 1)
  store.get<{ description: string }>('orders', 'Z-FIRST')!.description =
    '已编辑'
  store.save()
  assert.equal(store.page('orders').items[0]?.key, 'Z-FIRST')
  assert.equal(store.page('orders', { search: '%' }).total, 0)
  assert.throws(() => store.page('orders', { page: 0 }), /page/)
  assert.throws(() => store.page('orders', { pageSize: 201 }), /pageSize/)
  assert.throws(
    () => store.page('orders', { page: Number.MAX_SAFE_INTEGER, pageSize: 20 }),
    /偏移量/,
  )
})

test('原型名称和带引号的集合键作为普通记录存取，迁移也不会污染原型', (t) => {
  const directory = temporaryDirectory(t)
  const file = join(directory, 'state.sqlite')
  const legacyFile = join(directory, 'state.json')
  writeFileSync(
    legacyFile,
    '{"__proto__":{"__proto__":{"polluted":true}},"constructor":{"prototype":1}}',
    'utf8',
  )
  const store = fileStore(t, file, { legacyFile })
  t.after(() => store.close())
  assert.equal(({} as { polluted?: boolean }).polluted, undefined)
  assert.deepEqual(store.get('__proto__', '__proto__'), { polluted: true })
  assert.equal(store.get('constructor', 'prototype'), 1)
  store.set("orders'; DROP TABLE records;--", "key' OR 1=1--", false)
  store.restore(store.snapshot())
  store.save()
  assert.equal(
    store.record("orders'; DROP TABLE records;--", "key' OR 1=1--")?.value,
    false,
  )
  assert.equal(store.record('__proto__', '__proto__')?.revision, 1)
  assert.equal(store.get('toString', 'valueOf'), undefined)
  assert.equal(store.info().recordCount, 3)
})

test('close 保存未提交引用改动并幂等关闭，关闭后所有读写明确报错', (t) => {
  const directory = temporaryDirectory(t)
  const file = join(directory, 'state.sqlite')
  const store = fileStore(t, file)
  store.set('orders', 'ORDER01', { amount: 100 })
  store.save()
  store.get<{ amount: number }>('orders', 'ORDER01')!.amount = 200
  store.close()
  store.close()
  for (const operation of [
    () => store.get('orders', 'ORDER01'),
    () => store.values('orders'),
    () => store.set('orders', 'ORDER02', {}),
    () => store.delete('orders', 'ORDER01'),
    () => store.snapshot(),
    () => store.restore({}),
    () => store.reset(),
    () => store.save(),
    () => store.info(),
    () => store.listBuckets(),
    () => store.page('orders'),
    () => store.record('orders', 'ORDER01'),
  ])
    assert.throws(operation, /已关闭/)
  const restarted = fileStore(t, file)
  t.after(() => restarted.close())
  assert.deepEqual(restarted.record('orders', 'ORDER01')?.value, {
    amount: 200,
  })
  assert.equal(restarted.record('orders', 'ORDER01')?.revision, 2)
})

test('删除重建及 reset 重启后同名记录不会复用旧版本号', (t) => {
  const directory = temporaryDirectory(t)
  const file = join(directory, 'state.sqlite')
  const store = fileStore(t, file)
  store.set('orders', 'ORDER01', { amount: 100 })
  store.save()
  const initial = store.record('orders', 'ORDER01')!.revision
  store.delete('orders', 'ORDER01')
  store.save()
  store.set('orders', 'ORDER01', { amount: 200 })
  store.save()
  const recreated = store.record('orders', 'ORDER01')!.revision
  assert.ok(recreated > initial)
  store.reset()
  store.close()
  const restarted = fileStore(t, file)
  t.after(() => restarted.close())
  restarted.set('orders', 'ORDER01', { amount: 300 })
  restarted.save()
  assert.ok(restarted.record('orders', 'ORDER01')!.revision > recreated)
})
