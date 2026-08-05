/*
 * @Author: hhr
 * @Date: 2026-04-22 18:31:47
 * @LastEditTime: 2026-04-22 19:01:08
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\hooks\useEncryptedStorage.ts
 */
import { CryptoSuite } from '@/plugins/crypto'

export type PersistStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear' | 'key' | 'length'>

export interface EncryptedPersistStorageOptions {
  secretKey: string
  storage?: Storage
  prefix?: string
  removeOnError?: boolean
}

export const createEncryptedPersistStorage = (options: EncryptedPersistStorageOptions): PersistStorage => {
  const {
    secretKey,
    storage = typeof window === 'undefined' ? new MapStorage() : window.localStorage,
    prefix = '',
    removeOnError = true,
  } = options

  if (!secretKey) throw new Error('[createEncryptedPersistStorage] secretKey is required')

  const crypto = new CryptoSuite({ alg: 'AES', key: secretKey, keyType: 'passphrase', output: 'openssl' })
  const k = (key: string) => `${prefix}${key}`

  const decryptOrNull = (key: string, encrypted: string) => {
    try {
      return crypto.decrypt(encrypted)
    } catch {
      if (removeOnError) storage.removeItem(k(key))
      return null
    }
  }

  return {
    get length() {
      return storage.length
    },

    clear() {
      if (!prefix) {
        storage.clear()
        return
      }
      const keys: string[] = []
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key && key.startsWith(prefix)) keys.push(key)
      }
      keys.forEach((key) => storage.removeItem(key))
    },

    getItem(key: string) {
      const encrypted = storage.getItem(k(key))
      if (!encrypted) return null
      return decryptOrNull(key, encrypted)
    },

    key(index: number) {
      return storage.key(index)
    },

    removeItem(key: string) {
      storage.removeItem(k(key))
    },

    setItem(key: string, value: string) {
      storage.setItem(k(key), crypto.encrypt(value))
    },
  }
}

class MapStorage implements Storage {
  private map = new Map<string, string>()

  get length() {
    return this.map.size
  }

  clear(): void {
    this.map.clear()
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null
  }

  key(index: number): string | null {
    const keys = Array.from(this.map.keys())
    return keys[index] ?? null
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
}
