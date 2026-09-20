import { Style, Circle, Fill, Stroke, Text } from 'ol/style'
import { getStyle } from "@/baseComponent/amap/featureStyle";

const ROLE_LABELS = {
  anchor: '锚定物',
  candidate: '查询结果',
  anchor_candidate: '锚定候选',
  search_area: '搜索范围',
}

export { ROLE_LABELS }

const ROLE_POLYGON_STYLES = {
  anchor: { fill: 'rgba(231, 76, 60, 0.28)', stroke: '#e74c3c' },
  candidate: { fill: 'rgba(39, 174, 96, 0.28)', stroke: '#27ae60' },
  anchor_candidate: { fill: 'rgba(243, 156, 18, 0.28)', stroke: '#f39c12' },
  search_area: { fill: 'rgba(33, 150, 243, 0.15)', stroke: '#2196F3' },
}

const ROLE_LINE_STYLES = {
  anchor: { color: '#e74c3c', width: 5 },
  candidate: { color: '#27ae60', width: 4 },
  anchor_candidate: { color: '#f39c12', width: 4, dashed: true },
  search_area: { color: '#2196F3', width: 3, dashed: true },
}

export { ROLE_POLYGON_STYLES, ROLE_LINE_STYLES }

function labelText(feature) {
  return (
    feature.get('matched_name')
    || feature.get('building_name')
    || feature.get('poi_name')
    || feature.get('name')
    || ''
  )
}

function getlabelText(feature) {
  const source_table = feature.get('source_table')
  if (source_table == "poi_1" || source_table == "poi_2") {
    return feature.get('building_name')
  }
  if (source_table == "poi_3") {
    return feature.get('poi_name')
  }
  if (source_table == "aoi_2" || source_table == "aoi_3") {
    return feature.get('aoi_name')
  }
  if (source_table == "loi_road") {
    return feature.get('cn_name')
  }
  return ""
}

function isPolygonGeometry(geomType) {
  return geomType === 'Polygon' || geomType === 'MultiPolygon'
}

function isLineGeometry(geomType) {
  return geomType === 'LineString' || geomType === 'MultiLineString'
}

function getPalette(feature, flash = false) {
  const source_table = feature.get('source_table')
  const data_source = feature.get('data_source')
  if (source_table == "poi_1" || source_table == "poi_2") {
    if (flash) return { fill: 'rgba(231, 76, 60, 0.5)', stroke: '#0000ff' }
    else return { fill: 'rgba(231, 76, 60, 0.8)', stroke: '#e74c3c' }
  }
  if (source_table == "aoi_2") {
    if (flash) return { fill: 'rgba(231, 76, 60, 0.58)', stroke: '#e74c3c' }
    else return { fill: 'rgba(231, 76, 60, 0.28)', stroke: '#e74c3c' }
  }
  if (source_table == "aoi_3") {
    if (flash) return { fill: 'rgba(231, 76, 60, 0.58)', stroke: '#e74c3c' }
    else return { fill: 'rgba(231, 76, 60, 0.28)', stroke: '#e74c3c' }
  }

  // 空间分析数据展示
  if (data_source == "addressbot_spatial_analysis") {
    if (flash) return { fill: 'rgba(227, 230, 90, 0.58)', stroke: 'rgba(211, 126, 90, 0)' }
    else return { fill: 'rgba(227, 230, 90, 0.28)', stroke: 'rgba(211, 126, 90, 0)' }
  }

  return { fill: 'rgba(231, 76, 60, 0.28)', stroke: '#e74c3c' }
}

function polygonStyle(role, feature, dashed = false) {
  //const palette = ROLE_POLYGON_STYLES[role] || ROLE_POLYGON_STYLES.anchor
  const palette = getPalette(feature)
  return new Style({
    fill: new Fill({ color: palette.fill }),
    stroke: new Stroke({
      color: palette.stroke,
      width: 2,
      lineDash: dashed ? [6, 4] : undefined,
    }),
    text: new Text({
      text: getlabelText(feature),
      font: '20px sans-serif',
      fill: new Fill({ color: palette.stroke }),
      stroke: new Stroke({ color: '#fff', width: 3 }),
      overflow: true,
    }),
  })
}

