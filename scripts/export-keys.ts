import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { CryptoService } from '../src/crypto.js'
import { defaults } from '../src/core.js'

const directory = resolve(process.argv[2] ?? 'data')
mkdirSync(directory, { recursive: true })
const service = new CryptoService(defaults.apiV3Key, directory)
for (const [name, value] of Object.entries({
  'platform_public_key.pem': service.platformPublicKey,
  'platform_certificate.pem': service.platformCertificate,
  'merchant_private_key.pem': service.merchantPrivateKey,
  'merchant_certificate.pem': service.merchantCertificate,
}))
  writeFileSync(join(directory, name), value, 'utf8')
console.log(
  `测试密钥已导出到 ${directory}；商户证书序列号 ${service.merchantSerial}；平台证书序列号 ${service.platformSerial}`,
)
