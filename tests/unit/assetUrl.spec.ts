import { afterEach, describe, expect, it, vi } from 'vitest'
import { isAssetMissing, loadJsonAsset, resolveAssetUrl } from '@/utils/assetUrl'

/**
 * 资源 URL 工具契约：
 * 兜底遗留硬编码路径（R2 迁移期用）、JSON 懒加载失败降级为 null、资源缺失可探测。
 */
describe('utils/assetUrl 资源 URL 工具', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolveAssetUrl：裸相对路径补 BASE，已带 BASE 的原样返回', () => {
    expect(resolveAssetUrl('assets/models/xf_fire_truck.glb')).toBe('/assets/models/xf_fire_truck.glb')
    expect(resolveAssetUrl('/assets/models/xf_fire_truck.glb')).toBe('/assets/models/xf_fire_truck.glb')
  })

  it('resolveAssetUrl：http / data / blob 协议不处理，原样返回', () => {
    expect(resolveAssetUrl('http://192.168.169.58:8090/video/a.mp4')).toBe('http://192.168.169.58:8090/video/a.mp4')
    expect(resolveAssetUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(resolveAssetUrl('blob:http://localhost/abc')).toBe('blob:http://localhost/abc')
  })

  it('resolveAssetUrl：base 为子路径时正确拼接且无双斜杠', () => {
    expect(resolveAssetUrl('assets/models/x.glb', '/ids-gis/')).toBe('/ids-gis/assets/models/x.glb')
    expect(resolveAssetUrl('x.glb', '/ids-gis/')).toBe('/ids-gis/x.glb')
  })

  it('loadJsonAsset：成功时返回解析后的数据', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ city: '深圳市', adcode: '440300' }),
    } as unknown as Response)

    await expect(loadJsonAsset<{ city: string }>('/assets/amap/config/data.json')).resolves.toEqual({
      city: '深圳市',
      adcode: '440300',
    })
  })

  it('loadJsonAsset：HTTP 失败返回 null 而非抛错', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
    } as unknown as Response)

    await expect(loadJsonAsset('/assets/missing.json')).resolves.toBeNull()
  })

  it('loadJsonAsset：JSON 解析失败返回 null，不抛 SyntaxError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token')
      },
    } as unknown as Response)

    await expect(loadJsonAsset('/assets/broken.json')).resolves.toBeNull()
  })

  it('isAssetMissing：200 判为存在，404 与网络异常判为缺失', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 } as unknown as Response)
    await expect(isAssetMissing('/assets/models/x.glb')).resolves.toBe(false)

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404 } as unknown as Response)
    await expect(isAssetMissing('/assets/models/x.glb')).resolves.toBe(true)

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    await expect(isAssetMissing('/assets/models/x.glb')).resolves.toBe(true)
  })
})
