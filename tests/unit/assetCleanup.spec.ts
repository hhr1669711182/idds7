import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 资源清理守卫：只保护运行期资源不被误删，不锁死「哪些文件该被删除」。
 *
 * 背景见 herness/02-技术设计/前端/资源文件管理-技术方案.md §7。
 *
 * ⚠️ 2026-10-19 修订：初版把「已删除文件清单」硬编码成断言，人工恢复其中若干文件后
 * 用例立即失败 —— 等于用测试绑架删除决策。
 * 教训：**「代码零引用」不足以判定资源可删**。瓦片/影像类资源由地图引擎按 URL 加载，
 * 不出现在 import 图里；「零引用」只对纯 UI 贴图成立。
 * 现改为只守护真正不可逆的底线。
 */
const root = process.cwd()

describe('资源清理守卫（只守底线，不锁死删除清单）', () => {
  it('public/model3d 下被代码加载的模型仍在（不得误删运行期资源）', () => {
    const mustKeep = [
      'public/model3d/xf_fire_truck.glb',
      'public/model3d/xf_firefighter.glb',
      'public/model3d/xf_fire_hydrant.obj',
      'public/model3d/xf_extinguisher.glb',
      'public/model3d/xf_trapped_man.glb',
      'public/model3d/xf_smoke.png',
      'public/model3d/xf_zddw.png',
      'public/model3d/xf_entrance.png',
    ]
    const missing = mustKeep.filter((p) => !existsSync(join(root, p)))
    expect(missing).toEqual([])
  })

  it('gltf 及其贴图依赖整组保留（相对 uri 依赖，不可单独删除）', () => {
    const gltfGroup = [
      'public/model3d/gltf/B370921843501063A0.gltf',
      'public/model3d/gltf/B370921843501063A0.bin',
      ...Array.from({ length: 12 }, (_, i) =>
        join('public', 'model3d', 'gltf', `B370921843501063A0_${String(i + 1).padStart(3, '0')}.jpg`),
      ),
    ]
    const missing = gltfGroup.filter((p) => !existsSync(join(root, p)))
    expect(missing).toEqual([])
  })

  it('three.js 字体整组保留（字体清单由 assetPaths.FONT_OPTIONS 引用）', () => {
    const fonts = [
      ...['gentilis_bold', 'gentilis_regular', 'helvetiker_bold', 'helvetiker_regular', 'optimer_bold', 'optimer_regular'].map(
        (name) => join('public', 'fonts', `${name}.typeface.json`),
      ),
      // 中文字体后缀是 .json 而非 .typeface.json
      join('public', 'fonts', 'YEFONTDianYingPangBaiTi_Regular.json'),
    ]
    const missing = fonts.filter((p) => !existsSync(join(root, p)))
    expect(missing).toEqual([])
  })

  it('免编译资源仍在（App.vue fetch sprite、index.html favicon）', () => {
    const mustKeep = ['public/icons.svg', 'public/tw.svg']
    const missing = mustKeep.filter((p) => !existsSync(join(root, p)))
    expect(missing).toEqual([])
  })
})