import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'

type Tables = Record<string, Record<string, unknown>>

/** 单进程状态仓库；每次成功请求原子替换快照。 */
export class Store {
  private tables: Tables = Object.create(null) as Tables

  constructor(private readonly file?: string) {
    if (file && existsSync(file)) {
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('状态文件格式错误')
      this.tables = parsed as Tables
    }
  }

  get<T>(table: string, key: string): T | undefined {
    return Object.hasOwn(this.tables, table) &&
      Object.hasOwn(this.tables[table]!, key)
      ? (this.tables[table]![key] as T)
      : undefined
  }

  values<T>(table: string): T[] {
    return Object.hasOwn(this.tables, table)
      ? (Object.values(this.tables[table]!) as T[])
      : []
  }

  set<T>(table: string, key: string, value: T): void {
    if (!Object.hasOwn(this.tables, table)) {
      Object.defineProperty(this.tables, table, {
        value: Object.create(null),
        enumerable: true,
        writable: true,
        configurable: true,
      })
    }
    Object.defineProperty(this.tables[table]!, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }

  delete(table: string, key: string): void {
    if (Object.hasOwn(this.tables, table)) delete this.tables[table]![key]
  }

  snapshot(): Tables {
    return structuredClone(this.tables)
  }
  restore(snapshot: Tables): void {
    this.tables = snapshot
  }
  reset(): void {
    this.tables = Object.create(null) as Tables
  }

  save(): void {
    if (!this.file) return
    mkdirSync(dirname(this.file), { recursive: true })
    const temp = `${this.file}.tmp`
    writeFileSync(temp, JSON.stringify(this.tables, null, 2), 'utf8')
    renameSync(temp, this.file)
  }
}
