/*
 * @Author: hhr
 * @Date: 2026-07-01 11:11:28
 * @LastEditTime: 2026-08-27 17:48:45
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\controller\core\business\CallController.ts
 */
import type { BusinessMapPort } from '../protocol/BusinessMapPort'
import { FEATURE_TYPE_PREFIX } from '../generic'
import type { LocateCallData, LocateCallRemoveData, AoiEsQueryData, AoiEsGisZoneData } from '../protocol'
import { INCOMING_CALL_FOCUS_ZOOM } from '@/store/usePendingCallLocationStore'
import { usePendingCallLocationStore } from '@/store/usePendingCallLocationStore'
import { PAGE_CONDITION, clearPageCondition, navigateByCondition, setPageCondition } from '@/register/pageCondition'
import type { AlarmCallAnswerStatusData } from '../protocol/LegacyMessageProtocol'

export class CallController {
  /** 同一来电只自动定位一次，持续的 POSITION_SYNC 不得反复覆盖用户视图。 */
  private locatedCallIds = new Set<string>()

  /** 当前图上的来电 ID：图面同一时刻仅保留一通来电的粗定位要素。 */
  private activeCallId: string | null = null

  constructor(private genericController: BusinessMapPort) {}

  public receiveLocateCall(data: LocateCallData, contextKey: string) {
    usePendingCallLocationStore().queue(data, contextKey)
    clearPageCondition()
    void navigateByCondition(PAGE_CONDITION.REQUEST)
    this.locateCall(data)
  }

  public answerStatusChanged(data: AlarmCallAnswerStatusData) {
    if (data.answered === true && String(data.newState ?? '').toUpperCase() === 'ANSWERED' && data.ended !== true) {
      void setPageCondition(PAGE_CONDITION.REQUEST, 'alarm.call.answer_status_changed')
      return
    }
    clearPageCondition()
    void navigateByCondition(PAGE_CONDITION.REQUEST)
  }

  /**
   * [EC-03] 来电初略定位
   *
   * 新一通来电（id 变化）渲染前先移除上一通来电的粗定位圈、点位与文本，
   * 避免挂断消息在问询/调派页被保留策略忽略后旧要素残留（多圈多点）；
   * 同一来电的 POSITION_SYNC 持续推送只做要素原地更新，不整体清除，
   * 避免高频闪烁及呼吸动画重启。
   */
  public locateCall(data: LocateCallData) {
    if (!this.genericController.ready) return
    const { view, geometry, spatial } = this.genericController

    // 先清除上一通来电的上图结果，再渲染本次来电
    if (this.activeCallId && this.activeCallId !== data.id) {
      geometry.removeFeature({ featureIds: [this.activeCallId] })
      this.locatedCallIds.delete(this.activeCallId)
    }
    this.activeCallId = data.id

    // POSITION_SYNC 会持续推送：仅首次立即定位到 17，后续只更新要素。
    // 不使用动画，避免下一条同步消息在动画完成前再次触发导致实际停在 15；
    // 也不重复调整视图，确保用户之后仍可自由手动缩放。
    if (!this.locatedCallIds.has(data.id)) {
      this.locatedCallIds.add(data.id)
      view.locate({
        lngLat: [data.longitude, data.latitude],
        zoom: INCOMING_CALL_FOCUS_ZOOM,
      })
    }
    const buffer = spatial.calcBuffer({
      input: {
        center: [data.longitude, data.latitude],
        radius: data.radius,
      },
    })

    geometry.drawPolygon({
      id: data.id,
      geometry: buffer,
      fillColor: 'rgba(0, 100, 255, 0.2)',
      strokeColor: 'rgba(0, 100, 255, 1)',
    })

    geometry.addMarker({
      id: data.id,
      lngLat: [data.longitude, data.latitude],
      iconType: 'point',
      animate: 'breathe',
    })

    if (data.Carrier_Loc) {
      geometry.addText({
        id: data.id,
        lngLat: [data.longitude, data.latitude],
        arg: {
          offsetY: 30,
        },
        text: data.Carrier_Loc,
      })
    } else {
      // 本次结果无文本标注时，移除同 id 可能残留的旧文本要素
      geometry.removeFeature({
        featureIds: [`${FEATURE_TYPE_PREFIX.TEXT}${data.id}`],
      })
    }
  }

  /**
   * [EC-04] 来电挂断移除
   */
  public locateCallRemove(data: LocateCallRemoveData) {
    const { geometry } = this.genericController
    this.locatedCallIds.delete(data.id)
    if (this.activeCallId === data.id) {
      this.activeCallId = null
    }
    geometry.removeFeature({
      featureIds: [data.id],
    })
  }

  /**
   * 来电弹屏阶段结束回到值守（popup -> onDuty，挂断未立案）时，
   * 清除图上全部来电粗定位要素（粗定位圈 polygon、点位 marker、文本标注 text），
   * 并重置同一来电仅自动定位一次的记录，避免下一次来电不再定位视图。
   */
  public clearLocateCalls() {
    const { geometry } = this.genericController
    const callIds = Array.from(this.locatedCallIds)
    if (callIds.length) {
      // 传入原始 businessId，GeometryController 会按该 ID 分组清除所有类型要素
      geometry.removeFeature({ featureIds: callIds })
    }
    this.locatedCallIds.clear()
    this.activeCallId = null
  }

  /**
   * [WC-02] 围栏集合 AOI 定位高亮资源
   */
  public async aoiEsQuery(data: AoiEsQueryData) {
    const { spatial, geometry } = this.genericController
    const result = await spatial.esQuery({
      geometry: { type: 'Polygon', coordinates: [data.points] },
      types: data.layerNames,
      limit: 100,
    })

    // 假设检索后返回多个资源点，在地图上标绘高亮
    if (result && Array.isArray(result)) {
      result.forEach((item: any, index: number) => {
        geometry.addMarker({
          id: `aoi_res_${index}`,
          lngLat: [item.longitude, item.latitude],
        })
      })
    }
  }

  /**
   * [WC-03] 根据辖区队站围栏ID反查围栏集合数据
   */
  public async aoiEsGisZone(data: AoiEsGisZoneData) {
    const { view, geometry } = this.genericController

    // 模拟根据 ID 获取围栏 GeoJSON
    const mockZoneGeoJson: any = {
      type: 'Polygon',
      coordinates: [
        [
          [113.9, 22.5],
          [114.0, 22.5],
          [114.0, 22.6],
          [113.9, 22.6],
          [113.9, 22.5],
        ],
      ],
    }

    // 1. 围栏辖区高亮
    geometry.drawPolygon({
      id: `zone_${data.zoneId}`,
      geometry: mockZoneGeoJson,
      fillColor: 'rgba(0, 100, 255, 0.2)',
      strokeColor: 'rgba(0, 100, 255, 1)',
    })

    // 2. 视口自适应定位到该围栏
    view.fitBounds({
      geometry: mockZoneGeoJson,
      padding: [50, 50, 50, 50],
    })
  }
}
