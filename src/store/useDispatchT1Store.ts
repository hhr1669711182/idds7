import { defineStore } from 'pinia';

export type DispatchStationRole = 'primary' | 'support';
export type DispatchRouteStatus = 'idle' | 'planning' | 'ready' | 'error';
export type DispatchWorkflowStatus =
  | 'idle'
  | 'querying'
  | 'ready'
  | 'dispatching'
  | 'dispatched'
  | 'error';

/** 服务端 VehicleStatus 中唯一允许调派勾选的状态：待命 */
export const VEHICLE_STATUS_STANDBY = 'DAILY_STANDBY';
/** 状态码可能存在大小写/空白漂移，统一 trim + 大写后比较 */
export const isStandbyVehicleStatus = (status?: string | null): boolean =>
  (status ?? '').trim().toUpperCase() === VEHICLE_STATUS_STANDBY;

export interface DispatchIncidentState {
  id: string;
  longitude: number;
  latitude: number;
  name?: string;
  address?: string;
  /** 当前调派编队 ID（confirm 契约 formationId）；由 GET /formation 接口权威下发，WS 画像仅作兜底 */
  formationId?: string;
  /** 调派编队版本（confirm 契约 formationVersion），前端固定为 1，不依赖后端下发 */
  formationVersion?: number;
  primaryStationId?: string;
}

export interface DispatchVehicleState {
  id: string;
  name: string;
  plateNumber?: string;
  type?: string;
  status?: string;
  selected: boolean;
  dispatched: boolean;
  testData?: boolean;
  /** 车辆所属机构 ID，对应 WFS 主管队站图层 gis:view_res_org_dept 的属性 id */
  orgId?: string | null;
  orgName?: string | null;
  vehicleHeightMeters?: number | null;
  etaSeconds?: number | null;
}

export interface DispatchStationState {
  id: string;
  name: string;
  address: string;
  longitude: number;
  latitude: number;
  distanceMeters: number;
  role: DispatchStationRole;
  jurisdiction: GeoJSON.Geometry | null;
  detailsVisible: boolean;
  jurisdictionVisible: boolean;
  routeStatus: DispatchRouteStatus;
  routeDistanceMeters?: number;
  routeDurationSeconds?: number;
  routeError?: string;
  vehicles: DispatchVehicleState[];
  vehiclesLoading?: boolean;
  vehiclesError?: string;
}

export interface DispatchFlowState {
  status: DispatchWorkflowStatus;
  incident: DispatchIncidentState | null;
  primaryStationId: string | null;
  activeStationId: string | null;
  stations: DispatchStationState[];
  selectedVehicleCount: number;
  canDispatch: boolean;
  searchRadiusMeters: number;
  error?: string;
  dispatchResult?: import('@/service/methods/dispatchVehicles').DispatchConfirmResult;
}

export interface DispatchVehicleCommand {
  incidentId: string;
  incident: [number, number];
  vehicles: Array<{
    stationId: string;
    stationName: string;
    vehicleId: string;
    vehicleName: string;
    plateNumber?: string;
  }>;
}

export interface VehicleSelectionResult {
  station: DispatchStationState;
  shouldPlanRoute: boolean;
  shouldRemoveRoute: boolean;
}

export const createDispatchT1InitialState = (): DispatchFlowState => ({
  status: 'idle',
  incident: null,
  primaryStationId: null,
  activeStationId: null,
  stations: [],
  selectedVehicleCount: 0,
  canDispatch: false,
  searchRadiusMeters: 0,
  error: undefined,
  dispatchResult: undefined,
});

const cloneStation = (station: DispatchStationState): DispatchStationState => ({
  ...station,
  vehicles: station.vehicles.map((vehicle) => ({ ...vehicle })),
});

export const cloneDispatchT1State = (
  state: DispatchFlowState,
): DispatchFlowState => ({
  ...state,
  incident: state.incident ? { ...state.incident } : null,
  stations: state.stations.map(cloneStation),
});

