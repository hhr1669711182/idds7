import { describe, expect, it } from 'vitest'
import {
  localAddressDictSource,
  hydrateAddressDict,
  useAddressDict,
  activeAddressDictSource,
} from '@/components/AddressRobotDrawer/dictSource'
import { displayLabels } from '@/components/AddressRobotDrawer/types'

/**
 * 地址机器人字典解析器契约：
 * 本地源直接返回基线；resolve 命中取标签、未命中回退 fallback；
 * hydrate 后本地源下字典保持基线可用（远端失败回落的等价验证点）。
 */
describe('AddressRobotDrawer 字典源', () => {
  it('本地源 load() 返回基线字典', async () => {
    expect(await localAddressDictSource.load()).toBe(displayLabels)
  })

  it('resolve 命中返回标签，未命中返回 fallback', () => {
    const { resolve } = useAddressDict()
    expect(resolve('direction', 'east')).toBe('东')
    expect(resolve('status', 'resolved')).toBe('已命中')
    expect(resolve('direction', '不存在的key')).toBe('—')
    expect(resolve('direction', '不存在的key', '默认方向')).toBe('默认方向')
    expect(resolve('status', undefined)).toBe('—')
  })

  it('hydrate 后本地源下字典仍为基线且解析器可用', async () => {
    expect(activeAddressDictSource).toBe(localAddressDictSource)
    await hydrateAddressDict()
    const { dict, ready } = useAddressDict()
    // ref() 对对象是深拷贝，dict.value 与 displayLabels 结构相等而非同一引用，故用内容相等断言
    expect(dict.value).toEqual(displayLabels)
    expect(ready.value).toBe(true)
    const { resolve } = useAddressDict()
    expect(resolve('anchorType', 'poi')).toBe('POI')
  })
})