function polygonStyleFlash(role, feature, dashed = false, flash = false) {
  //const palette = ROLE_POLYGON_STYLES[role] || ROLE_POLYGON_STYLES.anchor
  const palette = getPalette(feature, flash)
  return new Style({
    fill: new Fill({ color: palette.fill }),
    stroke: new Stroke({
      color: palette.stroke,
      width: 2,
      lineDash: dashed ? [6, 4] : undefined,
    }),
    text: new Text({
      text: getlabelText(feature),
      font: '20px sans-serif',
      fill: new Fill({ color: palette.stroke }),
      stroke: new Stroke({ color: '#fff', width: 3 }),
      overflow: true,
    }),
  })
}

function lineStyleFlash(role, feature, flash = false) {
  //const palette = ROLE_LINE_STYLES[role] || ROLE_LINE_STYLES.anchor
  const palette = flash ? { color: '#27ae60', width: 5 } : { color: '#e74c3c', width: 5 }
  return new Style({
    stroke: new Stroke({
      color: palette.color,
      width: palette.width,
      lineCap: 'round',
      lineJoin: 'round',
      lineDash: palette.dashed ? [10, 6] : undefined,
    }),
    text: new Text({
      text: getlabelText(feature),
      font: '16px sans-serif',
      fill: new Fill({ color: palette.color }),
      stroke: new Stroke({ color: '#fff', width: 3 }),
      overflow: true,
    }),
  })
}

function lineStyle(role, feature) {
  //const palette = ROLE_LINE_STYLES[role] || ROLE_LINE_STYLES.anchor
  const palette = ROLE_LINE_STYLES.anchor
  return new Style({
    stroke: new Stroke({
      color: palette.color,
      width: palette.width,
      lineCap: 'round',
      lineJoin: 'round',
      lineDash: palette.dashed ? [10, 6] : undefined,
    }),
    text: new Text({
      text: getlabelText(feature),
      font: '16px sans-serif',
      fill: new Fill({ color: palette.color }),
      stroke: new Stroke({ color: '#fff', width: 3 }),
      overflow: true,
    }),
  })
}

export function createSearchStyleFunction() {
  return (feature) => {
    const role = feature.get('role')
    const geomType = feature.getGeometry()?.getType()

    if (isLineGeometry(geomType)) {
      return lineStyle(role, feature)
    }

    if (isPolygonGeometry(geomType)) {
      return polygonStyle(role, feature, role === 'search_area' || role === 'anchor_candidate')
    }

    if (role === 'anchor') {
      return new Style({
        image: new Circle({
          radius: 10,
          fill: new Fill({ color: '#e74c3c' }),
          stroke: new Stroke({ color: '#fff', width: 3 }),
        }),
        text: new Text({
          text: labelText(feature),
          offsetY: -22,
          font: 'bold 13px sans-serif',
          fill: new Fill({ color: '#c0392b' }),
          stroke: new Stroke({ color: '#fff', width: 3 }),
        }),
      })
    }

    if (role === 'candidate') {
      return new Style({
        image: new Circle({
          radius: 9,
          fill: new Fill({ color: '#27ae60' }),
          stroke: new Stroke({ color: '#fff', width: 3 }),
        }),
        text: new Text({
          text: labelText(feature),
          offsetY: -20,
          font: 'bold 12px sans-serif',
          fill: new Fill({ color: '#1e8449' }),
          stroke: new Stroke({ color: '#fff', width: 3 }),
        }),
      })
    }

    if (role === 'anchor_candidate') {
      return new Style({
        image: new Circle({
          radius: 7,
          fill: new Fill({ color: '#f39c12' }),
          stroke: new Stroke({ color: '#fff', width: 2, lineDash: [4, 2] }),
        }),
        text: new Text({
          text: labelText(feature),
          offsetY: -16,
          font: '12px sans-serif',
          fill: new Fill({ color: '#d68910' }),
          stroke: new Stroke({ color: '#fff', width: 3 }),
        }),
      })
    }

    return new Style({
      image: new Circle({
        radius: 6,
        fill: new Fill({ color: '#95a5a6' }),
        stroke: new Stroke({ color: '#fff', width: 2 }),
      }),
    })
  }
}

