/*
 * @Description: 周边白模建筑（与 BIM 同名文件完全独立）
 * @FilePath: \ids-gis-web\src\views\modelAssess\model3d\createWhiteBuildings.ts
 */
import * as THREE from 'three'
import { lonLatToLocalCoord, buildMockBuildings } from './commonThree'

/**
 * 程序化生成周边白模（直接由 mock 数据创建 ExtrudeGeometry）
 * 复用 BIM 模块的算法思想（轮廓 -> Shape -> Extrude），但数据源来自 commonThree 中的 mock
 */
export function createWhiteBuildings(buildingsGroup: THREE.Group): void {
  const whiteMaterial = new THREE.MeshLambertMaterial({
    color: 0xb8c2d8,
    transparent: true,
    opacity: 0.85,
  })

  const features = buildMockBuildings()

  features.forEach((feature) => {
    const name = feature.properties.shortName
    const height = feature.properties.floor / 18.0
    const coordinates = feature.geometry.coordinates[0]

    const shapePoints: THREE.Vector2[] = []
    coordinates.forEach((coord: number[]) => {
      const [lon, lat] = coord as [number, number]
      const localCoord = lonLatToLocalCoord(lon, lat) as THREE.Vector2
      shapePoints.push(localCoord)
    })

    const shape = new THREE.Shape(shapePoints)
    const extrudeSettings = {
      depth: height,
      bevelEnabled: false,
    }
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings)
    geometry.computeBoundingBox()

    const buildingMesh = new THREE.Mesh(geometry, whiteMaterial)
    buildingMesh.castShadow = true
    buildingMesh.receiveShadow = true
    buildingMesh.rotation.x = -Math.PI / 2
    buildingMesh.userData = { name, height, type: 'whiteBuilding' }
    buildingsGroup.add(buildingMesh)
  })
}
