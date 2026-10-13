import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type Tables = Record<string, Record<string, unknown>>

export interface StoredRecord {
  key: string
  value: unknown
  revision: number
  created_at: string
  updated_at: string
}

export interface PageOptions {
  search?: string
  page?: number
  pageSize?: number
}

interface RecordRow {
  key: string
  value: string
  revision: number
  created_at: string
  updated_at: string
}

type SerializedTables = Map<string, Map<string, string>>
const schemaVersion = 1

function emptyTables(): Tables {
  return Object.create(null) as Tables
}

function normalizeTables(value: unknown): Tables {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('状态文件必须是记录集合对象')
  const tables = emptyTables()
  for (const [name, entries] of Object.entries(value)) {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries))
      throw new Error(`记录集合 ${name} 必须是对象`)
    const bucket = Object.create(null) as Record<string, unknown>
    for (const [key, record] of Object.entries(entries)) bucket[key] = record
    tables[name] = bucket
  }
  return tables
}

function serializeTables(tables: Tables): SerializedTables {
  const serialized: SerializedTables = new Map()
  for (const [name, entries] of Object.entries(tables)) {
    const records = new Map<string, string>()
    for (const [key, value] of Object.entries(entries)) {
      const json = JSON.stringify(value)
      if (json === undefined)
        throw new Error(`记录 ${name}/${key} 无法序列化为 JSON`)
      records.set(key, json)
    }
    serialized.set(name, records)
  }
  return serialized
}

