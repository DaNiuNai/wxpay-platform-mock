import {
  constants,
  createCipheriv,
  createDecipheriv,
  createPublicKey,
  generateKeyPairSync,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
  sign,
  verify,
  X509Certificate,
} from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Data } from './types.js'

function der(tag: number, bytes: Buffer): Buffer {
  const length =
    bytes.length < 128
      ? Buffer.from([bytes.length])
      : (() => {
          let hex = bytes.length.toString(16)
          if (hex.length % 2) hex = `0${hex}`
          const encoded = Buffer.from(hex, 'hex')
          return Buffer.concat([Buffer.from([0x80 | encoded.length]), encoded])
        })()
  return Buffer.concat([Buffer.from([tag]), length, bytes])
}
const sequence = (...parts: Buffer[]) => der(0x30, Buffer.concat(parts))
const algorithm = Buffer.from('300d06092a864886f70d01010b0500', 'hex')
const name = sequence(
  der(
    0x31,
    sequence(
      Buffer.from('0603550403', 'hex'),
      der(0x0c, Buffer.from('Mock Wechat Pay')),
    ),
  ),
)
const utc = (date: Date) =>
  der(
    0x17,
    Buffer.from(date.toISOString().slice(2, 19).replace(/[-:T]/g, '') + 'Z'),
  )

/** 生成仅供本地 SDK 联调使用的自签名 X.509 RSA 证书，无外部命令依赖。 */
function certificate(privateKey: string, serial: string): string {
  const from = new Date(Date.now() - 86400000)
  const to = new Date(Date.now() + 10 * 365 * 86400000)
  const publicKey = createPublicKey(privateKey).export({
    type: 'spki',
    format: 'der',
  })
  let serialBytes = Buffer.from(serial, 'hex')
  while (serialBytes.length > 1 && serialBytes[0] === 0)
    serialBytes = serialBytes.subarray(1)
  if (serialBytes[0]! >= 0x80)
    serialBytes = Buffer.concat([Buffer.from([0]), serialBytes])
  const tbs = sequence(
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, serialBytes),
    algorithm,
    name,
    sequence(utc(from), utc(to)),
    name,
    publicKey,
  )
  const signed = sequence(
    tbs,
    algorithm,
    der(
      0x03,
      Buffer.concat([Buffer.from([0]), sign('RSA-SHA256', tbs, privateKey)]),
    ),
  )
  return `-----BEGIN CERTIFICATE-----\n${signed
    .toString('base64')
    .match(/.{1,64}/g)!
    .join('\n')}\n-----END CERTIFICATE-----\n`
}

interface Material {
  platformPrivateKey: string
  merchantPrivateKey: string
  platformCertificate: string
  merchantCertificate: string
}

export class CryptoService {
  readonly platformPublicKey: string
  readonly merchantPublicKey: string
  readonly platformSerial: string
  readonly merchantSerial: string
  readonly platformPrivateKey: string
  readonly merchantPrivateKey: string
  readonly platformCertificate: string
  readonly merchantCertificate: string

