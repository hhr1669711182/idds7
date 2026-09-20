/*
 * @Description: 消防调派车辆实时定位与模拟跟踪逻辑（函数式闭包工厂）。
 *               从 DispatchT1.ts 抽离，状态封装在闭包内，不依赖任何 class 实例。
 * @FilePath: src\baseComponent\OpenlayersMap\dispatch1\vehicleManager.ts
 */
import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import VectorSource from 'ol/source/Vector';
import { fromLonLat, toLonLat } from 'ol/proj';
import { getDistance } from 'ol/sphere';
import { getStyle, MAP_ICON_SRC } from '@/baseComponent/amap/featureStyle';
import type {
  CarLocationBatch,
  CarLocationPoint,
} from '@/Control/carLocationMessage';
import type {
  DispatchFlowState,
  DispatchVehicleCommand,
} from '@/controller/core/business/DispatchController1';
import { Style, Stroke } from 'ol/style';

/** 模拟跟踪的时间压缩车速（米/秒），仅用于无真实 GPS 时沿规划路线演示行进 */
const SIMULATION_TRACK_SPEED_MPS = 120;

/**
 * 实时定位推送间隔（由相邻两帧 gpsTime 推断）的有效区间（毫秒）。
 * 间隔落在该区间内时在两帧坐标间做线性插值平滑移动，超出则视为首帧/异常帧直接落位。
 */
const REALTIME_INTERPOLATION_MIN_MS = 2000;
const REALTIME_INTERPOLATION_MAX_MS = 30000;

/** 车辆走过的历史轨迹样式（灰色实线），层级低于车辆 marker。 */
const VEHICLE_TRAIL_STYLE = new Style({
  stroke: new Stroke({ color: 'rgba(136, 136, 136, 0.85)', width: 5 }),
  zIndex: 50,
});

/** 轨迹锚点最小间距（地图投影米），过滤停留与重复点，避免轨迹几何点数膨胀。 */
const TRAIL_ANCHOR_MIN_DISTANCE_M = 1;

type TrackedDispatchVehicle = {
  feature: Feature<Point>;
  stationId: string;
  vehicleId: string;
  plateNumber: string;
  lastProjectedCoordinate?: number[];
  lastGpsTimestamp?: number;
  rotation: number;
  /**
   * WS 实时调派车辆（car-location-broadcast-all 推送）：
   * 无队站/规划路线上下文，只按真实 GPS 上图，不参与沿路线模拟动画。
   */
  realtimeOnly?: boolean;
  /** 走过的历史轨迹 feature（灰色 LineString），首次移动时懒创建。 */
  trailFeature?: Feature<LineString>;
  /** 轨迹确认锚点（地图投影坐标），动画期间末端实时延伸到当前渲染位置。 */
  trailCoordinates: number[][];
};

/** 实时 GPS 帧间线性插值动画状态，消除 2~30 秒推送间隔造成的车辆跳变。 */
type RealtimeInterpolation = {
  handle: number;
  fromCoordinate: number[];
  toCoordinate: number[];
  startedAt: number;
  durationMs: number;
};

export interface VehicleManagerOptions {
  /** 路线/车辆 feature 所在的矢量数据源 */
  routeSource: VectorSource;
  /** 获取当前调派状态（供 simulateVehicleTracking 读取 stations） */
  getState: () => Readonly<DispatchFlowState>;
}

export interface VehicleManager {
  /** 使用消息服务推送的 WGS84 实时坐标更新已调派车辆。 */
  updateVehicleLocations: (batch: CarLocationBatch) => number;
  /**
   * 模拟跟踪：让本次已调派车辆沿各自队站的规划路线匀速行驶到报警点。
   * 仅用于无真实 GPS 推送时的演示；真实 GPS 到达、取消调派、重置或销毁时自动停止。
   * 返回成功启动模拟的车辆数量。
   */
  simulateVehicleTracking: () => number;
  /** 注册已调派车辆；位置只由实时 GPS 消息更新，不再按规划路线自动插值。 */
  registerDispatchedVehicles: (command: DispatchVehicleCommand) => void;
  /** 清空所有跟踪车辆、动画句柄与上图 feature。 */
  clearTrackedVehicles: () => void;
}

