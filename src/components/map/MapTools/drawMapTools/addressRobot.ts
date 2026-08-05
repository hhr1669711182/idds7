import Map from "ol/Map";
import Feature from "ol/Feature";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Style, Circle, Stroke, Fill, Icon } from "ol/style";
import GeoJSON from "ol/format/GeoJSON";
import { geoserverApi, type WFSFeatureParams } from "@/service/geoserver";

export interface AddressRobotData {
  id: string;
  [key: string]: any;
}

/**
 * 地址机器人上图管理功能
 * 负责接收上游数据消息，查询 geoserver 接口，并将数据进行上图展示。
 * 内部通过一个对象对数据进行统一的增删改查控制。
 */
export class AddressRobotManager {
  private map: Map;
  private source: VectorSource;
  private layer: VectorLayer<VectorSource>;
  
  // 数据通过一个对象进行控制：增删改查
  private dataStore: Record<string, AddressRobotData> = {};
  // 维护对应的要素对象，方便图层操作
  private featureStore: Record<string, Feature> = {};

  constructor(map: Map) {
    this.map = map;
    this.source = new VectorSource();
    this.layer = new VectorLayer({
      source: this.source,
      style: this.getDefaultStyle(),
      className: 'address-robot-layer',
      zIndex: 100, // 确保图层在上面
    });
    this.map.addLayer(this.layer);
  }

  /**
   * 默认点样式
   */
  private getDefaultStyle() {
    return new Style({
      image: new Circle({
        radius: 8,
        fill: new Fill({ color: '#409eff' }),
        stroke: new Stroke({ color: '#ffffff', width: 2 })
      })
    });
  }

  /**
   * 根据回调事件接收到上游数据消息之后传递过来查询geoserver接口，然后数据上图
   * @param message 上游传来的数据消息
   * @param workspace geoserver 的 workspace
   * @param typeName geoserver 的图层名称 (如: workspace:layerName)
   * @param filterField 用于在 geoserver 中过滤的字段名，默认为 'id'
   */
  public async handleUpstreamMessage(
    message: any, 
    workspace: string, 
    typeName: string,
    filterField: string = 'id'
  ) {
    // 提取唯一标识
    const id = message.id || message.robotId || message.code;
    if (!id) {
      console.warn("AddressRobotManager: 接收到的消息缺少唯一标识 id/robotId/code", message);
      return;
    }

    // 构造查询参数，根据 id 查询对应的空间信息
    const params: WFSFeatureParams = {
      typeName,
      cql_filter: `${filterField}='${id}'`,
    };

    try {
      const response = await geoserverApi.getWFSFeature(workspace, params);
      
      let feature: Feature | undefined;
      
      // 解析返回的 geojson 要素
      if (response && response.features && response.features.length > 0) {
        const format = new GeoJSON();
        const features = format.readFeatures(response) as Feature[];
        feature = features[0];
      }

      // 合并上游消息与固有数据
      const mergedData = { ...message, id };
      
      if (feature) {
        feature.setProperties(mergedData);
      } else {
        console.warn(`AddressRobotManager: geoserver 中未查询到 id=${id} 的空间要素信息`);
      }

      // 如果数据已存在，则更新，否则新增
      if (this.dataStore[id]) {
        this.updateData(id, mergedData, feature);
      } else {
        this.addData(id, mergedData, feature);
      }
    } catch (error) {
      console.error('AddressRobotManager: 查询 geoserver 接口失败', error);
    }
  }

  /**
   * 增：添加数据及要素
   */
  public addData(id: string, data: AddressRobotData, feature?: Feature) {
    this.dataStore[id] = data;
    
    if (feature) {
      feature.setId(id);
      this.featureStore[id] = feature;
      this.source.addFeature(feature);
    }
  }

  /**
   * 删：删除数据及要素
   */
  public deleteData(id: string) {
    const feature = this.featureStore[id];
    if (feature) {
      this.source.removeFeature(feature);
      delete this.featureStore[id];
    }
    delete this.dataStore[id];
  }

  /**
   * 改：更新数据及要素
   */
  public updateData(id: string, data: Partial<AddressRobotData>, newFeature?: Feature) {
    if (!this.dataStore[id]) {
      console.warn(`AddressRobotManager: 尝试更新不存在的数据 id=${id}`);
      return;
    }

    // 更新数据对象
    this.dataStore[id] = { ...this.dataStore[id], ...data };

    if (newFeature) {
      // 替换整个要素
      const oldFeature = this.featureStore[id];
      if (oldFeature) {
        this.source.removeFeature(oldFeature);
      }
      newFeature.setId(id);
      this.featureStore[id] = newFeature;
      this.source.addFeature(newFeature);
    } else {
      // 仅更新属性
      const existingFeature = this.featureStore[id];
      if (existingFeature) {
        existingFeature.setProperties(this.dataStore[id]);
      }
    }
  }

  /**
   * 查 (单个)：根据 id 获取数据
   */
  public getData(id: string): AddressRobotData | undefined {
    return this.dataStore[id];
  }

  /**
   * 查 (全部)：获取所有控制中的数据
   */
  public getAllData(): AddressRobotData[] {
    return Object.values(this.dataStore);
  }

  /**
   * 清除所有数据和图层内容
   */
  public clear() {
    this.source.clear();
    this.dataStore = {};
    this.featureStore = {};
  }

  /**
   * 销毁实例及图层
   */
  public destroy() {
    this.clear();
    if (this.map && this.layer) {
      this.map.removeLayer(this.layer);
    }
  }
}
