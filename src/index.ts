import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { defaults } from './core.js'
import type { MockConfig } from './types.js'

const args = process.argv.slice(2)
const value = (name: string) => {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}
const configPath = value('--config')
const config: MockConfig = {
  ...defaults,
  ...(configPath
    ? (JSON.parse(
        readFileSync(resolve(configPath), 'utf8'),
      ) as Partial<MockConfig>)
    : {}),
}
if (value('--port')) config.port = Number(value('--port'))
if (value('--host')) config.host = value('--host')!
if (args.includes('--strict')) config.strict = true
if (args.includes('--auto-pay')) config.autoPay = true
if (!configPath || value('--port'))
  config.baseUrl = `http://${config.host}:${config.port}`
const instance = createApp({
  config,
  dataDir: args.includes('--memory')
    ? null
    : resolve(value('--data-dir') ?? 'data'),
})
const server = serve(
  { fetch: instance.app.fetch, port: config.port, hostname: config.host },
  () =>
    console.log(
      `平台收付通模拟服务：${config.baseUrl}（${config.strict ? '严格验签' : '宽松'}模式）`,
    ),
)
const shutdown = () => {
  instance.close()
  server.close()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
