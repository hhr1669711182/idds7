<template>
  <div id="cesiumContainer" class="full-screen-div"></div>
</template>
<script setup>
import * as Cesium from "cesium";
import { onMounted } from "vue";
import { commonSetting } from "./module/commonSetting.js";

let viewer;
onMounted(async () => {
  viewer = new Cesium.Viewer("cesiumContainer", {
    imageryProvider: false, // 关闭默认底图
    baseLayerPicker: false, // 隐藏底图切换下拉控件
    geocoder: false, // 隐藏右上角搜索框
    homeButton: false, // 隐藏复位视角按钮
    sceneModePicker: false, // 隐藏2D/3D切换按钮
    navigationHelpButton: false, // 隐藏帮助按钮
    animation: false, // 隐藏时间轴动画
    timeline: false, // 隐藏时间轴
    fullscreenButton: false, // 隐藏全屏按钮
    vrButton: false, // 隐藏VR按钮
    creditContainer: document.createElement("div"), // 隐藏底部版权水印
  });

  loadTDT();
  loadWMSLayer("gis:env_greatchina_road");
  loadWMSLayer("gis:env_entrance_exit");
  loadWhiteBuilding();
  //viewer.zoomTo(dataSource);
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(113.93499, 22.54678, 2000),
    duration: 4,
  });
});

const loadTDT = () => {
  const TDTTK = "4d69f853afdb78666bd34472ce75ab36";
  // 天地图影像
  const tdtLayer = new Cesium.WebMapTileServiceImageryProvider({
    url: `http://t0.tianditu.com/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={TileMatrix}&TILEROW={TileRow}&TILECOL={TileCol}&tk=${TDTTK}`,
    layer: "tdt",
    style: "default",
    format: "image/jpeg",
    tileMatrixSetID: "w",
    maximumLevel: 18,
    show: false,
  });
  viewer.imageryLayers.addImageryProvider(tdtLayer);
  // 天地图注记
  const tdtAnnotionLayer = new Cesium.WebMapTileServiceImageryProvider({
    url: `http://t0.tianditu.com/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={TileMatrix}&TILEROW={TileRow}&TILECOL={TileCol}&tk=${TDTTK}`,
    layer: "tdtAnno",
    style: "default",
    format: "image/jpeg",
    tileMatrixSetID: "w",
    maximumLevel: 18,
    show: false,
  });
  viewer.imageryLayers.addImageryProvider(tdtAnnotionLayer);
};

const loadWhiteBuilding = async () => {
  const data = await loadBuildingData();
  const dataSource = await Cesium.GeoJsonDataSource.load(data);
  viewer.dataSources.add(dataSource);

  dataSource.entities.values.forEach((entity) => {
    const height = entity.properties.met_upfloors.getValue(); // 读取 height 字段
    entity.polygon.height = 0;
    entity.polygon.extrudedHeight = height * 3; // 拉伸高度
    entity.polygon.material = Cesium.Color.WHITE.withAlpha(1); // 材质
    entity.polygon.outline = false;

    let name = entity.properties?.short_name?.getValue();
    const positions = entity.polygon.hierarchy.getValue().positions;
    if (positions && positions.length > 0) {
      let lonSum = 0,
        latSum = 0;
      for (const pos of positions) {
        const carto = Cesium.Cartographic.fromCartesian(pos);
        lonSum += Cesium.Math.toDegrees(carto.longitude);
        latSum += Cesium.Math.toDegrees(carto.latitude);
      }
      const centerLon = lonSum / positions.length;
      const centerLat = latSum / positions.length;
      entity.position = Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 0);

      entity.label = new Cesium.LabelGraphics({
        text: name,
        font: "16px Microsoft YaHei",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
          100,
          1300,
        ),
        pixelOffset: new Cesium.Cartesian2(0, -30), // 向上偏移
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, // 必须贴地！
      });
    }
  });
};

const loadWMSLayer = (layerName) => {
  const wmsLayer = new Cesium.WebMapServiceImageryProvider({
    url: "geoserver/gis/wms",
    layers: layerName,
    parameters: {
      service: "WMS",
      version: "1.1.1",
      request: "GetMap",
      styles: "",
      format: "image/png",
      transparent: true,
    },
    //maximumLevel: 18,
  });
  viewer.imageryLayers.addImageryProvider(wmsLayer);
};

const loadBuildingData = async () => {
  //const url = commonSetting.geoServerUrl
  const ws = commonSetting.gisWorkspace;
  const layerName = commonSetting.whiteBuilding.layerName;

  const postBody = `
    <wfs:GetFeature service="WFS" version="1.0.0" outputFormat="json"
    xmlns:wfs="http://www.opengis.net/wfs"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:gml="http://www.opengis.net/gml">
    <wfs:Query typeName="${layerName}">    
    </wfs:Query>
    </wfs:GetFeature>`;

  const res = await fetch(`geoserver/${ws}/ows`, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: postBody,
  });
  const data = await res.json();
  //console.log("data is  ", data);
  return data;
};
</script>

<style scoped>
.full-screen-div {
  /* 1. 占满视口宽高 */
  width: 100vw;
  height: 100vh;
  /* 2. 清除默认边距（避免出现滚动条） */
  margin: 0;
  padding: 0;
  /* 3. 可选：固定定位（防止滚动时偏移） */
  position: fixed;
  top: 0;
  left: 0;
  /* 可选：背景色，方便查看效果 */
  background-color: #f5f5f5;
  /* 可选：子元素居中（按需添加） */
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
