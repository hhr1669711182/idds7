/*
 * @Author: hhr
 * @Date: 2026-07-01 11:09:25
 * @LastEditTime: 2026-07-10 11:05:59
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\controller\core\generic\ViewController.ts
 */
import OlMap from 'ol/Map';
import type BaseLayer from 'ol/layer/Base';
import type Collection from 'ol/Collection';
import GeoJSON from 'ol/format/GeoJSON';
import TileWMS from 'ol/source/TileWMS';
import ImageWMS from 'ol/source/ImageWMS';
import { fromLonLat } from 'ol/proj';
import type { LocateData, LayerToggleData, LayerRefreshData, ClickData, Overlay3DData, FitBoundsData, PoiLocationData } from '../protocol';

const LAYER_ID_ALIASES: Record<string, string> = {
  online_car: 'gis:env_car',
};

/** mock 矢量层 className 与 layerId 映射（findLayersById 兜底） */
const MOCK_LAYER_CLASS_BY_ID: Record<string, string> = {
  'gis:env_car': 'CAR_LAYER',
};

export class ViewController {
  private refreshCallbacks = new Map<string, () => void>();
  private toggleCallbacks = new Map<string, (visible: boolean) => void>();
  /** 图层缓存池：劫持 map.getLayers() 后，自动收集所有 push 的图层 */
  private layerCachePool = new Map<string, BaseLayer>();

  constructor(private map: OlMap) {
    this.interceptMapLayers();
  }

  /**
   * 劫持 map.getLayers() 的 push/remove，自动维护 layerCachePool
   * map.addLayer -> layers.push
   * map.removeLayer -> layers.remove
   */
  private interceptMapLayers() {
    const layers = this.map.getLayers();

    // 劫持 push（图层被添加到 map 时）
    const originalPush = layers.push.bind(layers);
    layers.push = (layer: BaseLayer, ...rest) => {
      this.cacheLayer(layer);
      return originalPush(layer, ...rest);
    };

    // 劫持 remove（图层从 map 移除时）
    const originalRemove = layers.remove.bind(layers);
    layers.remove = (layer: BaseLayer) => {
      this.uncacheLayer(layer);
      return originalRemove(layer);
    };
  }

  /**
   * 收集图层到缓存池（通过 layer.get('id') 或 className 识别）
   */
  private cacheLayer(layer: BaseLayer) {
    const id = this.resolveLayerId(layer.get('id') || layer.getClassName?.() || '');
    if (id) {
      this.layerCachePool.set(id, layer);
    }
  }

  /**
   * 从缓存池移除图层
   */
  private uncacheLayer(layer: BaseLayer) {
    const id = this.resolveLayerId(layer.get('id') || layer.getClassName?.() || '');
    if (id) {
      this.layerCachePool.delete(id);
    }
  }

  /**
   * 注册非 WMS 图层的刷新回调（如 mock 车辆矢量层）
   */
  public registerLayerRefreshCallback(layerId: string, callback: () => void) {
    this.refreshCallbacks.set(this.resolveLayerId(layerId), callback);
  }

  /**
   * 注册 mock 矢量层的显隐回调（与 map.vue carManager.setVisible 对齐）
   */
  public registerLayerToggleCallback(layerId: string, callback: (visible: boolean) => void) {
    this.toggleCallbacks.set(this.resolveLayerId(layerId), callback);
  }

  /**
   * [G-V01] 视口平移缩放
   */
  public locate(data: LocateData) {
    const view = this.map.getView();
    console.log('[G-V01] 视口平移缩放', data);
    if (!view) return;

    const center = fromLonLat(data.lngLat);
    if (data.duration) {
      view.animate({
        center,
        zoom: data.zoom,
        duration: data.duration
      });
    } else {
      view.setCenter(center);
      view.setZoom(data.zoom);
    }
  }

