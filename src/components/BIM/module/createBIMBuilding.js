import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { assetUrls } from '@/const/assetPaths'

export function load3DBuilding(buildingsGroup) {
  const loader = new GLTFLoader()
  loader.load(assetUrls.buildingGltf, function (gltf) {
    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        child.material.metalness = 0
        //child.material.roughness=0
      }
    })
    const model = gltf.scene
    model.scale.setScalar(0.01)
    const box = new THREE.Box3().setFromObject(model)
    let center = box.getCenter(new THREE.Vector3())
    center.x -= 3.3
    center.y -= 0.7
    center.z -= 1.7
    //model.scale.set(0.1, 0.1, 0.1); // 缩放模型（根据实际大小调整）
    model.position.sub(center)
    //model.position.set(5, 0, 0); // 模型居中
    buildingsGroup.add(gltf.scene)
  })
}
