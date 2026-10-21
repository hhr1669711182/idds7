import { describe, expect, it } from 'vitest'
import { assetUrls, ASSET_CATEGORY, withAssetBase } from '@/const/assetPaths'

/**
 * 资源路径常量层契约：
 * 运行期资源（3D 模型 / 字体）的 URL 只能来自 assetUrls，禁止代码内裸写 '/model3d/xxx'。
 * 所有 URL 必须带 BASE 前缀，兼容应用形态（'./'）与库形态（'/'，宿主可能挂在子路径）。
 */
describe('const/assetPaths 资源路径常量层', () => {
  it('BASE 归一：无论 vite base 是 "./" 还是 "/"，withAssetBase 都产出以 / 开头、以 / 结尾的稳定前缀', () => {
    expect(withAssetBase('./')).toBe('/')
    expect(withAssetBase('/')).toBe('/')
    expect(withAssetBase('/ids-gis/')).toBe('/ids-gis/')
    expect(withAssetBase('./sub/')).toBe('/sub/')
    expect(withAssetBase('')).toBe('/')
  })

  it('withAssetBase 保留子路径且不产生双斜杠', () => {
    expect(withAssetBase('/ids-gis/', 'assets/models/xf_fire_truck.glb')).toBe(
      '/ids-gis/assets/models/xf_fire_truck.glb',
    )
    expect(withAssetBase('/', 'assets/models/xf_fire_truck.glb')).toBe('/assets/models/xf_fire_truck.glb')
  })

  it('分类前缀均以 / 开头、/ 结尾，便于直接拼文件名', () => {
    for (const prefix of Object.values(ASSET_CATEGORY)) {
      expect(prefix.startsWith('/')).toBe(true)
      expect(prefix.endsWith('/')).toBe(true)
      expect(prefix).not.toContain('//')
    }
  })

  it('已登记的 3D 模型 URL 均指向当前真实路径 public/model3d/', () => {
    expect(assetUrls.fireTruck).toMatch(/\/model3d\/xf_fire_truck\.glb$/)
    expect(assetUrls.fireFighter).toMatch(/\/model3d\/xf_firefighter\.glb$/)
    expect(assetUrls.buildingGltf).toMatch(/\/model3d\/B370921843501063A0\.gltf$/)
  })

  it('已登记字体 URL 均指向当前真实路径 public/fonts/', () => {
    expect(assetUrls.fontGentilisBold).toMatch(/\/fonts\/gentilis_bold\.typeface\.json$/)
    expect(assetUrls.fontGentilisRegular).toMatch(/\/fonts\/gentilis_regular\.typeface\.json$/)
  })

  it('免编译 sprite 走 public 路径，同样受 BASE 约束', () => {
    expect(assetUrls.spriteIcons).toBe(withAssetBase('', 'icons.svg'))
  })
})
