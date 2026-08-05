import type { SmoothMoveData, TrackAppendData, TrackPlayData } from '../protocol';
import OlMap from 'ol/Map';
import { fromLonLat } from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';

export class KinematicController {
  private trackLayer: VectorLayer<VectorSource>;
  private animationFrameId: number | null = null;

  constructor(private map: OlMap) {
    this.trackLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 999
    });
    this.map.addLayer(this.trackLayer);
  }

  /**
   * 查找或创建指定的要素
   */
  private getOrCreateFeature(id: string, geomType: 'Point' | 'LineString'): Feature {
    let feature = this.trackLayer.getSource()?.getFeatureById(id);
    if (!feature) {
      if (geomType === 'Point') {
        feature = new Feature(new Point([0, 0]));
      } else {
        feature = new Feature(new LineString([]));
      }
      feature.setId(id);
      this.trackLayer.getSource()?.addFeature(feature);
    }
    return feature;
  }

  /**
   * [G-K01] 平滑移动引擎
   */
  public smoothMove(data: SmoothMoveData) {
    console.log('[G-K01] 平滑移动引擎', data);
    
    // 1. 获取目标坐标
    const targetCoord = fromLonLat(data.targetLngLat);
    const feature = this.getOrCreateFeature(data.featureId, 'Point');
    const geometry = feature.getGeometry() as Point;
    
    // 如果没有初始坐标，直接设置
    const currentCoord = geometry.getCoordinates();
    if (!currentCoord || currentCoord[0] === 0) {
      geometry.setCoordinates(targetCoord);
      return;
    }

    // 2. 简单的线性插值动画
    const duration = data.duration || 1000;
    const startCoord = currentCoord;
    const startTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      let progress = elapsed / duration;
      
      if (progress >= 1) progress = 1;

      // 缓动函数 (ease-out)
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      const x = startCoord[0] + (targetCoord[0] - startCoord[0]) * easeProgress;
      const y = startCoord[1] + (targetCoord[1] - startCoord[1]) * easeProgress;

      geometry.setCoordinates([x, y]);

      if (progress < 1) {
        this.animationFrameId = requestAnimationFrame(animate);
      }
    };

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.animationFrameId = requestAnimationFrame(animate);
  }

  /**
   * [G-K02] 轨迹线追加
   */
  public appendTrack(data: TrackAppendData) {
    console.log('[G-K02] 轨迹线追加', data);
    const coord = fromLonLat(data.newLngLat);
    const feature = this.getOrCreateFeature(data.lineId, 'LineString');
    const geometry = feature.getGeometry() as LineString;
    
    geometry.appendCoordinate(coord);
  }

  /**
   * [G-K03] 轨迹回放播放器
   */
  public playTrack(data: TrackPlayData) {
    console.log('[G-K03] 轨迹回放播放器', data);
    if (!data.points || data.points.length === 0) return;

    // TODO: 完整的轨迹回放控制器（带暂停、继续、进度条等）
    // 简单实现：按顺序触发平滑移动
    let index = 0;
    const moveNext = () => {
      if (index >= data.points.length) return;
      
      this.smoothMove({
        featureId: 'playback_marker',
        targetLngLat: data.points[index],
        duration: 1000 / (data.playSpeed || 1)
      });
      
      index++;
      setTimeout(moveNext, 1000 / (data.playSpeed || 1));
    };
    
    moveNext();
  }
}