/** 测试调派的唯一响应式状态源，不保存 OpenLayers 实例或地图要素。 */
export const useDispatchT1Store = defineStore('dispatchT1Store', {
  state: createDispatchT1InitialState,

  actions: {
    setStationVehicles(stationId: string, vehicles: DispatchVehicleState[] | null, error?: string): void {
      const station = this.findStation(stationId);
      if (!station) return;
      station.vehiclesLoading = vehicles === null && !error;
      station.vehiclesError = error;
      if (vehicles) station.vehicles = vehicles.map(vehicle => ({
        ...vehicle,
        selected: station.vehicles.some(old => old.id === vehicle.id && old.selected),
        dispatched: station.vehicles.some(old => old.id === vehicle.id && old.dispatched),
      }));
      if (error) station.vehicles = [];
      this.recalculateSelection();
    },
    getSnapshot(): DispatchFlowState {
      return cloneDispatchT1State(this.$state);
    },

    beginQuery(incident: DispatchIncidentState): void {
      this.$patch({
        ...createDispatchT1InitialState(),
        status: 'querying',
        incident: { ...incident },
      });
    },

    completeQuery(data: {
      incident: DispatchIncidentState;
      primaryStation: DispatchStationState;
      supportStations: DispatchStationState[];
      searchRadiusMeters: number;
    }): void {
      const primary = cloneStation(data.primaryStation);
      primary.detailsVisible = true;
      primary.jurisdictionVisible = Boolean(primary.jurisdiction);
      this.$patch({
        status: 'ready',
        incident: { ...data.incident },
        primaryStationId: primary.id,
        activeStationId: primary.id,
        stations: [primary, ...data.supportStations.map(cloneStation)],
        selectedVehicleCount: 0,
        canDispatch: false,
        searchRadiusMeters: data.searchRadiusMeters,
        error: undefined,
      });
    },

    fail(message: string): void {
      this.status = 'error';
      this.error = message;
      this.recalculateSelection();
    },

    activateStation(stationId: string): DispatchStationState | null {
      const station = this.findStation(stationId);
      if (!station) return null;
      for (const item of this.stations) {
        if (item.role !== 'support') continue;
        const active = item.id === stationId;
        item.detailsVisible = active;
        item.jurisdictionVisible = active && Boolean(item.jurisdiction);
      }
      if (station.role === 'primary') {
        station.detailsVisible = true;
        station.jurisdictionVisible = Boolean(station.jurisdiction);
      }
      this.activeStationId = station.id;
      return cloneStation(station);
    },

    selectVehicle(
      stationId: string,
      vehicleId: string,
      selected: boolean,
    ): VehicleSelectionResult | null {
      const station = this.findStation(stationId);
      const vehicle = station?.vehicles.find((item) => item.id === vehicleId);
      if (!station || !vehicle || vehicle.dispatched || station.vehiclesLoading || this.status === 'dispatching') return null;
      // 仅“待命”车辆允许勾选；取消勾选不受限，保证车辆状态流转后仍可撤选
      if (selected && !isStandbyVehicleStatus(vehicle.status)) return null;
      vehicle.selected = selected;
      this.recalculateSelection();
      const hasSelectedVehicle = station.vehicles.some((item) => item.selected);
      return {
        station: cloneStation(station),
        shouldPlanRoute: selected && station.routeStatus !== 'ready',
        shouldRemoveRoute: !selected && !hasSelectedVehicle,
      };
    },

    setRoutePlanning(stationId: string): void {
      const station = this.findStation(stationId);
      if (!station) return;
      station.routeStatus = 'planning';
      station.routeError = undefined;
    },

    setRouteReady(
      stationId: string,
      distanceMeters: number,
      durationSeconds: number,
    ): void {
      const station = this.findStation(stationId);
      if (!station) return;
      station.routeStatus = 'ready';
      station.routeDistanceMeters = distanceMeters;
      station.routeDurationSeconds = durationSeconds;
      station.routeError = undefined;
    },

    setRouteError(stationId: string, message: string): void {
      const station = this.findStation(stationId);
      if (!station) return;
      station.routeStatus = 'error';
      station.routeError = message;
    },

    clearRoute(stationId: string): void {
      const station = this.findStation(stationId);
      if (!station) return;
      station.routeStatus = 'idle';
      station.routeDistanceMeters = undefined;
      station.routeDurationSeconds = undefined;
      station.routeError = undefined;
    },

    beginDispatch(): DispatchVehicleCommand | null {
      if (!this.incident || !this.canDispatch) return null;
      const vehicles = this.stations.flatMap((station) =>
        station.vehicles
          .filter((vehicle) => vehicle.selected && !vehicle.dispatched)
          .map((vehicle) => ({
            stationId: station.id,
            stationName: station.name,
            vehicleId: vehicle.id,
            vehicleName: vehicle.name,
            plateNumber: vehicle.plateNumber,
          })),
      );
      if (!vehicles.length) return null;
      this.status = 'dispatching';
      this.error = undefined;
      this.recalculateSelection();
      return {
        incidentId: this.incident.id,
        incident: [this.incident.longitude, this.incident.latitude],
        vehicles,
      };
    },

    completeDispatch(command: DispatchVehicleCommand, result?: DispatchFlowState['dispatchResult']): void {
      this.dispatchResult = result;
      const keys = new Set(
        command.vehicles.map((item) => `${item.stationId}:${item.vehicleId}`),
      );
      for (const station of this.stations) {
        for (const vehicle of station.vehicles) {
          if (!keys.has(`${station.id}:${vehicle.id}`)) continue;
          vehicle.selected = false;
          vehicle.dispatched = true;
        }
      }
      this.status = 'dispatched';
      this.recalculateSelection();
    },

    cancelDispatch(): void {
      if (this.status === 'dispatching') return;
      for (const station of this.stations) {
        station.routeStatus = 'idle';
        station.routeDistanceMeters = undefined;
        station.routeDurationSeconds = undefined;
        station.routeError = undefined;
        for (const vehicle of station.vehicles) {
          vehicle.selected = false;
        }
      }
      this.status = this.stations.length ? 'ready' : 'idle';
      this.error = undefined;
      this.recalculateSelection();
    },

    reset(): void {
      this.$patch(createDispatchT1InitialState());
    },

    findStation(stationId: string): DispatchStationState | undefined {
      return this.stations.find((station) => station.id === stationId);
    },

    recalculateSelection(): void {
      this.selectedVehicleCount = this.stations.reduce(
        (total, station) => total
          + station.vehicles.filter((vehicle) => vehicle.selected).length,
        0,
      );
      this.canDispatch = this.selectedVehicleCount > 0
        && this.status !== 'dispatching'
        && !this.stations.some(station => station.vehiclesLoading);
    },
  },
});

export type DispatchT1Store = ReturnType<typeof useDispatchT1Store>;
