import TileLayer from "ol/layer/Tile.js";
import Graticule from "ol/layer/Graticule.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import XYZ from "ol/source/XYZ.js";
import { WATER_TEXT } from "./const.map.ts";
import { getLayerConfig } from "@/config/layers.ts";

export const LAYER_NAMES = {
  AMAP_LAYER: "AMAP_LAYER",
  GOOGLE_LAYER: "GOOGLE_LAYER",
  VECTOR_LAYER: "VECTOR_LAYER",
  GRID_LAYER: "GRID_LAYER", //网格
  WATER_LAYER: "WATER_LAYER", //水印
};

// 临时前端数据上图图层 ID。后续接入真实接口/WMS 后，优先从这里移除映射。
export const TEMP_FRONTEND_LAYER_IDS = {
  STATION: "gis:view_res_org_dept111",
  TODAY_DISASTER: "gis:disaster_info",
  ONLINE_CAR: "gis:env_car",
  INCOMING_CALL: "gis:incoming_call",
} as const;

export const TEMP_FRONTEND_LAYER_ID_SET = new Set<string>(
  Object.values(TEMP_FRONTEND_LAYER_IDS),
);

export const isTempFrontendLayerId = (id: string) =>
  TEMP_FRONTEND_LAYER_ID_SET.has(id) || getLayerConfig(id)?.useWebMock;

/**矢量图地址 */
export const AMAP_URL =
  "https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}"; //矢量图
  // "http://webst04.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}";

/**影像图地址 */
export const GOOGLE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const AMAP_LAYER = (layerName?: string) => {
  return new TileLayer({
    source: new XYZ({
      url: AMAP_URL,
      crossOrigin: "anonymous",
    }),
    className: layerName || LAYER_NAMES.AMAP_LAYER,
  });
};

export const GOOGLE_LAYER = new TileLayer({
  source: new XYZ({ url: GOOGLE_URL, crossOrigin: "anonymous" }),
  className: LAYER_NAMES.GOOGLE_LAYER,
  visible: false,
});

//矢量图层
export const VECTOR_LAYER = (layerName?: string) => {
  return new VectorLayer({
    source: new VectorSource(),
    className: layerName || LAYER_NAMES.VECTOR_LAYER,
  });
};

//网格图层
export const GRID_LAYER = new Graticule({
  className: LAYER_NAMES.GRID_LAYER,
  showLabels: true,
  visible: false,
});

//水印图层
export const WATER_LAYER = ({
  waterText = WATER_TEXT,
}: {
  waterText: string;
}) => {
  return new TileLayer({
    source: new XYZ({
      tileUrlFunction: () => {
        var tileSize = [512, 512];
        const half = tileSize[0] / 2;
        var tileSize = [512, 512];

        const context = createCanvasContext2D(tileSize[0], tileSize[0]);

        function createCanvasContext2D(opt_width: number, opt_height: number) {
          const canvas = document.createElement("canvas");
          if (opt_width) {
            canvas.width = opt_width;
          }
          if (opt_height) {
            canvas.height = opt_height;
          }
          return canvas.getContext("2d");
        }

        if (context) {
          context.fillStyle = "rgba(184, 184, 184, 0.8)";

          context.textAlign = "center";
          context.textBaseline = "middle";

          context.font = "32px microsoft yahei";

          context?.rotate((Math.PI / 180) * 30);

          context?.fillText(waterText, half, half);
        }

        return context?.canvas.toDataURL();
      },
    }),
    className: LAYER_NAMES.WATER_LAYER,
    visible: false,
  });
};
