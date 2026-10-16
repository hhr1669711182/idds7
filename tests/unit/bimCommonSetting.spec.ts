import { describe, expect, it } from 'vitest'
import { commonSetting, getDispatchData } from '@/components/BIM/module/commonSetting'

const expectClose = (actual: number, expected: number, tolerance = 1e-9) => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
}

describe('BIM commonSetting 调度数据', () => {
  it('调度路径直接消费 WGS84，不再二次 GCJ02 转换（关键算法差异）', () => {
    const basePoint = [113.57457848012538, 22.278587375010183] as const
    const nextPoint = [113.575, 22.279] as const

    commonSetting.truckFullPath = []
    commonSetting.searchRadius = 350

    getDispatchData({
      alarmData: { gisX: basePoint[0], gisY: basePoint[1] },
      navPathPlanData: {
        [basePoint.join(',')]: { fullPath: [basePoint, nextPoint] },
      },
    })

    const path = commonSetting.truckFullPath.at(-1)
    expect(path).toBeDefined()
    expectClose(path![0][0], basePoint[0])
    expectClose(path![0][1], basePoint[1])
    expectClose(path![1][0], nextPoint[0])
    expectClose(path![1][1], nextPoint[1])
  })
})
