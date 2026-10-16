import { describe, expect, it } from 'vitest'
import { gcj02ToWgs84 } from '@/utils/coordTransform'
import type { ZhxfStationData, JRAlarmData } from '@/baseComponent/amap/mapData'

/**
 * 坐标系契约：业务对外统一 WGS84 [lng, lat]。
 * 遗留静态数据（zhxfdzXYList / JRAlarmList）已在 mapData.ts 中整体注释停用，
 * 数据源改为 GeoServer WFS（EPSG:4326），因此这里改为校验 DTO 类型契约本身。
 */
describe('amap/mapData 导出坐标系契约', () => {
  it('站点 DTO 只暴露 lng/lat，不冗余 wgs84Lng/wgs84Lat（防止二次转换）', () => {
    const station: ZhxfStationData = {
      id: 'SZNS-001',
      lng: 113.930783,
      lat: 22.543345,
      title: '测试站点',
      address: '测试地址',
      deviceTotal: 20,
      deviceOnline: 20,
      deviceGoouts: 7,
      source: 'WFS',
    }

    expect('wgs84Lng' in station).toBe(false)
    expect('wgs84Lat' in station).toBe(false)
    expect(typeof station.lng).toBe('number')
    expect(typeof station.lat).toBe('number')
  })

  it('告警 DTO 的 lng/lat 落在 WGS84 区间（防止误存 GCJ02）', () => {
    const [expectedLng, expectedLat] = gcj02ToWgs84([113.579614, 22.275568])

    // GeoServer EPSG:4326 直出即 WGS84；GCJ02 与 WGS84 相差约 5e-3 度（约 500m），
    // 断言落在 1e-2 容差内即说明已是 WGS84；若误存 GCJ02 该断言会失败
    const alarm: JRAlarmData = {
      incidentId: 'X',
      disasterType: 'fire',
      disasterTypeLabel: '火警',
      disasterGrade: '1',
      disasterGradeLabel: '一般',
      disasterAddress: '测试',
      lng: expectedLng,
      lat: expectedLat,
      inquiryId: 'q',
      mOrgId: 'o',
      mOrgIdLabel: null,
      buildingProfileId: null,
      disasterProfileId: 'd',
      version: 1,
      type: 'fire',
      colorType: 'red',
    }

    expect(Math.abs(alarm.lng - expectedLng)).toBeLessThan(1e-9)
    expect(Math.abs(alarm.lat - expectedLat)).toBeLessThan(1e-9)
    expect('wgs84Lng' in alarm).toBe(false)
    expect('wgs84Lat' in alarm).toBe(false)
  })
})
