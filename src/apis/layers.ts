import { geoserverApi, type WMSFeatureInfoParams } from '@/service/geoserver'
import type { LayerConfig } from '@/config/layers'

export interface WMSLayerOptions {
  url: string
  params: Record<string, string | number | boolean>
  serverType: 'geoserver'
  crossOrigin: string
  opacity: number
}

const getLayerWMSUrl = (config: LayerConfig) =>
  config.wmsUrl || geoserverApi.getWMSServiceUrl(config.workspace)

const buildFeatureInfoParams = (
  config: LayerConfig,
  viewExtent: [number, number, number, number],
  size: [number, number],
  pixel: [number, number],
  srs = 'EPSG:3857',
): WMSFeatureInfoParams => {
  const [minx, miny, maxx, maxy] = viewExtent
  return {
    layers: config.typeName,
    query_layers: config.typeName,
    bbox: `${minx},${miny},${maxx},${maxy}`,
    width: size[0],
    height: size[1],
    x: pixel[0],
    y: pixel[1],
    srs,
  }
}

export const getWMSLayerOptions = (config: LayerConfig): WMSLayerOptions => ({
  url: getLayerWMSUrl(config),
  params: {
    LAYERS: config.typeName,
    // TILED: true,
    VERSION: '1.1.0',
    STYLES: '',
    FORMAT: 'image/png',
    TRANSPARENT: true,
  },
  serverType: 'geoserver',
  crossOrigin: 'anonymous',
  opacity: 0.8,
})

export const queryWMSFeature = (
  config: LayerConfig,
  viewExtent: [number, number, number, number],
  size: [number, number],
  pixel: [number, number],
) => {
  const params = buildFeatureInfoParams(config, viewExtent, size, pixel)
  return geoserverApi.getWMSFeatureInfo(config.workspace, params)
}

export const getWMSLayerUrl = (config: LayerConfig): string => getLayerWMSUrl(config)
