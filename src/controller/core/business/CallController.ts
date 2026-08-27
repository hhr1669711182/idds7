/*
 * @Author: hhr
 * @Date: 2026-07-01 11:11:28
 * @LastEditTime: 2026-08-27 17:48:45
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\controller\core\business\CallController.ts
 */
import { offset } from 'ol/sphere';
import type { GenericController } from '../generic';
import type { LocateCallData, LocateCallRemoveData, AoiEsQueryData, AoiEsGisZoneData } from '../protocol';

export class CallController {
  constructor(private genericController: GenericController) { }

  /**
   * [EC-03] 来电初略定位
   */
  public locateCall(data: LocateCallData) {
    const { view, geometry, spatial } = this.genericController;

    // view.locate({
    //   lngLat: [data.longitude, data.latitude],
    //   zoom: 18,
    //   duration: 500
    // });
    const buffer = spatial.calcBuffer({
      input: {
        center: [data.longitude, data.latitude],
        radius: data.radius
      }
    });



    geometry.drawPolygon({
      id: data.id,
      geometry: buffer,
      fillColor: 'rgba(0, 100, 255, 0.2)',
      strokeColor: 'rgba(0, 100, 255, 1)'
    });

    geometry.addMarker({
      id: data.id,
      lngLat: [data.longitude, data.latitude],
      iconType: 'point',
      animate: 'breathe'
    });

    data.Carrier_Loc && geometry.addText({
      id: data.id,
      lngLat: [data.longitude, data.latitude],
      arg: {
        offsetY: 30,
      },
      text: data.Carrier_Loc,
    })

    view.fitBounds({
      geometry: buffer,
      // padding: [50, 50, 50, 50]
    });
  }

  /**
   * [EC-04] 来电挂断移除
   */
  public locateCallRemove(data: LocateCallRemoveData) {
    const { geometry } = this.genericController;
    geometry.removeFeature({
      featureIds: [data.id]
    });
  }

  /**
   * [WC-02] 围栏集合 AOI 定位高亮资源
   */
  public async aoiEsQuery(data: AoiEsQueryData) {
    const { spatial, geometry } = this.genericController;
    const result = await spatial.esQuery({
      geometry: { type: 'Polygon', coordinates: [data.points] },
      types: data.layerNames,
      limit: 100
    });

    // 假设检索后返回多个资源点，在地图上标绘高亮
    if (result && Array.isArray(result)) {
      result.forEach((item: any, index: number) => {
        geometry.addMarker({
          id: `aoi_res_${index}`,
          lngLat: [item.longitude, item.latitude],
        });
      });
    }
  }

  /**
   * [WC-03] 根据辖区队站围栏ID反查围栏集合数据
   */
  public async aoiEsGisZone(data: AoiEsGisZoneData) {
    const { view, geometry } = this.genericController;

    // 模拟根据 ID 获取围栏 GeoJSON
    const mockZoneGeoJson: any = {
      type: 'Polygon',
      coordinates: [[[113.9, 22.5], [114.0, 22.5], [114.0, 22.6], [113.9, 22.6], [113.9, 22.5]]]
    };

    // 1. 围栏辖区高亮
    geometry.drawPolygon({
      id: `zone_${data.zoneId}`,
      geometry: mockZoneGeoJson,
      fillColor: 'rgba(0, 100, 255, 0.2)',
      strokeColor: 'rgba(0, 100, 255, 1)'
    });

    // 2. 视口自适应定位到该围栏
    view.fitBounds({
      geometry: mockZoneGeoJson,
      padding: [50, 50, 50, 50]
    });
  }
}