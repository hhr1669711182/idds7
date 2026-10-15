import { describe, expect, it } from 'vitest'
import Observable from 'ol/Observable.js'
import type Map from 'ol/Map'
import { waitForBaseMap } from '@/baseComponent/OpenlayersMap/startup'

describe('OpenlayersMap/startup 底图就绪', () => {
  it('底图渲染完成即释放启动监听（不得残留监听器）', async () => {
    const map = new Observable()
    const startup = waitForBaseMap(map as unknown as Map)
    map.dispatchEvent('rendercomplete')
    await startup.ready
    expect(map.hasListener('rendercomplete')).toBe(false)
  })

  it('瓦片不可用时超时兜底不阻塞业务初始化', async () => {
    const map = new Observable()
    await waitForBaseMap(map as unknown as Map, 5).ready
    expect(map.hasListener('rendercomplete')).toBe(false)
  })

  it('卸载时取消启动并释放监听（重复 cancel 幂等）', async () => {
    const map = new Observable()
    const startup = waitForBaseMap(map as unknown as Map)
    startup.cancel()
    startup.cancel()
    await startup.ready
    expect(map.hasListener('rendercomplete')).toBe(false)
  })
})