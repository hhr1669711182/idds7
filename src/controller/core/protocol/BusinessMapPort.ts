import type {
  LocateData,
  LayerToggleData,
  ClickData,
  Overlay3DData,
  FitBoundsData,
  PoiLocationData,
  MarkerAddData,
  TextData,
  PolygonDrawData,
  LineDrawData,
  FeatureRemoveData,
  FeatureVisibleData,
  EsQueryData,
  BufferCalcData,
  RouteCalcData,
  RouteCalcResult,
  SmoothMoveData,
  TrackAppendData,
  TrackPlayData,
} from './GenericProtocol'
import type { LayerRefreshData } from './IOProtocol'
import type { AddressRobotGisSearchData, TrackingVehicleGpsUpdateData } from './BusinessProtocol'

export interface BusinessMapPort {
  readonly ready: boolean
  view: {
    locate(data: LocateData): void
    layerToggle(data: LayerToggleData): void
    layerRefresh(data: LayerRefreshData): void
    simulateClick(data: ClickData): void
    overlay3D(data: Overlay3DData): void
    fitBounds(data: FitBoundsData): void
    poiLocation(data: PoiLocationData): void
  }
  geometry: {
    addMarker(data: MarkerAddData): void
    addText(data: TextData): void
    drawPolygon(data: PolygonDrawData): void
    drawLine(data: LineDrawData): void
    drawRouteCandidates(groupId: string, routes: Array<{ coordinates: [number, number][]; selected?: boolean }>): void
    setFeatureVisible(data: FeatureVisibleData): void
    removeFeature(data: FeatureRemoveData): void
    clearByBusinessId(businessId: string): void
  }
  spatial: {
    esQuery(data: EsQueryData): Promise<unknown>
    calcBuffer(data: BufferCalcData): GeoJSON.Polygon | GeoJSON.MultiPolygon | null
    calcRoute(data: RouteCalcData): Promise<RouteCalcResult[]>
  }
  kinematic: {
    smoothMove(data: SmoothMoveData): void
    appendTrack(data: TrackAppendData): void
    playTrack(data: TrackPlayData): void
  }
  trackingVehicleGpsUpdate(data: TrackingVehicleGpsUpdateData): void
  addressRobotGisSearch(data: AddressRobotGisSearchData, options?: { businessId?: string }): void | Promise<void>
  addressRobotClear(options?: { businessId?: string }): void
}

export interface MockMapPort {
  render(): void | Promise<void>
  disasterSite(data: unknown): void | Promise<void>
  simulate(): void | Promise<void>
  clear(): void
  dispatchVehicles(data: unknown): void | Promise<void>
}

export interface BusinessMapAttachment {
  kind?: 'map' | 'dispatch'
  mock?: MockMapPort
  dispose?: () => void
}