/**
 * 创建调派车辆管理器（函数式闭包工厂）。
 * 车辆跟踪状态（按车牌/车辆ID索引的跟踪表、最新定位缓存、模拟动画句柄）
 * 全部封装在闭包内，对外只暴露方法集合。
 */
export function createVehicleManager(
  options: VehicleManagerOptions,
): VehicleManager {
  const { routeSource, getState } = options;
  const trackedVehiclesByPlate = new globalThis.Map<string, TrackedDispatchVehicle>();
  const trackedVehiclesByCarId = new globalThis.Map<string, TrackedDispatchVehicle>();
  const latestLocationsByPlate = new globalThis.Map<string, CarLocationPoint>();
  const latestLocationsByCarId = new globalThis.Map<string, CarLocationPoint>();
  /** 模拟跟踪动画句柄，key 为 `${stationId}:${vehicleId}` */
  const vehicleAnimations = new globalThis.Map<string, number>();
  /** 实时 GPS 帧间插值动画状态，key 为 `${stationId}:${vehicleId}` */
  const realtimeAnimations = new globalThis.Map<string, RealtimeInterpolation>();

  const updateVehicleLocations = (batch: CarLocationBatch): number => {
    console.log('[trace] updateVehicleLocations', batch);
    if (!batch || !Array.isArray(batch.datas)) return 0;
    let updatedCount = 0;

    batch.datas.forEach((rawPoint) => {
      const point = normalizeVehicleLocation(rawPoint);
      if (!point) return;

      const plateKey = vehicleLocationKey(point.plateNumber);
      const carIdKey = vehicleLocationKey(point.carId);
      const previous = (plateKey ? latestLocationsByPlate.get(plateKey) : undefined)
        ?? (carIdKey ? latestLocationsByCarId.get(carIdKey) : undefined);
      if (!isNewerVehicleLocation(previous, point)) return;

      if (plateKey) latestLocationsByPlate.set(plateKey, point);
      if (carIdKey) latestLocationsByCarId.set(carIdKey, point);

      let tracked = (plateKey ? trackedVehiclesByPlate.get(plateKey) : undefined)
        ?? (carIdKey ? trackedVehiclesByCarId.get(carIdKey) : undefined);
      // WS 调派链路没有按钮/调派命令上下文：car-location-broadcast-all 推送的本身就是
      // “被调派”车辆，首帧 GPS 到达时懒注册 marker 直接上图，无需等待 registerDispatchedVehicles。
      if (!tracked) {
        tracked = registerRealtimeVehicle(point);
        if (!tracked) return;
      }
      // 模拟跟踪运行期间，真实 GPS 不接管该车，避免演示动画被打断；模拟结束后才恢复实时定位
      if (vehicleAnimations.has(vehicleAnimationKey(tracked))) return;
      if (plateKey) trackedVehiclesByPlate.set(plateKey, tracked);
      if (carIdKey) trackedVehiclesByCarId.set(carIdKey, tracked);
      if (applyVehicleLocation(tracked, point)) {
        updatedCount += 1;
      }
    });

    return updatedCount;
  };

  const simulateVehicleTracking = (): number => {
    // 调派失败时 registerDispatchedVehicles 不会执行，这里按需补齐跟踪车辆，
    // 保证无论调派成功与否，只要车辆被选中且有规划路线就能演示行进。
    const selectedVehicles = getState().stations.flatMap((station) =>
      station.vehicles
        .filter((vehicle) => vehicle.selected || vehicle.dispatched)
        .map((vehicle) => ({
          stationId: station.id,
          stationName: station.name,
          vehicleId: vehicle.id,
          vehicleName: vehicle.name,
          plateNumber: vehicle.plateNumber ?? vehicle.id,
        })),
    );
    if (selectedVehicles.length && !trackedVehiclesByPlate.size) {
      registerDispatchedVehicles({
        incidentId: '',
        incident: [0, 0],
        vehicles: selectedVehicles,
      });
    }

    const startedKeys = new Set<string>();
    let startedCount = 0;
    console.info('[DispatchT1] simulateVehicleTracking 开始', {
      selectedVehicleCount: selectedVehicles.length,
      trackedVehicleCount: trackedVehiclesByPlate.size,
      routeFeatureCount: routeSource.getFeatures().filter((f) => !f.get('dispatchVehicle')).length,
    });
    trackedVehiclesByPlate.forEach((tracked) => {
      const key = vehicleAnimationKey(tracked);
      if (startedKeys.has(key)) return;
      startedKeys.add(key);
      // WS 实时调派车辆只跟随真实 GPS，不参与沿规划路线的演示动画。
      if (tracked.realtimeOnly) return;
      const routeCoordinates = getStationRouteCoordinates(tracked.stationId);
      console.info('[DispatchT1] 车辆模拟跟踪', {
        key,
        stationId: tracked.stationId,
        plateNumber: tracked.plateNumber,
        routeCoordinateCount: routeCoordinates.length,
      });
      if (routeCoordinates.length < 2) return;
      if (startVehicleAnimation(tracked, routeCoordinates)) startedCount += 1;
    });
    console.info('[DispatchT1] simulateVehicleTracking 完成，启动动画数', startedCount);
    return startedCount;
  };

  const registerDispatchedVehicles = (command: DispatchVehicleCommand): void => {
    command.vehicles.forEach((vehicle) => {
      const station = getState().stations.find((item) => item.id === vehicle.stationId);
      if (!station) return;
      const plateNumber = String(vehicle.plateNumber || vehicle.vehicleId).trim();
      const plateKey = vehicleLocationKey(plateNumber);
      if (!plateKey) return;
      const key = `${vehicle.stationId}:${vehicle.vehicleId}`;
      const current = trackedVehiclesByPlate.get(plateKey);
      if (current) {
        stopVehicleAnimation(vehicleAnimationKey(current));
        removeTrackedVehicle(current);
      }

      const feature = new Feature({
        geometry: new Point(fromLonLat([station.longitude, station.latitude])),
      }) as Feature<Point>;
      feature.setId(`dispatch_t1_vehicle_${vehicle.stationId}_${vehicle.vehicleId}`);
      feature.set('stationId', vehicle.stationId);
      feature.set('vehicleId', vehicle.vehicleId);
      feature.set('plateNumber', plateNumber);
      feature.set('dispatchVehicle', true);
      const vehicleStyle = getStyle('vehicle', {
        src: MAP_ICON_SRC.car,
        rotation: 0,
        scale: 0.65,
        styleId: key,
      }) as Style;
      vehicleStyle.setZIndex(100);
      feature.setStyle(vehicleStyle);
      routeSource.addFeature(feature);

      const tracked: TrackedDispatchVehicle = {
        feature,
        stationId: vehicle.stationId,
        vehicleId: vehicle.vehicleId,
        plateNumber,
        rotation: 0,
        trailCoordinates: [],
      };
      trackedVehiclesByPlate.set(plateKey, tracked);

      const latest = latestLocationsByPlate.get(plateKey)
        || latestLocationsByCarId.get(vehicleLocationKey(vehicle.vehicleId));
      if (latest) applyVehicleLocation(tracked, latest);
    });
  };

  /**
   * WS 实时调派车辆懒注册：car-location-broadcast-all 推送的即被调派车辆，
   * 没有队站/调派命令上下文，车辆 marker 以首帧 GPS 坐标直接上图。
   * 车牌与车辆 ID 双键登记，后续帧任一标识命中即可更新位置。
   */
  const registerRealtimeVehicle = (point: CarLocationPoint): TrackedDispatchVehicle | undefined => {
    const plateKey = vehicleLocationKey(point.plateNumber);
    const carIdKey = vehicleLocationKey(point.carId);
    const identity = plateKey || carIdKey;
    if (!identity) return undefined;

    const styleId = `ws:${identity}`;
    const feature = new Feature({
      geometry: new Point(fromLonLat([point.longitude, point.latitude])),
    }) as Feature<Point>;
    feature.setId(`dispatch_t1_vehicle_ws_${identity}`);
    feature.set('stationId', '');
    feature.set('vehicleId', point.carId || identity);
    feature.set('plateNumber', point.plateNumber || identity);
    feature.set('dispatchVehicle', true);
    feature.set('realtime', true);
    const vehicleStyle = getStyle('vehicle', {
      src: MAP_ICON_SRC.car,
      rotation: 0,
      scale: 0.65,
      styleId,
    }) as Style;
    vehicleStyle.setZIndex(100);
    feature.setStyle(vehicleStyle);
    routeSource.addFeature(feature);

    const tracked: TrackedDispatchVehicle = {
      feature,
      stationId: '',
      vehicleId: point.carId || identity,
      plateNumber: point.plateNumber || identity,
      rotation: 0,
      realtimeOnly: true,
      trailCoordinates: [],
    };
    if (plateKey) trackedVehiclesByPlate.set(plateKey, tracked);
    if (carIdKey) trackedVehiclesByCarId.set(carIdKey, tracked);
    return tracked;
  };

  const clearTrackedVehicles = (): void => {
    clearVehicleAnimations();
    const trackedVehicles = new Set([
      ...trackedVehiclesByPlate.values(),
      ...trackedVehiclesByCarId.values(),
    ]);
    trackedVehicles.forEach((tracked) => {
      routeSource.removeFeature(tracked.feature);
      if (tracked.trailFeature) routeSource.removeFeature(tracked.trailFeature);
    });
    trackedVehiclesByPlate.clear();
    trackedVehiclesByCarId.clear();
  };

  const removeTrackedVehicle = (tracked: TrackedDispatchVehicle): void => {
    stopRealtimeAnimation(vehicleAnimationKey(tracked));
    routeSource.removeFeature(tracked.feature);
    if (tracked.trailFeature) routeSource.removeFeature(tracked.trailFeature);
    trackedVehiclesByPlate.forEach((value, key) => {
      if (value === tracked) trackedVehiclesByPlate.delete(key);
    });
    trackedVehiclesByCarId.forEach((value, key) => {
      if (value === tracked) trackedVehiclesByCarId.delete(key);
    });
  };

  const vehicleAnimationKey = (tracked: TrackedDispatchVehicle): string => {
    return `${tracked.stationId}:${tracked.vehicleId}`;
  };

  /** 懒创建车辆的历史轨迹 feature（灰色线），与车辆 marker 同源同清。 */
  const ensureTrailFeature = (tracked: TrackedDispatchVehicle): Feature<LineString> => {
    if (tracked.trailFeature) return tracked.trailFeature;
    const feature = new Feature({
      geometry: new LineString([]),
    }) as Feature<LineString>;
    feature.setId(`${String(tracked.feature.getId() ?? 'dispatch_t1_vehicle')}_trail`);
    feature.set('dispatchVehicleTrail', true);
    feature.setStyle(VEHICLE_TRAIL_STYLE);
    routeSource.addFeature(feature);
    tracked.trailFeature = feature;
    return feature;
  };

  /** 追加轨迹确认锚点：与上一个锚点距离过近（停留/重复帧）时忽略。 */
  const appendTrailAnchor = (tracked: TrackedDispatchVehicle, coordinate: number[]): void => {
    const anchors = tracked.trailCoordinates;
    const last = anchors[anchors.length - 1];
    if (
      last
      && Math.hypot(coordinate[0] - last[0], coordinate[1] - last[1]) < TRAIL_ANCHOR_MIN_DISTANCE_M
    ) return;
    anchors.push([coordinate[0], coordinate[1]]);
  };

  /** 渲染轨迹几何：确认锚点 + 当前渲染位置，使轨迹末端随车辆实时延伸。 */
  const updateTrailGeometry = (tracked: TrackedDispatchVehicle, current: number[]): void => {
    if (!tracked.trailCoordinates.length) return;
    const trailFeature = ensureTrailFeature(tracked);
    (trailFeature.getGeometry() as LineString).setCoordinates([
      ...tracked.trailCoordinates,
      [current[0], current[1]],
    ]);
  };

  const stopVehicleAnimation = (key: string): void => {
    const handle = vehicleAnimations.get(key);
    if (handle === undefined) return;
    cancelAnimationFrame(handle);
    vehicleAnimations.delete(key);
  };

  const stopRealtimeAnimation = (key: string): void => {
    const current = realtimeAnimations.get(key);
    if (!current) return;
    cancelAnimationFrame(current.handle);
    realtimeAnimations.delete(key);
  };

  const clearVehicleAnimations = (): void => {
    vehicleAnimations.forEach((handle) => cancelAnimationFrame(handle));
    vehicleAnimations.clear();
    realtimeAnimations.forEach((animation) => cancelAnimationFrame(animation.handle));
    realtimeAnimations.clear();
  };

  /** 取队站规划路线（含 TMC 路况分段）在地图投影下的有序坐标，供模拟跟踪沿线路行驶。 */
  const getStationRouteCoordinates = (stationId: string): number[][] => {
    const features = routeSource.getFeatures()
      .filter((feature) => !feature.get('dispatchVehicle') && !feature.get('dispatchVehicleTrail') && (
        feature.get('stationId') === stationId
        || feature.getId() === `dispatch_t1_route_${stationId}`
      ));
    const segmentIndex = (feature: Feature): number => {
      const match = /_(\d+)$/.exec(String(feature.getId() ?? ''));
      return match ? Number(match[1]) : 0;
    };
    const coordinates: number[][] = [];
    features
      .sort((a, b) => segmentIndex(a) - segmentIndex(b))
      .forEach((feature) => {
        const geometry = feature.getGeometry();
        if (geometry instanceof LineString) {
          geometry.getCoordinates().forEach((coordinate) => coordinates.push(coordinate));
        }
      });
    return coordinates;
  };

  /** 沿规划路线以压缩时间匀速动画移动车辆，到达报警点后自动结束。 */
  const startVehicleAnimation = (
    tracked: TrackedDispatchVehicle,
    coordinates: number[][],
  ): boolean => {
    type RouteSegment = {
      from: number[];
      to: number[];
      length: number;
      cumulative: number;
    };
    const segments: RouteSegment[] = [];
    let totalLength = 0;
    for (let index = 0; index < coordinates.length - 1; index += 1) {
      const from = coordinates[index];
      const to = coordinates[index + 1];
      // 墨卡托投影下平面距离随纬度失真，线段长度统一用 WGS84 球面距离计算
      const length = getDistance(
        toLonLat(from) as [number, number],
        toLonLat(to) as [number, number],
      );
      if (!(length > 0)) continue;
      segments.push({ from, to, length, cumulative: totalLength });
      totalLength += length;
    }
    if (!segments.length || totalLength <= 0) return false;

    const key = vehicleAnimationKey(tracked);
    stopVehicleAnimation(key);
    // 真实 GPS 插值与路线模拟互斥，启动演示动画前终止尚未播完的帧间插值
    stopRealtimeAnimation(key);
    const durationMs = (totalLength / SIMULATION_TRACK_SPEED_MPS) * 1000;
    const startTime = performance.now();
    const geometry = tracked.feature.getGeometry() as Point;
    // 以车辆当前位置为轨迹起点锚点，动画期间末端随渲染位置实时延伸
    appendTrailAnchor(tracked, geometry.getCoordinates());

    const pointAt = (traveled: number): number[] => {
      let current = segments[segments.length - 1];
      for (const segment of segments) {
        if (traveled <= segment.cumulative + segment.length) {
          current = segment;
          break;
        }
      }
      const ratio = Math.min(1, Math.max(
        0,
        (traveled - current.cumulative) / current.length,
      ));
      return [
        current.from[0] + (current.to[0] - current.from[0]) * ratio,
        current.from[1] + (current.to[1] - current.from[1]) * ratio,
      ];
    };

    const renderFrame = (now: number) => {
      const progress = Math.min(1, (now - startTime) / durationMs);
      const projectedCoordinate = pointAt(totalLength * progress);
      const previous = tracked.lastProjectedCoordinate;
      if (previous) {
        const dx = projectedCoordinate[0] - previous[0];
        const dy = projectedCoordinate[1] - previous[1];
        if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
          tracked.rotation = normalizeRotation(
            -Math.atan2(dy, dx) + Math.PI / 2,
            tracked.rotation,
          );
        }
      }
      geometry.setCoordinates(projectedCoordinate);
      tracked.lastProjectedCoordinate = projectedCoordinate;
      updateTrailGeometry(tracked, projectedCoordinate);
      const vehicleStyle = getStyle('vehicle', {
        src: MAP_ICON_SRC.car,
        rotation: tracked.rotation,
        scale: 0.65,
        styleId: key,
      }) as Style;
      vehicleStyle.setZIndex(100);
      tracked.feature.setStyle(vehicleStyle);

      if (progress < 1) {
        vehicleAnimations.set(key, requestAnimationFrame(renderFrame));
      } else {
        vehicleAnimations.delete(key);
      }
    };
    vehicleAnimations.set(key, requestAnimationFrame(renderFrame));
    return true;
  };

  /**
   * 在相邻两帧真实 GPS 坐标之间做线性插值：动画时长取两帧 gpsTime 的间隔，
   * 使车辆在 2~30 秒的不确定推送间隔下仍保持匀速平滑移动。
   * 若上一段插值尚未播完又收到新帧，以当前渲染位置为起点重新开始，保证无跳变。
   */
  const startLocationInterpolation = (
    tracked: TrackedDispatchVehicle,
    toCoordinate: number[],
    durationMs: number,
  ): void => {
    const key = vehicleAnimationKey(tracked);
    stopRealtimeAnimation(key);

    const fromCoordinate = tracked.lastProjectedCoordinate
      ? [...tracked.lastProjectedCoordinate]
      : [...toCoordinate];
    const dx = toCoordinate[0] - fromCoordinate[0];
    const dy = toCoordinate[1] - fromCoordinate[1];
    if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
      tracked.rotation = normalizeRotation(
        -Math.atan2(dy, dx) + Math.PI / 2,
        tracked.rotation,
      );
    }

    const geometry = tracked.feature.getGeometry() as Point;
    const styleId = key;
    const startedAt = performance.now();
    const renderFrame = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / durationMs));
      const projectedCoordinate = [
        fromCoordinate[0] + (toCoordinate[0] - fromCoordinate[0]) * progress,
        fromCoordinate[1] + (toCoordinate[1] - fromCoordinate[1]) * progress,
      ];
      geometry.setCoordinates(projectedCoordinate);
      tracked.lastProjectedCoordinate = projectedCoordinate;
      updateTrailGeometry(tracked, projectedCoordinate);
      const vehicleStyle = getStyle('vehicle', {
        src: MAP_ICON_SRC.car,
        rotation: tracked.rotation,
        scale: 0.65,
        styleId,
      }) as Style;
      vehicleStyle.setZIndex(100);
      tracked.feature.setStyle(vehicleStyle);

      const current = realtimeAnimations.get(key);
      if (progress < 1 && current) {
        current.handle = requestAnimationFrame(renderFrame);
      } else {
        realtimeAnimations.delete(key);
      }
    };
    realtimeAnimations.set(key, {
      handle: requestAnimationFrame(renderFrame),
      fromCoordinate,
      toCoordinate,
      startedAt,
      durationMs,
    });
  };

  const applyVehicleLocation = (
    tracked: TrackedDispatchVehicle,
    point: CarLocationPoint,
  ): boolean => {
    console.log('[trace] applyVehicleLocation', { tracked, point });
    const gpsTimestamp = vehicleLocationTimestamp(point.gpsTime);
    if (
      gpsTimestamp !== undefined
      && tracked.lastGpsTimestamp !== undefined
      && gpsTimestamp <= tracked.lastGpsTimestamp
    ) return false;

    const projectedCoordinate = fromLonLat([point.longitude, point.latitude]);
    const previous = tracked.lastProjectedCoordinate;
    const intervalMs = gpsTimestamp !== undefined && tracked.lastGpsTimestamp !== undefined
      ? gpsTimestamp - tracked.lastGpsTimestamp
      : undefined;

    tracked.feature.set('carId', point.carId);
    tracked.feature.set('plateNumber', point.plateNumber || tracked.plateNumber);
    tracked.feature.set('gpsTime', point.gpsTime);
    tracked.feature.set('longitude', point.longitude);
    tracked.feature.set('latitude', point.latitude);
    if (gpsTimestamp !== undefined) tracked.lastGpsTimestamp = gpsTimestamp;

    // 已有渲染位置且相邻两帧 gpsTime 间隔落在 2~30 秒有效区间时，启动帧间插值平滑移动；
    // 首帧定位、缺少 gpsTime 或间隔异常时直接落位，保持原有行为。
    if (previous) {
      // 上一帧最终渲染位置确认为轨迹锚点，后续动画/落位从该点延伸灰色轨迹
      appendTrailAnchor(tracked, previous);
    }
    if (
      previous
      && intervalMs !== undefined
      && intervalMs >= REALTIME_INTERPOLATION_MIN_MS
      && intervalMs <= REALTIME_INTERPOLATION_MAX_MS
    ) {
      startLocationInterpolation(tracked, projectedCoordinate, intervalMs);
      return true;
    }

    if (previous) {
      const dx = projectedCoordinate[0] - previous[0];
      const dy = projectedCoordinate[1] - previous[1];
      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
        tracked.rotation = normalizeRotation(
          -Math.atan2(dy, dx) + Math.PI / 2,
          tracked.rotation,
        );
      }
    }
    (tracked.feature.getGeometry() as Point).setCoordinates(projectedCoordinate);
    tracked.lastProjectedCoordinate = projectedCoordinate;
    updateTrailGeometry(tracked, projectedCoordinate);

    const styleId = `${tracked.stationId}:${tracked.vehicleId}`;
    const vehicleStyle = getStyle('vehicle', {
      src: MAP_ICON_SRC.car,
      rotation: tracked.rotation,
      scale: 0.65,
      styleId,
    }) as Style;
    vehicleStyle.setZIndex(100);
    tracked.feature.setStyle(vehicleStyle);
    return true;
  };

  const normalizeVehicleLocation = (value: CarLocationPoint): CarLocationPoint | null => {
    if (!value || typeof value !== 'object') return null;
    const longitude = Number(value.longitude);
    const latitude = Number(value.latitude);
    const carId = String(value.carId ?? '').trim();
    const plateNumber = String(value.plateNumber ?? '').trim();
    if (
      (!carId && !plateNumber)
      || !Number.isFinite(longitude)
      || !Number.isFinite(latitude)
      || longitude < -180
      || longitude > 180
      || latitude < -90
      || latitude > 90
    ) return null;
    return {
      ...value,
      carId,
      plateNumber,
      longitude,
      latitude,
      gpsTime: String(value.gpsTime ?? '').trim() || undefined,
    };
  };

  const isNewerVehicleLocation = (
    previous: CarLocationPoint | undefined,
    next: CarLocationPoint,
  ): boolean => {
    if (!previous) return true;
    const previousTimestamp = vehicleLocationTimestamp(previous.gpsTime);
    const nextTimestamp = vehicleLocationTimestamp(next.gpsTime);
    if (previousTimestamp === undefined || nextTimestamp === undefined) return true;
    return nextTimestamp > previousTimestamp;
  };

  const vehicleLocationTimestamp = (gpsTime?: string): number | undefined => {
    if (!gpsTime) return undefined;
    const timestamp = Date.parse(gpsTime.replace(' ', 'T'));
    return Number.isFinite(timestamp) ? timestamp : undefined;
  };

  const vehicleLocationKey = (value: unknown): string => {
    return String(value ?? '').trim().replace(/\s+/g, '').toUpperCase();
  };

  const normalizeRotation = (angle: number, reference: number): number => {
    let normalized = angle;
    while (normalized - reference > Math.PI) normalized -= Math.PI * 2;
    while (normalized - reference < -Math.PI) normalized += Math.PI * 2;
    return normalized;
  };

  return {
    updateVehicleLocations,
    simulateVehicleTracking,
    registerDispatchedVehicles,
    clearTrackedVehicles,
  };
}