  /**
   * [G-V02] 图层动态显隐
   * 从缓存池查找图层并设置显隐，不再遍历全量 map.getLayers()
   */
  public layerToggle(data: LayerToggleData) {
    const layerId = this.resolveLayerId(data.layerId);
    this.toggleCallbacks.get(layerId)?.(data.visible);

    // 从缓存池查找图层
    const layer = this.findLayerFromCache(layerId);
    if (layer) {
      layer.setVisible(data.visible);
    }
  }

  /**
   * [IC-02] WMS 图层刷新
   */
  public layerRefresh(data: LayerRefreshData) {
    const timestamp = data.timestamp ?? Date.now();

    for (const layerName of data.layerNames) {
      const layerId = this.resolveLayerId(layerName);
      this.refreshCallbacks.get(layerId)?.();

      const layer = this.findLayerFromCache(layerId);
      if (layer) {
        const source = (layer as any).getSource?.();
        if (source instanceof TileWMS || source instanceof ImageWMS) {
          source.updateParams({ _t: timestamp });
          source.refresh();
        }
      }
    }
  }

  /**
   * [G-V03] 坐标与要素拾取
   */
  public simulateClick(data: ClickData) {
    console.log('[G-V03] 坐标与要素拾取', data);
    if (data.lngLat) {
      const coordinate = fromLonLat(data.lngLat);
      const pixel = this.map.getPixelFromCoordinate(coordinate);
      if (pixel) {
        const event = new MouseEvent('click', {
          clientX: pixel[0],
          clientY: pixel[1],
          bubbles: true,
          cancelable: true
        });
        this.map.getViewport().dispatchEvent(event);
      }
    }
  }

  /**
   * [G-V04] 2.5D 白膜渲染
   */
  public overlay3D(data: Overlay3DData) {
    console.log('[G-V04] 2.5D 白膜渲染', data);
    if (data.center) {
      this.locate({
        lngLat: data.center,
        zoom: 18,
        duration: 1000
      });
    }
  }

  /**
   * [G-V05] 面边界定位 (自适应视口)
   */
  public fitBounds(data: FitBoundsData) {
    const view = this.map.getView();
    if (!view || !data.geometry) return;

    try {
      const geojsonFormat = new GeoJSON();
      const feature: any = geojsonFormat.readFeature(
        { type: 'Feature', geometry: data.geometry },
        { featureProjection: view.getProjection() }
      );
      const extent = feature.getGeometry()?.getExtent();
      if (extent) {
        view.fit(extent, {
          padding: data.padding || [50, 50, 50, 50],
          duration: data.duration || 800
        });
      }
    } catch (error) {
      console.error('[G-V05] 面边界定位解析失败', error);
    }
  }

  /**
   * [G-V06] POI 定位控制
   */
  public poiLocation(data: PoiLocationData) {
    this.locate({
      lngLat: [data.longitude, data.latitude],
      zoom: data.zoom,
      duration: 500
    });
  }

  private resolveLayerId(layerId: string) {
    return LAYER_ID_ALIASES[layerId] ?? layerId;
  }

  /**
   * 从缓存池中查找图层
   */
  private findLayerFromCache(layerId: string): BaseLayer | undefined {
    const resolvedId = this.resolveLayerId(layerId);
    const layer = this.layerCachePool.get(resolvedId);
    if (layer) return layer;

    // 兜底：尝试通过 className 匹配
    for (const [, l] of this.layerCachePool) {
      if (this.matchLayerId(l, resolvedId)) {
        return l;
      }
    }
    return undefined;
  }

  private matchLayerId(layer: BaseLayer, layerId: string) {
    if (layer.get('id') === layerId || layer.get('name') === layerId) {
      return true;
    }

    const className = layer.getClassName?.();
    if (className === layerId || className === MOCK_LAYER_CLASS_BY_ID[layerId]) {
      return true;
    }

    const source = (layer as any).getSource?.();
    if (source instanceof TileWMS || source instanceof ImageWMS) {
      const layersParam = source.getParams()?.LAYERS;
      if (typeof layersParam === 'string' && (layersParam === layerId || layersParam.includes(layerId))) {
        return true;
      }
    }

    return false;
  }
}
