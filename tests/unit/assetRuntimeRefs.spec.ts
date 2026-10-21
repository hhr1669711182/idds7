import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * B2 迁移守卫：运行期资源路径必须来自 @/const/assetPaths，
 * 代码里不得再出现 '/model3d/…' 与 'fonts/…' 这类裸字面量。
 *
 * 该用例直接扫源码（而非运行时断言），因为回归的表现形式就是「字面量重新出现」，
 * 靠 import 某个模块测不出来。
 */
const SRC_ROOT = join(process.cwd(), 'src')

const CODE_EXTENSIONS = ['.ts', '.js', '.vue', '.tsx', '.jsx']

const walk = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'dist-lib'].includes(entry.name)) continue
      out.push(...walk(abs))
    } else if (entry.isFile() && CODE_EXTENSIONS.includes(abs.slice(abs.lastIndexOf('.')))) {
      out.push(abs)
    }
  }
  return out
}

/** 允许存在的字面量：常量层自身的分类前缀定义（迁移目标路径，不是遗留旧路径）。 */
const isAllowedInConstantLayer = (relPath: string) => relPath === 'const/assetPaths.ts'

describe('B2 运行期资源引用迁移守卫', () => {
  it('src 下不存在 /model3d/ 裸字面量（旧 public 目录硬编码）', () => {
    const offenders: string[] = []
    for (const abs of walk(SRC_ROOT)) {
      const content = readFileSync(abs, 'utf8')
      // 只匹配资源扩展名，避免误伤 '../model3d/xxx' 这类相对导入路径
      if (!/\/model3d\/[\w./-]+\.(?:glb|gltf|obj|png|jpg|bin|json)/.test(content)) continue
      const relPath = abs.slice(SRC_ROOT.length + 1).split('\\').join('/')
      if (isAllowedInConstantLayer(relPath)) continue
      offenders.push(relPath)
    }
    expect(offenders).toEqual([])
  })

  it('src 下不存在 fonts/xxx.typeface.json 裸字面量', () => {
    const offenders: string[] = []
    for (const abs of walk(SRC_ROOT)) {
      const content = readFileSync(abs, 'utf8')
      if (!/\bfonts\/[\w.-]+\.json/.test(content)) continue
      const relPath = abs.slice(SRC_ROOT.length + 1).split('\\').join('/')
      if (isAllowedInConstantLayer(relPath)) continue
      offenders.push(relPath)
    }
    expect(offenders).toEqual([])
  })

  it('assetUrls 已登记全部实际在用的 3D 模型（防止新增模型忘记登记）', () => {
    const assetPaths = readFileSync(join(SRC_ROOT, 'const', 'assetPaths.ts'), 'utf8')
    const registered = new Set(
      Array.from(assetPaths.matchAll(/\b(\w+):\s*`\$\{ASSET_CATEGORY\.\w+\}([^`]+)`/g)).map(
        (m) => m[2],
      ),
    )

    // public/model3d 下被代码加载过的模型文件（不含 gltf 贴图依赖与零引用的 fire_truck2）
    const usedInPublic = [
      'xf_fire_truck.glb',
      'xf_firefighter.glb',
      'xf_fire_hydrant.obj',
      'xf_extinguisher.glb',
      'xf_trapped_man.glb',
      'xf_smoke.png',
      'xf_zddw.png',
      'xf_entrance.png',
      'B370921843501063A0.gltf',
    ]

    const missing = usedInPublic.filter((name) => !registered.has(name))
    expect(missing).toEqual([])
  })

  it('fontLoader 字体清单已合一为单一来源，不存在两份重复定义', () => {
    const fontListFiles = walk(SRC_ROOT).filter((abs) => abs.endsWith('fontLoader.vue'))
    const legacyFontLoaders = fontListFiles.filter(
      (abs) => readFileSync(abs, 'utf8').includes('typeface.json'),
    )
    expect(legacyFontLoaders).toEqual([])
  })
})

