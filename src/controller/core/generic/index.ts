/*
 * @Author: hhr
 * @Date: 2026-07-01 11:10:20
 * @LastEditTime: 2026-09-14 17:53:12
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\controller\core\generic\index.ts
 */
import { markRaw } from 'vue'
import OlMap from 'ol/Map'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'

import { ViewController } from './ViewController'
import { GeometryController } from './GeometryController'
import { SpatialController } from './SpatialController'
import { KinematicController } from './KinematicController'

export class GenericController {
  public view: ViewController
  public geometry: GeometryController
  public spatial: SpatialController
  public kinematic: KinematicController

  private tempVectorLayer: VectorLayer<VectorSource>

  constructor(private map: OlMap) {
    this.tempVectorLayer = markRaw(
      new VectorLayer({
        source: new VectorSource(),
        zIndex: 999,
        properties: { name: 'generic_temp_layer' },
      }),
    )
    this.map.addLayer(this.tempVectorLayer)

    this.view = new ViewController(this.map)
    this.geometry = new GeometryController(this.map, this.tempVectorLayer)
    this.spatial = new SpatialController(this.map)
    this.kinematic = new KinematicController(this.map)
  }

  // TODO(huanghuanrong, 2026-12-11, GIS-W46): 给机器人临时开放的图层增删查不在通用控制层职责内 —— 应收进 AddressRobotRenderer 自己的图层管理 —— 到期未迁则从 GenericController 移除
  public addLayer(layer: VectorLayer<VectorSource>) {
    this.map.addLayer(layer)
  }

  /** TODO(huanghuanrong, 2026-12-11, GIS-W46): 同 addLayer —— 机器人专用图层查询应收进 AddressRobotRenderer —— 到期未迁则移除 */
  public getVectorLayer(name: string) {
    const layers = this.map.getLayers().getArray()
    return layers.find((layer) => layer.get('name') === name) as VectorLayer<VectorSource>
  }

  /** TODO(huanghuanrong, 2026-12-11, GIS-W46): 同 addLayer —— 机器人专用图层移除应收进 AddressRobotRenderer —— 到期未迁则移除 */
  public removeLayer(layer: VectorLayer<VectorSource>) {
    this.map.removeLayer(layer)
  }
}

export * from './ViewController'
export * from './GeometryController'
export * from './SpatialController'
export * from './KinematicController'
