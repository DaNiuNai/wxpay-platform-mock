import { cpSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('../src/web/', import.meta.url))
const destination = fileURLToPath(new URL('../dist/web/', import.meta.url))
mkdirSync(destination, { recursive: true })
cpSync(source, destination, { recursive: true })
console.log('本地控制台资源已复制到 dist/web。')
