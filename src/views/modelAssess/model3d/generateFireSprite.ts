/*
 * @Description: 火焰 / 烟雾精灵（与 BIM 同名文件完全独立）
 * @FilePath: \ids-gis-web\src\views\modelAssess\model3d\generateFireSprite.ts
 */
import * as THREE from 'three'

/** 通过径向渐变 Canvas 生成贴图 */
function makeRadialTexture(innerColor: string, outerColor: string): THREE.Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, innerColor)
  grad.addColorStop(0.5, outerColor)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

/** 缓存贴图避免重复创建 */
let fireTexture: THREE.Texture | null = null
let smokeTexture: THREE.Texture | null = null

function getFireTexture(): THREE.Texture {
  if (!fireTexture) {
    fireTexture = makeRadialTexture('rgba(255,220,80,1)', 'rgba(255,60,0,0.8)')
  }
  return fireTexture
}
function getSmokeTexture(): THREE.Texture {
  if (!smokeTexture) {
    smokeTexture = makeRadialTexture('rgba(180,180,180,0.9)', 'rgba(80,80,80,0.5)')
  }
  return smokeTexture
}

/**
 * 在主建筑顶部的某个高度生成火焰精灵
 * @param group 父级 Group
 * @param heightY y 坐标（场景中的高度）
 */
export function createFireSprite(group: THREE.Group, heightY: number): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: getFireTexture(),
    transparent: true,
    depthWrite: false,
    color: 0xffffff,
  })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(0.6, 0.8, 1)
  sprite.position.set(0, heightY, 0)
  sprite.userData = { type: 'fire' }
  group.add(sprite)
  return sprite
}

/**
 * 在主建筑顶部生成多个烟雾精灵
 * @param level '轻度 (Light)' | '中度 (Medium)' | '重度 (Heavy)'
 * @param heightY y 坐标
 */
export function createSmokeSprites(
  group: THREE.Group,
  level: string,
  heightY: number,
): THREE.Sprite[] {
  const map: Record<string, { count: number; opacity: number; size: number }> = {
    '轻度 (Light)': { count: 2, opacity: 0.35, size: 0.5 },
    '中度 (Medium)': { count: 4, opacity: 0.55, size: 0.7 },
    '重度 (Heavy)': { count: 6, opacity: 0.8, size: 0.95 },
  }
  const cfg = map[level] || map['中度 (Medium)']
  const sprites: THREE.Sprite[] = []
  for (let i = 0; i < cfg.count; i++) {
    const mat = new THREE.SpriteMaterial({
      map: getSmokeTexture(),
      transparent: true,
      depthWrite: false,
      opacity: cfg.opacity,
    })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(cfg.size, cfg.size, 1)
    // 在主建筑上方稍微散开
    const angle = (i / cfg.count) * Math.PI * 2
    sprite.position.set(Math.cos(angle) * 0.2, heightY + 0.5, Math.sin(angle) * 0.2)
    sprite.userData = { type: 'smoke' }
    group.add(sprite)
    sprites.push(sprite)
  }
  return sprites
}
