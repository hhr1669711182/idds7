/*
 * @Author: hhr
 * @Date: 2026-07-08 14:35:45
 * @LastEditTime: 2026-07-08 14:38:15
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\controller\core\business\DispatchController.ts
 */
import { BUFFER_POLYGON_FILL, FIRE_STATION_ICON, ROUTE_LINE_STROKE } from '@/baseComponent/amap/featureStyle';
import type { GenericController } from '../generic';
import type {
  DispatchViewportFitData,
  DispatchResourceQueryHighlightData,
  DispatchRoutePlanData,
  DispatchStationEtaFilterData,
  DispatchRouteToggleData,
} from '../protocol';

const FIRE_STATION_LAYER_ID = 'gis:view_res_org_dept';

export class DispatchController {
  constructor(private genericController: GenericController) { }

  /**
   * [DC-02] 视口（围栏）定位控制
   */
  public dispatchViewportFit(data: DispatchViewportFitData) {
    const { view } = this.genericController;

    if (data.center && data.center.longitude && data.center.latitude) {
      view.locate({
        lngLat: [data.center.longitude, data.center.latitude],
        zoom: 14,
        duration: 800
      });
    }
    if (data.includeStations) {
      view.layerToggle({ layerId: 'fire_station', visible: true });
    }
  }

  /**
   * [DC-03] 围栏检索与资源高亮控制
   */
  public dispatchResourceQueryHighlight(data: DispatchResourceQueryHighlightData) {
    const { spatial, geometry } = this.genericController;

    const bufferGeo = spatial.calcBuffer({
      input: {
        center: [data.center.longitude, data.center.latitude],
        radius: data.radius,
      },
    });

    if (data.highlight && bufferGeo) {
      geometry.drawPolygon({
        id: `buffer_${data.incidentId}`,
        geometry: bufferGeo,
        fillColor: BUFFER_POLYGON_FILL,
      });
    }

    // G-S01：圈内资源检索（Circle 入参，与画圈解耦）
    void spatial.esQuery({
      geometry: {
        type: 'Circle',
        center: [data.center.longitude, data.center.latitude],
        radius: data.radius,
      },
      types: data.resourceTypes,
      limit: 10000,
    });
  }

  /**
   * [DC-04] 路径规划控制
   */
  public async dispatchRoutePlan(data: DispatchRoutePlanData) {
    const { spatial, geometry, view } = this.genericController;

    const routeResult = await spatial.calcRoute({
      start: [data.start.longitude, data.start.latitude],
      end: [data.end.longitude, data.end.latitude],
      strategy: data.recommended ? 'fastest' : '0',
    });

    if (!routeResult?.coordinates?.length) return;

    if (data.routeVisible !== false) {
      geometry.drawLine({
        id: `route_${data.routeId}`,
        coordinates: routeResult.coordinates,
        strokeColor: ROUTE_LINE_STROKE,
      });
    }

    geometry.addMarker({
      id: `station_${data.start.station_id}`,
      lngLat: [data.start.longitude, data.start.latitude],
      iconUrl: FIRE_STATION_ICON,
    });

    view.fitBounds({
      geometry: {
        type: 'LineString',
        coordinates: routeResult.coordinates,
      },
      padding: [80, 80, 80, 80],
      duration: 800,
    });
  }

  /**
   * [DC-05] 消防站 ETA 过滤控制
   */
  public dispatchStationEtaFilter(data: DispatchStationEtaFilterData) {
    const { geometry, view } = this.genericController;

    if (!data.stationList?.length) return;

    let anyVisible = false;

    for (const station of data.stationList) {
      const matched = station.matched !== false;
      const withinEta = data.etaMax == null || station.eta <= data.etaMax;
      const visible = station.visible !== false && matched && withinEta;

      if (visible) anyVisible = true;

      geometry.setFeatureVisible({
        featureId: `station_${station.station_id}`,
        visible,
      });
    }

    view.layerToggle({
      layerId: FIRE_STATION_LAYER_ID,
      visible: anyVisible,
    });
  }

  /**
   * [DC-06] 路径显隐控制
   */
  public dispatchRouteToggle(data: DispatchRouteToggleData) {
    const { geometry } = this.genericController;

    if (!data.routeList?.length) return;

    for (const route of data.routeList) {
      geometry.setFeatureVisible({
        featureId: `route_${route.routeId}`,
        visible: route.routeVisible !== false,
      });
    }
  }
}
