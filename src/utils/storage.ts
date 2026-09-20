/**
 * 统一本地存储工具
 *
 * 设计要点
 * - 全部 API 走 async，跟 IndexedDB 心智模型一致；localStorage 实现仍同步返回（Promise 立即 resolve）
 * - 命名空间隔离：所有 key 自动加前缀，避免与其他系统残留冲突
 * - 自动 JSON 编解码：业务侧 set(T) / get<T>()，不用每次 JSON.stringify
 * - IndexedDB 通过 createStorage(ns, 'idb') 工厂启用，业务侧默认入口 storage 仍是 localStorage
 * - SSR / Node 阶段无 localStorage 时返回 noop，不抛错
 * - 跨标签页事件订阅：subscribe(key, cb)，监听其它 tab 对该 key 的修改
 */

/* ------------------------------ 公共类型 ------------------------------ */

export type StorageDriver = 'local' | 'session' | 'idb'

export interface KVStorage {
  get<T = unknown>(key: string): Promise<T | null>
  set<T = unknown>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  has(key: string): Promise<boolean>
  keys(): Promise<string[]>
  clear(): Promise<void>
}

const encode = (v: unknown): string =>
  typeof v === 'string' ? v : JSON.stringify(v)
const decode = <T = unknown>(raw: string | null): T | null => {
  if (raw === null) return null
  try { return JSON.parse(raw) as T } catch { return raw as unknown as T }
}

/* ------------------------------ localStorage / sessionStorage 实现 ------------------------------ */

interface StorageLike {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
  readonly length: number
  key(i: number): string | null
}

const fallback: StorageLike = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  length: 0,
  key: () => null,
}

const makeLSStorage = (namespace: string, store: Storage | undefined): KVStorage => {
  const prefix = `${namespace}:`
  const fk = (k: string) => prefix + k
  const s: StorageLike = (store as unknown as StorageLike) ?? fallback

  return {
    async get(k)        { return decode(s.getItem(fk(k))) },
    async set(k, v)     { s.setItem(fk(k), encode(v)) },
    async remove(k)     { s.removeItem(fk(k)) },
    async has(k)        { return s.getItem(fk(k)) !== null },
    async keys() {
      const out: string[] = []
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i)
        if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length))
      }
      return out
    },
    async clear() {
      for (let i = s.length - 1; i >= 0; i--) {
        const k = s.key(i)
        if (k && k.startsWith(prefix)) s.removeItem(k)
      }
    },
  }
}

/* ------------------------------ IndexedDB 实现（预留） ------------------------------ */

const IDB_DB_NAME = 'ids-gis'
const IDB_STORE = 'kv'
const IDB_VERSION = 1

const openIDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, IDB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

const idbTx = <T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = db.transaction(IDB_STORE, mode)
    const store = t.objectStore(IDB_STORE)
    const req = fn(store)
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
    t.onabort = () => reject(t.error)
  })

const makeIDBStorage = (namespace: string): KVStorage => {
  const prefix = `${namespace}:`
  const fk = (k: string) => prefix + k
  const dbP = openIDB()

  return {
    async get<T = unknown>(k: string): Promise<T | null> {
      const db = await dbP
      return (await idbTx<unknown>(db, 'readonly', s => s.get(fk(k)))) as T | null
    },
    async set(k, v) {
      const db = await dbP
      await idbTx(db, 'readwrite', s => s.put(v, fk(k)))
    },
    async remove(k) {
      const db = await dbP
      await idbTx(db, 'readwrite', s => s.delete(fk(k)))
    },
    async has(k) {
      const db = await dbP
      const key = await idbTx<IDBValidKey | undefined>(db, 'readonly', s => s.getKey(fk(k)))
      return key !== undefined
    },
    async keys() {
      const db = await dbP
      const all = await idbTx<IDBValidKey[]>(db, 'readonly', s => s.getAllKeys())
      return all
        .filter((k): k is string => typeof k === 'string' && k.startsWith(prefix))
        .map(k => k.slice(prefix.length))
    },
    async clear() {
      const db = await dbP
      await idbTx(db, 'readwrite', s => s.clear())
    },
  }
}

/* ------------------------------ 工厂 + 业务侧入口 ------------------------------ */

export const createStorage = (namespace: string, driver: StorageDriver = 'local'): KVStorage => {
  if (typeof globalThis === 'undefined') {
    return makeLSStorage(namespace, undefined)
  }
  switch (driver) {
    case 'idb':
      return makeIDBStorage(namespace)
    case 'local':
      return makeLSStorage(namespace, globalThis.localStorage)
    case 'session':
      return makeLSStorage(namespace, globalThis.sessionStorage)
  }
}

export const storage = createStorage('app', 'local')

export const STORAGE_KEYS = {
  accessToken: 'access_token',
  userSession: 'session',
  scaleUnit:   'scale_unit',
  mapConfig:   'map_config',
  amapKey:     'AMAP_WEBSERVICE_KEY',
  openTabs:    'OPEN_TABS',
} as const

/* ------------------------------ 跨标签页订阅 ------------------------------ */

export const subscribe = (
  key: string,
  cb: (next: unknown) => void,
  namespace = 'app',
): (() => void) => {
  if (typeof globalThis === 'undefined' || !globalThis.localStorage) return () => {}
  const fullKey = `${namespace}:${key}`
  const handler = (e: StorageEvent) => {
    if (e.key !== fullKey || e.storageArea !== globalThis.localStorage) return
    cb(decode(e.newValue))
  }
  globalThis.addEventListener('storage', handler)
  return () => globalThis.removeEventListener('storage', handler)
}