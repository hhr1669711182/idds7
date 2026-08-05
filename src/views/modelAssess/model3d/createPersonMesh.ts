/*
 * @Description: 程序化生成 3D 人形 mesh（替换原 BoxGeometry 占位）
 * @FilePath: \ids-gis-web\src\views\modelAssess\model3d\createPersonMesh.ts
 */
import * as THREE from 'three'

/**
 * 程序化生成"受困人员"人形 mesh
 * 头（球） + 身体（圆柱） + 四肢（圆锥）
 * @param color 主体颜色（默认红色）
 */
export function createPersonMesh(color: number = 0xff3030): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: 0x551100,
    emissiveIntensity: 0.6,
    roughness: 0.6,
  })
  const matDark = new THREE.MeshStandardMaterial({
    color: 0xcc1010,
    emissive: 0x441111,
    emissiveIntensity: 0.4,
  })

  // 头
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), mat)
  head.position.y = 0.22
  g.add(head)

  // 身体（躯干）
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.12, 10), mat)
  body.position.y = 0.14
  g.add(body)

  // 左臂
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6), matDark)
  armL.position.set(-0.05, 0.14, 0)
  armL.rotation.z = Math.PI / 12
  g.add(armL)

  // 右臂
  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6), matDark)
  armR.position.set(0.05, 0.14, 0)
  armR.rotation.z = -Math.PI / 12
  g.add(armR)

  // 左腿
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 6), matDark)
  legL.position.set(-0.025, 0.04, 0)
  g.add(legL)

  // 右腿
  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 6), matDark)
  legR.position.set(0.025, 0.04, 0)
  g.add(legR)

  // 警示红光（绕身体一圈的薄环）
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.06, 0.005, 6, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd700 }),
  )
  ring.position.y = 0.1
  ring.rotation.x = Math.PI / 2
  g.add(ring)

  g.userData = { type: 'person' }
  return g
}
