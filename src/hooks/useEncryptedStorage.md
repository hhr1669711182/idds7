# Pinia 加密持久化存储

文件： [useEncryptedStorage.ts](file:///d:/work/telewave/ids/ids-gis-web/src/hooks/useEncryptedStorage.ts)

该文件提供 `createEncryptedPersistStorage`，用于 `pinia-plugin-persistedstate` 的 `persist.storage`。

## 典型用法（store 内）

```ts
import { defineStore } from 'pinia'
import { createEncryptedPersistStorage } from '@/hooks/useEncryptedStorage'

const encryptedStorage = createEncryptedPersistStorage({
  secretKey: import.meta.env.VITE_PERSIST_SECRET_KEY || 'dispatch-model-map',
  prefix: 'PINIA:',
})

export const useDemoStore = defineStore('demo', () => {
  return { a: 1 }
}, {
  persist: {
    storage: encryptedStorage,
  },
})
```

## 配置项

```ts
createEncryptedPersistStorage({
  secretKey: string,
  storage?: Storage,
  prefix?: string,
  removeOnError?: boolean,
})
```

- `secretKey`：必填；AES(passphrase) 的密钥（用于加密 pinia 序列化后的字符串）
- `storage`：默认 `localStorage`
- `prefix`：用于隔离 key（多项目/多环境共用浏览器存储时很实用）
- `removeOnError`：解密失败是否自动移除对应 key（默认 `true`）