export function createDisplayStyleFunction() {
  return (feature) => {
    const source_table = feature.get("source_table");
    const geomType = feature.getGeometry()?.getType();

    if (feature.get("alarm") === "alarm") {
      const baseStyle = getStyle("alarm");
      const poi_name = feature.get("poi_name");
      return new Style({
        image: baseStyle.getImage(),
        text: poi_name ? new Text({
          text: poi_name,
          offsetY: -22,
          font: 'bold 12px sans-serif',
          fill: new Fill({ color: '#c0392b' }),
          stroke: new Stroke({ color: '#fff', width: 2 }),
        }) : undefined,
        zIndex: baseStyle.getZIndex(),
      });
    }

    if (isLineGeometry(geomType)) {
      return lineStyle(undefined, feature);
    }

    if (isPolygonGeometry(geomType)) {
      return polygonStyle(undefined, feature);
    }

    if (source_table === "poi_3") {
      return new Style({
        image: new Circle({
          radius: 10,
          fill: new Fill({ color: "#e74c3c" }),
          stroke: new Stroke({ color: "#fff", width: 3 }),
        }),
        text: new Text({
          text: getlabelText(feature),
          offsetY: -22,
          font: "bold 20px sans-serif",
          fill: new Fill({ color: "#c0392b" }),
          stroke: new Stroke({ color: "#fff", width: 3 }),
        }),
      });
    }
    return new Style({
      image: new Circle({
        radius: 6,
        fill: new Fill({ color: "#95a5a6" }),
        stroke: new Stroke({ color: "#fff", width: 2 }),
      }),
    });
  };
}

export function createFlashStyleFunction(feature, flash) {
  const source_table = feature.get("source_table");
  const geomType = feature.getGeometry()?.getType();

  // 检查 alarm 属性，二次包装添加文本标签（闪烁时也保持）
  if (feature.get("alarm") === "alarm") {
    const baseStyle = getStyle("alarm");
    const poi_name = feature.get("poi_name");
    return new Style({
      image: baseStyle.getImage(),
      text: poi_name ? new Text({
        text: poi_name,
        offsetY: -22,
        font: 'bold 12px sans-serif',
        fill: new Fill({ color: '#c0392b' }),
        stroke: new Stroke({ color: '#fff', width: 2 }),
      }) : undefined,
      zIndex: baseStyle.getZIndex(),
    });
  }

  if (isLineGeometry(geomType)) {
    return lineStyleFlash(undefined, feature, flash);
  }

  if (isPolygonGeometry(geomType)) {
    return polygonStyleFlash(undefined, feature, false, flash);
  }

  if (source_table === "poi_3") {
    return new Style({
      image: new Circle({
        radius: 10,
        fill: new Fill(flash ? { color: "#0000ff" } : { color: "#e74c3c" }),
        stroke: new Stroke({ color: "#fff", width: 3 }),
      }),
      text: new Text({
        text: getlabelText(feature),
        offsetY: -22,
        font: "bold 20px sans-serif",
        fill: new Fill(flash ? { color: "#0000ff" } : { color: "#c0392b" }),
        stroke: new Stroke({ color: "#fff", width: 3 }),
      }),
    });
  }
  return new Style({
    image: new Circle({
      radius: 6,
      fill: new Fill({ color: "#95a5a6" }),
      stroke: new Stroke({ color: "#fff", width: 2 }),
    }),
  });
}
