import {
  cloneDispatchT1State,
  createDispatchT1InitialState,
  useDispatchT1Store,
  type DispatchFlowState,
  type DispatchIncidentState,
  type DispatchStationState,
  type DispatchT1Store,
  type DispatchVehicleCommand,
  type VehicleSelectionResult,
} from '@/store/useDispatchT1Store';

export type {
  DispatchFlowState,
  DispatchIncidentState,
  DispatchRouteStatus,
  DispatchStationRole,
  DispatchStationState,
  DispatchVehicleCommand,
  DispatchVehicleState,
  DispatchWorkflowStatus,
  VehicleSelectionResult,
} from '@/store/useDispatchT1Store';

export const createDispatchInitialState = createDispatchT1InitialState;

export type DispatchStateListener = (
  state: Readonly<DispatchFlowState>,
) => void;

/** 消防调派流程控制器；状态统一存放在 useDispatchT1Store。 */
export class DispatchController1 {
  constructor(private readonly store: DispatchT1Store = useDispatchT1Store()) {}

  public subscribe(listener: DispatchStateListener): () => void {
    listener(this.getState());
    return this.store.$subscribe(
      (_mutation, state) => listener(
        cloneDispatchT1State(state as DispatchFlowState),
      ),
      { detached: true, flush: 'sync' },
    );
  }

  public getState(): Readonly<DispatchFlowState> {
    return this.store.getSnapshot();
  }

  public beginQuery(incident: DispatchIncidentState): void {
    this.store.beginQuery(incident);
  }

  public completeQuery(data: {
    incident: DispatchIncidentState;
    primaryStation: DispatchStationState;
    supportStations: DispatchStationState[];
    searchRadiusMeters: number;
  }): void {
    this.store.completeQuery(data);
  }

  public fail(message: string): void {
    this.store.fail(message);
  }

  public setStationVehicles(stationId: string, vehicles: DispatchStationState['vehicles'] | null, error?: string): void {
    this.store.setStationVehicles(stationId, vehicles, error);
  }

  public activateStation(stationId: string): DispatchStationState | null {
    return this.store.activateStation(stationId);
  }

  public selectVehicle(
    stationId: string,
    vehicleId: string,
    selected: boolean,
  ): VehicleSelectionResult | null {
    return this.store.selectVehicle(stationId, vehicleId, selected);
  }

  public setRoutePlanning(stationId: string): void {
    this.store.setRoutePlanning(stationId);
  }

  public setRouteReady(
    stationId: string,
    distanceMeters: number,
    durationSeconds: number,
  ): void {
    this.store.setRouteReady(stationId, distanceMeters, durationSeconds);
  }

  public setRouteError(stationId: string, message: string): void {
    this.store.setRouteError(stationId, message);
  }

  public clearRoute(stationId: string): void {
    this.store.clearRoute(stationId);
  }

  public beginDispatch(): DispatchVehicleCommand | null {
    return this.store.beginDispatch();
  }

  public completeDispatch(command: DispatchVehicleCommand, result?: DispatchFlowState['dispatchResult']): void {
    this.store.completeDispatch(command, result);
  }

  public cancelDispatch(): void {
    this.store.cancelDispatch();
  }

  public reset(): void {
    this.store.reset();
  }

  public destroy(): void {
    // Store 可能同时被 WebSocket、列表和其他业务组件使用，此处不销毁 Pinia。
  }
}
