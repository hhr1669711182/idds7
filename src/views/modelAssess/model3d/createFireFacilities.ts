/*
 * @Description: 消防车 / 消防栓 / 消防员（与 BIM 同名文件完全独立）
 * @FilePath: \ids-gis-web\src\views\modelAssess\model3d\createFireFacilities.ts
 */
import * as THREE from 'three'
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js'
import { loadGLTF, loadOBJ, lonLatToLocalCoord, buildMockHydrants } from './commonThree'
import { maModelSetting } from './commonSetting'

/**
 * 加载消防车（GLB）
 * 失败时降级为 BoxGeometry 占位
 */
export async function loadFireTruck(
  buildingsGroup: THREE.Group,
  coor: [number, number],
): Promise<THREE.Object3D> {
  try {
    const gltf = await loadGLTF(`${maModelSetting.assetBase}/xf_fire_truck.glb`)
    const model = gltf.scene as THREE.Object3D
    model.scale.setScalar(0.06)
    const localCoord = lonLatToLocalCoord(coor[0], coor[1], true) as THREE.Vector3
    model.position.set(localCoord.x, localCoord.y, localCoord.z)
    model.userData = { type: 'fireTruck', name: '消防车' }
    buildingsGroup.add(model)
    return model
  } catch (e) {
    // 降级占位
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.1, 0.08),
      new THREE.MeshLambertMaterial({ color: 0xd22 }),
    )
    const localCoord = lonLatToLocalCoord(coor[0], coor[1], true) as THREE.Vector3
    mesh.position.set(localCoord.x, 0.05, localCoord.z)
    mesh.userData = { type: 'fireTruck', name: '消防车' }
    buildingsGroup.add(mesh)
    return mesh
  }
}

/**
 * 加载消防员（GLB，含动画）
 */
export async function loadFireFighter(buildingsGroup: THREE.Group): Promise<THREE.AnimationMixer | null> {
  try {
    const gltf = await loadGLTF(`${maModelSetting.assetBase}/xf_firefighter.glb`)
    const model = gltf.scene
    model.scale.setScalar(0.1)
    model.position.set(0.3, 0, -0.6)
    model.userData = { type: 'firefighter' }
    buildingsGroup.add(model)
    const mixer = new THREE.AnimationMixer(model)
    if (gltf.animations.length > 0) {
      mixer.clipAction(gltf.animations[0]).play()
    }
    return mixer
  } catch {
    return null
  }
}

/**
 * 加载市政消防栓（OBJ + InstancedMesh）
 * 失败时降级为程序化红球
 */
export async function loadFireHydrant(buildingsGroup: THREE.Group): Promise<void> {
  const features = buildMockHydrants()
  try {
    const object = await loadOBJ(`${maModelSetting.assetBase}/xf_fire_hydrant.obj`)
    const allGeometries: THREE.BufferGeometry[] = []
    object.traverse((child: THREE.Object3D) => {
      if ((child as THREE.Mesh).isMesh) {
        allGeometries.push((child as THREE.Mesh).geometry)
      }
    })
    const merged = BufferGeometryUtils.mergeGeometries(allGeometries)!
    const scale = 0.002
    merged.scale(scale, scale, scale)
    merged.rotateX(-Math.PI / 2)

    const instMesh = new THREE.InstancedMesh(
      merged,
      new THREE.MeshLambertMaterial({ color: 0xff2222 }),
      features.length,
    )
    instMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    const matrix = new THREE.Matrix4()
    features.forEach((item, idx) => {
      const localCoord = lonLatToLocalCoord(item.coordinates[0], item.coordinates[1]) as THREE.Vector2
      matrix.setPosition(localCoord.x, 0, -localCoord.y)
      instMesh.setMatrixAt(idx, matrix)
    })
    instMesh.userData = { type: 'hydrant' }
    buildingsGroup.add(instMesh)
  } catch {
    // 降级：红色小球 + 标签
    const fallbackGroup = new THREE.Group()
    features.forEach((f) => {
      const localCoord = lonLatToLocalCoord(f.coordinates[0], f.coordinates[1]) as THREE.Vector2
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }),
      )
      sphere.position.set(localCoord.x, 0.05, -localCoord.y)
      sphere.userData = { type: 'hydrant', name: f.name }
      fallbackGroup.add(sphere)

      // 简易 Canvas 标签
      const label = makeTextSprite(f.name, '#ff2222')
      label.position.set(localCoord.x, 0.18, -localCoord.y)
      fallbackGroup.add(label)
    })
    buildingsGroup.add(fallbackGroup)
  }
}

/**
 * 简易文字精灵（用于消防栓 / 楼层标签）
 */
export function makeTextSprite(text: string, color = '#ffffff', bg = 'rgba(0,0,0,0.6)'): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = color
  ctx.font = 'bold 32px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)
  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(0.4, 0.2, 1)
  return sprite
}