  constructor(
    readonly apiV3Key: string,
    directory?: string,
  ) {
    if (Buffer.byteLength(apiV3Key) !== 32)
      throw new Error('apiV3Key 必须恰好为 32 字节')
    const file = directory && join(directory, 'keys.json')
    let material: Material
    if (file && existsSync(file))
      material = JSON.parse(readFileSync(file, 'utf8')) as Material
    else {
      const key = () =>
        generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        }).privateKey
      const platformPrivateKey = key()
      const merchantPrivateKey = key()
      material = {
        platformPrivateKey,
        merchantPrivateKey,
        platformCertificate: certificate(
          platformPrivateKey,
          randomBytes(16).toString('hex'),
        ),
        merchantCertificate: certificate(
          merchantPrivateKey,
          randomBytes(16).toString('hex'),
        ),
      }
      if (file) {
        mkdirSync(directory!, { recursive: true })
        writeFileSync(file, JSON.stringify(material, null, 2), 'utf8')
      }
    }
    Object.assign(this, material)
    this.platformPrivateKey = material.platformPrivateKey
    this.merchantPrivateKey = material.merchantPrivateKey
    this.platformCertificate = material.platformCertificate
    this.merchantCertificate = material.merchantCertificate
    this.platformPublicKey = createPublicKey(material.platformPrivateKey)
      .export({ type: 'spki', format: 'pem' })
      .toString()
    this.merchantPublicKey = createPublicKey(material.merchantPrivateKey)
      .export({ type: 'spki', format: 'pem' })
      .toString()
    this.platformSerial = new X509Certificate(
      material.platformCertificate,
    ).serialNumber
    this.merchantSerial = new X509Certificate(
      material.merchantCertificate,
    ).serialNumber
  }

  headers(body: string): Record<string, string> {
    const timestamp = String(Math.floor(Date.now() / 1000))
    const nonce = randomBytes(16).toString('hex')
    return {
      'Wechatpay-Timestamp': timestamp,
      'Wechatpay-Nonce': nonce,
      'Wechatpay-Serial': this.platformSerial,
      'Wechatpay-Signature': sign(
        'RSA-SHA256',
        Buffer.from(`${timestamp}\n${nonce}\n${body}\n`),
        this.platformPrivateKey,
      ).toString('base64'),
    }
  }

  verifyRequest(request: Request, body: string, mchid: string): void {
    const authorization = request.headers.get('Authorization') ?? ''
    if (!authorization.startsWith('WECHATPAY2-SHA256-RSA2048 '))
      throw new Error('缺少 WECHATPAY2-SHA256-RSA2048 认证信息')
    const fields = Object.fromEntries(
      [...authorization.matchAll(/(\w+)="([^"]*)"/g)].map((match) => [
        match[1]!,
        match[2]!,
      ]),
    )
    if (fields.mchid !== mchid || fields.serial_no !== this.merchantSerial)
      throw new Error('商户号或证书序列号不匹配')
    const timestamp = Number(fields.timestamp)
    if (
      !Number.isSafeInteger(timestamp) ||
      Math.abs(Date.now() / 1000 - timestamp) > 300
    )
      throw new Error('请求时间戳超过允许范围')
    if (!fields.nonce_str || !fields.signature)
      throw new Error('缺少 nonce_str 或 signature')
    const url = new URL(request.url)
    const message = `${request.method}\n${url.pathname}${url.search}\n${fields.timestamp}\n${fields.nonce_str}\n${body}\n`
    if (
      !verify(
        'RSA-SHA256',
        Buffer.from(message),
        this.merchantPublicKey,
        Buffer.from(fields.signature, 'base64'),
      )
    )
      throw new Error('请求签名校验失败')
  }

  verifyNotification(headers: Headers, body: string): boolean {
    const timestamp = headers.get('Wechatpay-Timestamp'),
      nonce = headers.get('Wechatpay-Nonce')
    if (
      !timestamp ||
      !nonce ||
      headers.get('Wechatpay-Serial') !== this.platformSerial ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
      !Number.isSafeInteger(Number(timestamp))
    )
      return false
    return verify(
      'RSA-SHA256',
      Buffer.from(`${timestamp}\n${nonce}\n${body}\n`),
      this.platformPublicKey,
      Buffer.from(headers.get('Wechatpay-Signature') ?? '', 'base64'),
    )
  }

  encryptResource(value: unknown, originalType: string): Data {
    const nonce = randomBytes(6).toString('hex')
    const associatedData = originalType
    const cipher = createCipheriv(
      'aes-256-gcm',
      Buffer.from(this.apiV3Key),
      Buffer.from(nonce),
    )
    cipher.setAAD(Buffer.from(associatedData))
    const ciphertext = Buffer.concat([
      cipher.update(
        typeof value === 'string' ? value : JSON.stringify(value),
        'utf8',
      ),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64')
    return {
      algorithm: 'AEAD_AES_256_GCM',
      original_type: originalType,
      nonce,
      associated_data: associatedData,
      ciphertext,
    }
  }

  decryptResource(resource: Data): unknown {
    const bytes = Buffer.from(String(resource.ciphertext), 'base64')
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(this.apiV3Key),
      Buffer.from(String(resource.nonce)),
    )
    decipher.setAAD(Buffer.from(String(resource.associated_data ?? '')))
    decipher.setAuthTag(bytes.subarray(-16))
    const plaintext = Buffer.concat([
      decipher.update(bytes.subarray(0, -16)),
      decipher.final(),
    ]).toString('utf8')
    try {
      return JSON.parse(plaintext) as unknown
    } catch {
      return plaintext
    }
  }

  decryptSensitive(value: string): string {
    return privateDecrypt(
      {
        key: this.platformPrivateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha1',
      },
      Buffer.from(value, 'base64'),
    ).toString('utf8')
  }

  encryptSensitive(value: string): string {
    return publicEncrypt(
      {
        key: this.merchantPublicKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha1',
      },
      Buffer.from(value),
    ).toString('base64')
  }

  exportPublic(): Data {
    return {
      platform_public_key: this.platformPublicKey,
      platform_certificate: this.platformCertificate,
      platform_serial: this.platformSerial,
      merchant_public_key: this.merchantPublicKey,
      merchant_certificate: this.merchantCertificate,
      merchant_serial: this.merchantSerial,
    }
  }
}
