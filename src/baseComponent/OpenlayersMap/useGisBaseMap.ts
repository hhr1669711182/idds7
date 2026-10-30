/*
 * @Author: huanghuanrong
 * @Date: 2026-10-29
 * @Description: 统一 GIS 底座（GisBaseMap）共用层：WMS 图层创建/移除 + 视图 zoom 限制。
 *               main（map.vue）与 dispatch（dispatchMap.vue）共用同一实现，消除双底座漂移。
 *
 *               差异由 options 显式编码，保持两页既有语义：
 *               - 图层配置由调用方注入（getLayerConfig）：main 用 useLayersStore，
 *                 dispatch 用 LAYER_SOURCE_CONFIGS，各自持久化边界不变。
 *               - 前端临时图层显隐（fire/car/jr/... manager）由调用方注入 handler。
 *               - syncTempInvisible：main 仅"命中即开"（未命中不显式关），
 *                 dispatch 对全部临时图层"命中开/未命中关"。
 *               - disposeSourceOnRemove / disposeLayerOnRemove：main 独立 dispose，
 *                 dispatch 走共享池不 dispose。
 *               - guardRemoveLayer：调派期 CQL 强占消防站/周边资源层时阻止移除。
 */
import TileLayer from 'ol/layer/Tile';
import TileWMS from 'ol/source/TileWMS';
import type OLMap from 'ol/Map';
import type { EventsKey } from 'ol/events';
import { unByKey } from 'ol/Observable';
import type { ServerType } from 'ol/source/wms';
import { markRaw } from 'vue';
import { GOOGLE_LAYER, TEMP_FRONTEND_LAYER_IDS, isTempFrontendLayerId } from './layers';

/** 各 variant 注入的图层 WMS 配置。 */
export interface WmsLayerConfig {
  url: string;
  params: Record<string, string | number | boolean>;
  serverType?: ServerType;
  crossOrigin?: string;
  opacity?: number;
  minZoom?: number;
  visible?: boolean;
  /** 该图层的 zIndex（调用方按 id 决定；主/调派对队站层 z-index 一致）。 */
  zIndex?: number;
}

export interface GisBaseMapOptions {
  /** 按图层 id 取 WMS 配置；取不到表示该 id 不受本底座管理。 */
  getLayerConfig: (id: string) => WmsLayerConfig | undefined;
  /** 移除/卸载时是否 dispose 图层 source（main 独立 dispose，dispatch 共享池不 dispose）。 */
  disposeSourceOnRemove?: boolean;
  /** 移除/卸载时是否 dispose 图层实例（main 是，dispatch 否）。 */
  disposeLayerOnRemove?: boolean;
  /** 是否给图层 set('id')（main 需要，其他取图逻辑依赖；dispatch 不依赖）。 */
  setLayerId?: boolean;
  /**
   * 新增 WMS 图层时是否用 config.visible 决定初始显隐（main=true 尊重配置；
   * dispatch=false 走 OL 默认可见，与原 dispatch addLayer 无 setVisible 一致）。 */
  respectConfigVisible?: boolean;
  /** syncLayers 时是否对"未命中"的前端临时图层显式关闭（dispatch 是，main 否）。 */
  syncTempInvisible?: boolean;
  /** 移除前守卫：返回 true 表示阻止移除（调派期 CQL 强占消防站/周边资源层时）。 */
  guardRemoveLayer?: (id: string) => boolean;
  /** 前端临时图层显隐处理（命中返回 true）。 */
  handleTempFrontendLayer: (id: string, visible: boolean) => boolean;
}

export interface GisBaseMapApi {
  /** 绑定 OLMap 实例（调用方 new OLMap 后传入），并应用视图 zoom 上下限。 */
  attach: (olMap: OLMap, zoom: { minZoom: number; maxZoom: number }) => void;
  /** 重新应用视图 zoom 上下限（配置 / 底图 maxZoom 变化时调用）。 */
  applyZoomLimits: (zoom: { minZoom: number; maxZoom: number }) => void;
  addLayer: (id: string, visible?: boolean) => boolean;
  removeLayer: (id: string) => boolean;
  syncLayers: (ids: string[], visible?: boolean) => void;
  /** 幂等：找不到 WMS 图层返回 false 不抛错。 */
  visibleLayer: (id: string, visible: boolean) => boolean;
  /** 监听 zoom 变化，返回可解绑的 key。 */
  watchZoom: (onChange: (zoom: number) => void) => EventsKey | null;
  /** 卸载：解绑 zoom、移除并（按策略）dispose 全部 WMS 图层。 */
  dispose: () => void;
  /** 当前已挂 WMS 图层 id 清单。 */
  wmsLayerIds: () => string[];
  /** 取某 WMS 图层实例（CQL 强制过滤、卸载清理访问）。 */
  getWmsLayer: (id: string) => TileLayer<TileWMS> | undefined;
  /** 某 WMS 图层是否已挂载。 */
  hasWmsLayer: (id: string) => boolean;
}

