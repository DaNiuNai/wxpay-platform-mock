import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp } from '../src/app.js'
import type { Notification } from '../src/core.js'

test(
  '数据库修改正在投递的通知后，旧 HTTP 结果不会覆盖新的通知记录',
  { timeout: 10000 },
  async () => {
    const instance = createApp({ callbacks: false })
    let accepted!: () => void
    let release!: () => void
    const receiving = new Promise<void>((resolve) => {
      accepted = resolve
    })
    const server = createServer(async (request, response) => {
      for await (const _chunk of request) {
        /* 消费通知正文。 */
      }
      accepted()
      await new Promise<void>((resolve) => {
        release = resolve
      })
      response.writeHead(204).end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address() as AddressInfo
      instance.runtime.notify(
        `http://127.0.0.1:${address.port}/notify`,
        'TRANSACTION.SUCCESS',
        { out_trade_no: 'SQLITE_CALLBACK' },
      )
      instance.runtime.store.save()
      const notification =
        instance.runtime.store.values<Notification>('notifications')[0]!
      const before = instance.runtime.store.record(
        'notifications',
        notification.id,
      )!
      const delivering = instance.runtime.flushCallbacks()
      await receiving
      const changed = {
        ...notification,
        url: `http://127.0.0.1:${address.port}/changed-notify`,
      }
      const response = await instance.app.request(
        '/mock/database/notifications/record',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: notification.id,
            revision: before.revision,
            value: changed,
          }),
        },
      )
      assert.equal(response.status, 200, await response.text())
      release()
      await delivering
      const stored = instance.runtime.store.get<Notification>(
        'notifications',
        notification.id,
      )!
      assert.equal(stored.url, changed.url)
      assert.equal(stored.status, 'PENDING')
      assert.equal(stored.attempts, 0)
      assert.ok(
        instance.runtime.store.record('notifications', notification.id)!
          .revision > before.revision,
      )
    } finally {
      release?.()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      instance.close()
    }
  },
)

test(
  '有通知正在等待 HTTP 应答时关闭应用，不会再次访问已关闭 SQLite 连接',
  { timeout: 10000 },
  async () => {
    const instance = createApp({ callbacks: false })
    let accepted!: () => void
    let release!: () => void
    const receiving = new Promise<void>((resolve) => {
      accepted = resolve
    })
    const server = createServer(async (request, response) => {
      for await (const _chunk of request) {
        /* 消费通知正文。 */
      }
      accepted()
      await new Promise<void>((resolve) => {
        release = resolve
      })
      response.writeHead(204).end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address() as AddressInfo
      instance.runtime.notify(
        `http://127.0.0.1:${address.port}`,
        'TRANSACTION.SUCCESS',
        {},
      )
      instance.runtime.store.save()
      const delivering = instance.runtime.flushCallbacks()
      await receiving
      instance.close()
      release()
      await assert.doesNotReject(delivering)
      assert.equal((await instance.runtime.flushCallbacks()).stopped, true)
    } finally {
      release?.()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      instance.close()
    }
  },
)
