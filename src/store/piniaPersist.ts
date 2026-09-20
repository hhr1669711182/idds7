/**
 * Pinia 持久化存储适配层
 *
 * 与 utils/storage 的 storage 走独立前缀 (`pinia:`)，避免 Pinia 内部 JSON.stringify
 * 与 storage 的 JSON 编解码叠加造成双重编码。
 *
 * 接口形态：Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>，同步。
 * Pinia 调用时会以异步方式消费这里的返回值（返回 string | null 即合规）。
 */
const make = (
  driver: 'local' | 'session',
  ns = 'pinia',
): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
  const s = globalThis[`${driver}Storage`] as Storage
  const prefix = `${ns}:`
  return {
    getItem: (k: string) => s.getItem(prefix + k),
    setItem: (k: string, v: string) => { s.setItem(prefix + k, v) },
    removeItem: (k: string) => { s.removeItem(prefix + k) },
  }
}

export const piniaLocal = make('local')
export const piniaSession = make('session')