export const useGisBaseMap = (options: GisBaseMapOptions): GisBaseMapApi => {
  let map: OLMap | null = null;
  const wmsLayerMap = new globalThis.Map<string, TileLayer<TileWMS>>();
  const disposeSource = options.disposeSourceOnRemove ?? true;
  const disposeLayer = options.disposeLayerOnRemove ?? true;
  let zoomKey: EventsKey | null = null;

  const addLayer = (id: string, visible?: boolean): boolean => {
    if (!map) return false;
    if (isTempFrontendLayerId(id)) return options.handleTempFrontendLayer(id, true);
    const config = options.getLayerConfig(id);
    if (!config || wmsLayerMap.has(id)) return false;
    const layer = markRaw(new TileLayer({
      source: markRaw(new TileWMS({
        url: config.url,
        params: config.params,
        serverType: config.serverType,
        crossOrigin: config.crossOrigin,
      })),
      opacity: config.opacity,
      minZoom: config.minZoom,
      zIndex: config.zIndex,
    }));
    map.addLayer(layer);
    if (options.setLayerId) layer.set('id', id);
    if (options.respectConfigVisible) {
      layer.setVisible(visible ?? config.visible ?? true);
    }
    wmsLayerMap.set(id, layer);
    return true;
  };

  const removeLayer = (id: string): boolean => {
    if (!map) return false;
    if (isTempFrontendLayerId(id)) return options.handleTempFrontendLayer(id, false);
    if (options.guardRemoveLayer?.(id)) return false;
    const layer = wmsLayerMap.get(id);
    if (!layer) return false;
    map.removeLayer(layer);
    if (disposeSource) layer.getSource()?.dispose();
    if (disposeLayer) layer.dispose();
    wmsLayerMap.delete(id);
    return true;
  };

  const syncLayers = (ids: string[], visible?: boolean): void => {
    if (!map) return;
    const targetIds = new Set(ids);
    Array.from(wmsLayerMap.keys()).forEach((id) => {
      if (!targetIds.has(id)) removeLayer(id);
    });
    Object.values(TEMP_FRONTEND_LAYER_IDS).forEach((id) => {
      if (targetIds.has(id)) {
        options.handleTempFrontendLayer(id, true);
      } else if (options.syncTempInvisible) {
        options.handleTempFrontendLayer(id, false);
      }
    });
    ids.forEach((id) => {
      if (!isTempFrontendLayerId(id)) addLayer(id, visible);
    });
  };

  const visibleLayer = (id: string, visible: boolean): boolean => {
    const layer = wmsLayerMap.get(id);
    if (!layer) return false;
    layer.setVisible(visible);
    return true;
  };

  const applyZoomLimits = (zoom: { minZoom: number; maxZoom: number }): void => {
    if (!map) return;
    const view = map.getView();
    view.setMinZoom(zoom.minZoom);
    view.setMaxZoom(zoom.maxZoom);
    const current = view.getZoom();
    if (typeof current === 'number') view.setZoom(Math.min(Math.max(current, zoom.minZoom), zoom.maxZoom));
  };

  const attach = (olMap: OLMap, zoom: { minZoom: number; maxZoom: number }): void => {
    map = olMap;
    applyZoomLimits(zoom);
  };

  const watchZoom = (onChange: (zoom: number) => void): EventsKey | null => {
    if (!map) return null;
    const key = map.getView().on('change:resolution', () => {
      const zoom = map?.getView().getZoom();
      if (typeof zoom === 'number') onChange(zoom);
    });
    zoomKey = key;
    return key;
  };

  const dispose = (): void => {
    if (zoomKey) {
      unByKey(zoomKey);
      zoomKey = null;
    }
    if (map) {
      wmsLayerMap.forEach((layer) => {
        map?.removeLayer(layer);
        if (disposeSource) layer.getSource()?.dispose();
        if (disposeLayer) layer.dispose();
      });
      wmsLayerMap.clear();
    }
    map = null;
  };

  return {
    attach,
    applyZoomLimits,
    addLayer,
    removeLayer,
    syncLayers,
    visibleLayer,
    watchZoom,
    dispose,
    wmsLayerIds: () => Array.from(wmsLayerMap.keys()),
    getWmsLayer: (id: string) => wmsLayerMap.get(id),
    hasWmsLayer: (id: string) => wmsLayerMap.has(id),
  };
};

export { GOOGLE_LAYER };
export type { OLMap };