function storedRecord(row: RecordRow): StoredRecord {
  return {
    key: row.key,
    value: JSON.parse(row.value) as unknown,
    revision: row.revision,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/** 业务对象保留可变引用；save 将差异按记录原子提交到 SQLite。 */
export class Store {
  private tables: Tables = emptyTables()
  private committed: SerializedTables = new Map()
  private readonly database: DatabaseSync
  private readonly file: string | null
  private closed = false
  private initialized = false
  private legacyImported = false
  private nextOrdinal = 0
  private nextRevision = 0

  constructor(file?: string, options: { legacyFile?: string } = {}) {
    this.file = file && file !== ':memory:' ? resolve(file) : null
    if (this.file) mkdirSync(dirname(this.file), { recursive: true })
    this.database = new DatabaseSync(this.file ?? ':memory:')
    try {
      this.database.exec(`
        PRAGMA busy_timeout = 5000;
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = FULL;
        CREATE TABLE IF NOT EXISTS storage_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS buckets (
          name TEXT PRIMARY KEY
        );
        CREATE TABLE IF NOT EXISTS records (
          bucket TEXT NOT NULL REFERENCES buckets(name) ON DELETE CASCADE,
          key TEXT NOT NULL,
          value TEXT NOT NULL CHECK(json_valid(value)),
          revision INTEGER NOT NULL CHECK(revision >= 1),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          ordinal INTEGER NOT NULL UNIQUE,
          PRIMARY KEY(bucket, key)
        );
        CREATE INDEX IF NOT EXISTS records_bucket_ordinal
          ON records(bucket, ordinal);
      `)
      const metadata = new Map(
        (
          this.database
            .prepare('SELECT key, value FROM storage_meta')
            .all() as {
            key: string
            value: string
          }[]
        ).map((row) => [row.key, row.value]),
      )
      if (
        metadata.has('schema_version') &&
        metadata.get('schema_version') !== String(schemaVersion)
      )
        throw new Error('SQLite 状态库版本不受支持')
      this.initialized = metadata.get('initialized') === 'true'
      this.legacyImported = metadata.get('legacy_imported') === 'true'
      for (const row of this.database
        .prepare('SELECT name FROM buckets ORDER BY rowid')
        .all() as { name: string }[]) {
        this.tables[row.name] = Object.create(null) as Record<string, unknown>
        this.committed.set(row.name, new Map())
      }
      for (const row of this.database
        .prepare('SELECT bucket, key, value FROM records ORDER BY ordinal')
        .all() as { bucket: string; key: string; value: string }[]) {
        this.tables[row.bucket]![row.key] = JSON.parse(row.value) as unknown
        this.committed.get(row.bucket)!.set(row.key, row.value)
      }
      const maximum = this.database
        .prepare(
          'SELECT coalesce(max(ordinal), 0) AS ordinal, coalesce(max(revision), 0) AS revision FROM records',
        )
        .get() as { ordinal: number; revision: number }
      this.nextOrdinal = Math.max(
        Number(metadata.get('next_ordinal') ?? 0),
        maximum.ordinal,
      )
      this.nextRevision = Math.max(
        Number(metadata.get('next_revision') ?? 0),
        maximum.revision,
      )
      if (!this.initialized) {
        if (
          this.file &&
          this.committed.size === 0 &&
          options.legacyFile &&
          existsSync(options.legacyFile)
        ) {
          this.tables = normalizeTables(
            JSON.parse(readFileSync(options.legacyFile, 'utf8')) as unknown,
          )
          this.legacyImported = true
        }
        this.save()
      }
    } catch (error) {
      this.database.close()
      throw error
    }
  }

  private ensureOpen(): void {
    if (this.closed) throw new Error('SQLite 状态库已关闭')
  }

  get<T>(table: string, key: string): T | undefined {
    this.ensureOpen()
    return Object.hasOwn(this.tables, table) &&
      Object.hasOwn(this.tables[table]!, key)
      ? (this.tables[table]![key] as T)
      : undefined
  }

  values<T>(table: string): T[] {
    this.ensureOpen()
    return Object.hasOwn(this.tables, table)
      ? (Object.values(this.tables[table]!) as T[])
      : []
  }

  set<T>(table: string, key: string, value: T): void {
    this.ensureOpen()
    if (!Object.hasOwn(this.tables, table))
      this.tables[table] = Object.create(null) as Record<string, unknown>
    this.tables[table]![key] = value
  }

  delete(table: string, key: string): void {
    this.ensureOpen()
    if (Object.hasOwn(this.tables, table)) delete this.tables[table]![key]
  }

  snapshot(): Tables {
    this.ensureOpen()
    return structuredClone(this.tables)
  }

  restore(snapshot: Tables): void {
    this.ensureOpen()
    this.tables = normalizeTables(structuredClone(snapshot))
  }

  reset(): void {
    this.ensureOpen()
    this.tables = emptyTables()
  }

  save(): void {
    this.ensureOpen()
    // 先完成全部序列化，非法 JSON 值不会引起部分记录落库。
    const serialized = serializeTables(this.tables)
    const changes =
      !this.initialized ||
      serialized.size !== this.committed.size ||
      [...serialized].some(([bucket, records]) => {
        const previous = this.committed.get(bucket)
        return (
          !previous ||
          records.size !== previous.size ||
          [...records].some(([key, value]) => previous.get(key) !== value)
        )
      })
    if (!changes) return
    const now = new Date().toISOString()
    let nextOrdinal = this.nextOrdinal
    let nextRevision = this.nextRevision
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const addBucket = this.database.prepare(
        'INSERT OR IGNORE INTO buckets(name) VALUES (?)',
      )
      const removeBucket = this.database.prepare(
        'DELETE FROM buckets WHERE name = ?',
      )
      const removeRecord = this.database.prepare(
        'DELETE FROM records WHERE bucket = ? AND key = ?',
      )
      const insert = this.database.prepare(`
        INSERT INTO records(bucket, key, value, revision, created_at, updated_at, ordinal)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      const update = this.database.prepare(`
        UPDATE records SET value = ?, revision = ?, updated_at = ?
        WHERE bucket = ? AND key = ?
      `)
      const metadata = this.database.prepare(`
        INSERT INTO storage_meta(key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `)
      for (const bucket of this.committed.keys())
        if (!serialized.has(bucket)) removeBucket.run(bucket)
      for (const [bucket, records] of serialized) {
        const previous = this.committed.get(bucket)
        if (!previous) addBucket.run(bucket)
        for (const key of previous?.keys() ?? [])
          if (!records.has(key)) removeRecord.run(bucket, key)
        for (const [key, value] of records) {
          if (!previous?.has(key))
            insert.run(
              bucket,
              key,
              value,
              ++nextRevision,
              now,
              now,
              ++nextOrdinal,
            )
          else if (previous.get(key) !== value)
            update.run(value, ++nextRevision, now, bucket, key)
        }
      }
      metadata.run('next_ordinal', String(nextOrdinal))
      metadata.run('next_revision', String(nextRevision))
      if (!this.initialized) {
        metadata.run('schema_version', String(schemaVersion))
        metadata.run('initialized', 'true')
        metadata.run('legacy_imported', String(this.legacyImported))
      }
      this.database.exec('COMMIT')
      this.committed = serialized
      this.nextOrdinal = nextOrdinal
      this.nextRevision = nextRevision
      this.initialized = true
    } catch (error) {
      if (this.database.isTransaction) this.database.exec('ROLLBACK')
      throw error
    }
  }

  info(): {
    engine: 'sqlite'
    mode: 'memory' | 'file'
    path: string | null
    schemaVersion: number
    sqliteVersion: string
    journalMode: string
    legacyImported: boolean
    recordCount: number
  } {
    this.ensureOpen()
    const version = this.database
      .prepare('SELECT sqlite_version() AS value')
      .get() as { value: string }
    const journal = this.database.prepare('PRAGMA journal_mode').get() as {
      journal_mode: string
    }
    const count = this.database
      .prepare('SELECT count(*) AS value FROM records')
      .get() as { value: number }
    return {
      engine: 'sqlite',
      mode: this.file ? 'file' : 'memory',
      path: this.file,
      schemaVersion,
      sqliteVersion: version.value,
      journalMode: journal.journal_mode,
      legacyImported: this.legacyImported,
      recordCount: count.value,
    }
  }

  listBuckets(): { name: string; count: number }[] {
    this.ensureOpen()
    const rows = this.database
      .prepare(
        `
        SELECT buckets.name, count(records.key) AS count
        FROM buckets LEFT JOIN records ON records.bucket = buckets.name
        GROUP BY buckets.name ORDER BY buckets.name
      `,
      )
      .all() as { name: string; count: number }[]
    return rows.map(({ name, count }) => ({ name, count }))
  }

  page(
    bucket: string,
    options: PageOptions = {},
  ): { items: StoredRecord[]; total: number; page: number; pageSize: number } {
    this.ensureOpen()
    const page = options.page ?? 1
    const pageSize = options.pageSize ?? 20
    if (!Number.isSafeInteger(page) || page < 1)
      throw new Error('page 必须是正整数')
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 200)
      throw new Error('pageSize 必须是 1 至 200 的整数')
    const offset = (page - 1) * pageSize
    if (!Number.isSafeInteger(offset)) throw new Error('分页偏移量过大')
    const search = options.search ?? ''
    if (typeof search !== 'string') throw new Error('search 必须是字符串')
    const filter =
      "bucket = ? AND (? = '' OR instr(key, ?) > 0 OR instr(value, ?) > 0)"
    const parameters = [bucket, search, search, search]
    const count = this.database
      .prepare(`SELECT count(*) AS value FROM records WHERE ${filter}`)
      .get(...parameters) as { value: number }
    const rows = this.database
      .prepare(
        `
        SELECT key, value, revision, created_at, updated_at
        FROM records WHERE ${filter} ORDER BY ordinal LIMIT ? OFFSET ?
      `,
      )
      .all(...parameters, pageSize, offset) as unknown as RecordRow[]
    return { items: rows.map(storedRecord), total: count.value, page, pageSize }
  }

  record(bucket: string, key: string): StoredRecord | undefined {
    this.ensureOpen()
    const row = this.database
      .prepare(
        `
        SELECT key, value, revision, created_at, updated_at
        FROM records WHERE bucket = ? AND key = ?
      `,
      )
      .get(bucket, key) as unknown as RecordRow | undefined
    return row ? storedRecord(row) : undefined
  }

  close(): void {
    if (this.closed) return
    this.save()
    this.database.close()
    this.closed = true
  }
}
