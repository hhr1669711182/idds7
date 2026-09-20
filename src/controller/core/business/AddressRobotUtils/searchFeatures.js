import GeoJSON from 'ol/format/GeoJSON'

const SUPPORTED_GEOM_TYPES = new Set([
  'Point',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
])

function isValidGeometry(geom) {
  return geom
    && SUPPORTED_GEOM_TYPES.has(geom.type)
    && Array.isArray(geom.coordinates)
    && geom.coordinates.length > 0
}

function getFeatureId(feature) {
  return feature.id ?? feature.properties?.source_id ?? feature.properties?.id ?? null
}

function featureKey(feature) {
  const id = getFeatureId(feature)
  const type = feature.geometry?.type
  const role = feature.properties?.role || 'unknown'
  if (id != null && type) return `${role}:${type}:${id}`
  if (id != null) return `${role}:${id}`
  return JSON.stringify(feature.geometry?.coordinates ?? feature)
}

function buildCandidateIdSet(data) {
  const ids = new Set()
  const add = (id) => {
    if (id != null && id !== '') ids.add(String(id))
  }

  data.candidates?.forEach((item) => {
    add(item.id)
    add(item.source_id)
    add(item.geojson?.id)
    add(item.geojson?.properties?.source_id)
  })

  data.geojson?.features?.forEach((feature) => {
    if (feature.properties?.role === 'candidate') {
      add(getFeatureId(feature))
    }
  })

  data.spatial_search_results?.forEach((result) => {
    result.candidates?.forEach((item) => {
      add(item.id)
      add(item.source_id)
      add(item.geojson?.id)
    })
    result.geojson?.features?.forEach((feature) => {
      if (feature.properties?.role === 'candidate') {
        add(getFeatureId(feature))
      }
    })
  })

  return ids
}

function shouldRenderFeature(feature, data, candidateIds) {
  if (feature.properties?.role !== 'anchor_candidate') return true
  if (data.action === 'need_ask') return true
  if (!candidateIds.size) return true

  const id = getFeatureId(feature)
  return !(id && candidateIds.has(String(id)))
}

function pushFeature(rawFeatures, seen, feature, data, candidateIds) {
  if (!feature?.geometry) return
  if (feature.properties?.role === 'search_area') return
  if (!shouldRenderFeature(feature, data, candidateIds)) return

  const key = featureKey(feature)
  if (seen.has(key)) return
  seen.add(key)
  rawFeatures.push(feature)
}

function pushExtraGeometry(rawFeatures, seen, geom, properties, data, candidateIds) {
  if (!isValidGeometry(geom) || geom.type === 'Point') return
  if (properties.role === 'search_area') return

  const feature = {
    type: 'Feature',
    id: `${properties.source_id || properties.id || properties.anchor_id || 'geom'}_${geom.type.toLowerCase()}`,
    geometry: geom,
    properties: {
      ...properties,
      display_kind: geom.type.toLowerCase(),
    },
  }

  pushFeature(rawFeatures, seen, feature, data, candidateIds)
}

function pushFromCollection(rawFeatures, seen, collection, data, candidateIds) {
  collection?.features?.forEach((feature) => {
    pushFeature(rawFeatures, seen, feature, data, candidateIds)
    pushExtraGeometry(rawFeatures, seen, feature.properties?.geom, feature.properties || {}, data, candidateIds)
  })
}

function pushEntityGeocodeCandidates(rawFeatures, seen, entity, data, candidateIds) {
  entity?.geocode_candidates?.forEach((item) => {
    pushFeature(rawFeatures, seen, item.geojson, data, candidateIds)
    pushExtraGeometry(rawFeatures, seen, item.attributes?.geom, {
      role: 'anchor_candidate',
      name: item.name,
      source_id: item.source_id,
    }, data, candidateIds)
  })
}

function inspectEntityGeocodeCandidates(rawFeatures, seen, data, candidateIds) {
  pushEntityGeocodeCandidates(rawFeatures, seen, data.target_anchor, data, candidateIds)
  data.highlight_entities?.forEach((entity) => {
    pushEntityGeocodeCandidates(rawFeatures, seen, entity, data, candidateIds)
  })
}

function pushEntityFeatures(rawFeatures, seen, entity, data, candidateIds) {
  if (!entity) return
  pushFeature(rawFeatures, seen, entity.geojson, data, candidateIds)
  pushExtraGeometry(rawFeatures, seen, entity.attributes?.geom, {
    role: entity.geojson?.properties?.role || 'anchor',
    name: entity.matched_name || entity.name,
    source_id: entity.source_id,
    anchor_id: entity.anchor_id,
  }, data, candidateIds)
  pushEntityGeocodeCandidates(rawFeatures, seen, entity, data, candidateIds)
}

function pushCandidateFeatures(rawFeatures, seen, candidates, data, candidateIds) {
  candidates?.forEach((item) => {
    pushFeature(rawFeatures, seen, item.geojson, data, candidateIds)
    pushExtraGeometry(rawFeatures, seen, item.attributes?.geom, {
      role: 'candidate',
      name: item.name,
      source_id: item.source_id,
      id: item.id,
    }, data, candidateIds)
  })
}

/**
 * 从搜索响应中收集所有可渲染的 GeoJSON Feature，兼容顶层 geojson 为空的情况。
 */
export function collectSearchGeoJsonFeatures(data) {
  const rawFeatures = []
  const seen = new Set()
  const candidateIds = buildCandidateIdSet(data)

  if (data.geojson?.features?.length) {
    pushFromCollection(rawFeatures, seen, data.geojson, data, candidateIds)
    inspectEntityGeocodeCandidates(rawFeatures, seen, data, candidateIds)
    pushCandidateFeatures(rawFeatures, seen, data.candidates, data, candidateIds)
  } else {
    pushEntityFeatures(rawFeatures, seen, data.target_anchor, data, candidateIds)
    data.highlight_entities?.forEach((entity) => {
      pushEntityFeatures(rawFeatures, seen, entity, data, candidateIds)
    })
    pushCandidateFeatures(rawFeatures, seen, data.candidates, data, candidateIds)
    data.spatial_search_results?.forEach((result) => {
      pushFromCollection(rawFeatures, seen, result.geojson, data, candidateIds)
      result.anchors?.forEach((entity) => {
        pushEntityFeatures(rawFeatures, seen, entity, data, candidateIds)
      })
      pushCandidateFeatures(rawFeatures, seen, result.candidates, data, candidateIds)
    })
  }

  if (rawFeatures.length === 0 && data.target_anchor?.longitude != null && data.target_anchor?.latitude != null) {
    pushFeature(rawFeatures, seen, {
      type: 'Feature',
      id: data.target_anchor.source_id,
      geometry: {
        type: 'Point',
        coordinates: [Number(data.target_anchor.longitude), Number(data.target_anchor.latitude)],
      },
      properties: {
        role: 'anchor',
        name: data.target_anchor.matched_name || data.target_anchor.name,
        anchor_id: data.target_anchor.anchor_id,
      },
    }, data, candidateIds)
    pushExtraGeometry(rawFeatures, seen, data.target_anchor.attributes?.geom, {
      role: 'anchor',
      name: data.target_anchor.matched_name || data.target_anchor.name,
      source_id: data.target_anchor.source_id,
      anchor_id: data.target_anchor.anchor_id,
    }, data, candidateIds)
  }

  if (rawFeatures.length === 0) {
    return []
  }

  const format = new GeoJSON()
  return format.readFeatures(
    { type: 'FeatureCollection', features: rawFeatures },
    { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' },
  )
}
