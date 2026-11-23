import { asArray } from 'ol/color'
import { describe, expect, it } from 'vitest'
import type { Style } from 'ol/style'
import {
  createSelectedRouteLineStyle,
  createSelectedTmcLineStyle,
  getStyle,
} from '@/baseComponent/OpenlayersMap/style'
import { dimRouteStyle } from '@/baseComponent/tools/routeBase'

const asStyles = (s: Style | Style[]): Style[] => (Array.isArray(s) ? s : [s])

describe('路线高亮样式（底座三层高亮统一）', () => {
  it('createSelectedTmcLineStyle 默认三层 z=100/101/102，宽度 +10/+4/原宽（调派侧存量契约）', () => {
    const styles = asStyles(createSelectedTmcLineStyle('smooth'))
    expect(styles).toHaveLength(3)
    const widths = styles.map((s) => s.getStroke()!.getWidth())
    expect(widths).toEqual([16, 10, 6])
    const zIndex = styles.map((s) => s.getZIndex())
    expect(zIndex).toEqual([100, 101, 102])
    // 内芯色为路况色（smooth 绿）
    expect(styles[2].getStroke()!.getColor()).toBe('#22C55E')
  })

  it('baseZIndex=0 时三层落 z=0/1/2，方向箭头（z20）仍在线层之上（路径规划侧契约）', () => {
    const styles = asStyles(createSelectedTmcLineStyle('jam', 7, 0))
    expect(styles.map((s) => s.getZIndex())).toEqual([0, 1, 2])
    expect(styles.map((s) => s.getStroke()!.getWidth())).toEqual([17, 11, 7])
  })

  it('createSelectedRouteLineStyle 无路况版：三层结构一致，内芯取路线主色而非路况灰', () => {
    const styles = asStyles(createSelectedRouteLineStyle('#25C2F2', 7, 0))
    expect(styles).toHaveLength(3)
    expect(styles.map((s) => s.getZIndex())).toEqual([0, 1, 2])
    // 内芯是路线主色
    expect(styles[2].getStroke()!.getColor()).toBe('#25C2F2')
    // 外两层与 tmc 版同源（外晕 + 主题强调内线）
    expect(styles[0].getStroke()!.getWidth()).toBe(17)
    expect(styles[1].getStroke()!.getWidth()).toBe(11)
  })

  it('dimRouteStyle 对三层高亮保序（z 均 -10）且每层透明度降为原值的 0.7 倍', () => {
    const base = asStyles(createSelectedTmcLineStyle('smooth', 7, 0))
    const styles = asStyles(dimRouteStyle(createSelectedTmcLineStyle('smooth', 7, 0)))
    expect(styles).toHaveLength(3)
    // z 顺序 0→-10、1→-9、2→-8，相对次序不变
    expect(styles.map((s) => s.getZIndex())).toEqual([-10, -9, -8])
    // 每层透明度 = 原层 0.7 倍（相对断言，不依赖 hex 解析）
    styles.forEach((dimmed, i) => {
      const dimColor = asArray(dimmed.getStroke()!.getColor())
      const origColor = asArray(base[i].getStroke()!.getColor())
      const origAlpha = origColor[3] ?? 1
      expect(dimColor[3]).toBeCloseTo(origAlpha * 0.7, 5)
    })
  })

  it('registry：selectedTmcLine / selectedRouteLine 两 key 可取用，默认 width=6 / baseZIndex=100', () => {
    const tmc = asStyles(getStyle('selectedTmcLine', { status: 'unknown' }))
    expect(tmc.map((s) => s.getZIndex())).toEqual([100, 101, 102])
    expect(tmc.map((s) => s.getStroke()!.getWidth())).toEqual([16, 10, 6])

    const route = asStyles(getStyle('selectedRouteLine', { color: '#fff' }))
    expect(route.map((s) => s.getZIndex())).toEqual([100, 101, 102])
    expect(route[2].getStroke()!.getColor()).toBe('#fff')
  })
})
