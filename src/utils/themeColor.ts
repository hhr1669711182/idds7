/**
 * 主题色读取工具。
 *
 * 地图样式（OL Style）与面板样式（CSS 变量）共用同一套主题色定义：
 * - 面板层：直接用 CSS 变量 `var(--accent-cyan)`，主题切换自动生效
 * - 地图层：OL 的 Stroke / Fill / Icon 不认 CSS 变量，必须在绘制时把变量值取出来，
 *   所以统一走 `cssVar()` 读取，并提供回落色兜底。
 *
 * 底图瓦片滤镜（context.filter）同样走调色盘：参数以 CSS 变量下发，
 * 切换调色盘即可改变底图色感，无需改代码。
 */

/** 读取 :root 上的 CSS 变量值；读不到时返回兜底色 */
export const cssVar = (name: string, fallback: string): string => {
  if (typeof window === 'undefined' || !document?.documentElement) return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name)
  const trimmed = value.trim()
  return trimmed ? trimmed : fallback
}

/** 当前主题标识（DAY / NIGHT），与 const.common 的 THEME_COLOR 对齐 */
export type ThemeName = 'DAY' | 'NIGHT'

export const getThemeName = (): ThemeName => {
  if (typeof document === 'undefined') return 'NIGHT'
  return (document.documentElement.getAttribute('data-theme') as ThemeName) || 'NIGHT'
}

/** 当前是否夜间模式 */
export const isNightTheme = (): boolean => getThemeName() === 'NIGHT'

/** 检索/路径规划统一强调色：夜间走 --accent-cyan，白天同样是 --accent-cyan */
export const themeAccent = (fallback = '#25C2F2'): string => cssVar('--accent-cyan', fallback)

/**
 * 把 hex / rgb 颜色加透明度，用于脉冲光晕这类需要 alpha 的场景。
 * 支持 #rgb、#rrggbb、rgba(...)、rgb(...)；无法解析时原样返回。
 */
export const withAlpha = (color: string, alpha: number): string => {
  const value = color.trim()
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)
  if (hexMatch) {
    const hex = hexMatch[1]
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((char) => char + char)
            .join('')
        : hex
    const r = parseInt(full.slice(0, 2), 16)
    const g = parseInt(full.slice(2, 4), 16)
    const b = parseInt(full.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  const rgbMatch = /^rgba?\(([^)]+)\)$/i.exec(value)
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => part.trim())
    if (parts.length >= 3) return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`
  }
  return value
}


/* ============================================================
 * 底图瓦片滤镜：参数化，由调色盘控制
 * ============================================================ */

/** 底图滤镜参数；各值与 CSS 变量 --filter-* 一一对应 */
export interface BasemapFilter {
  /** 色相旋转，默认 180deg（配合 invert 把白天底图转夜间） */
  hueRotate: number
  /** 反相比例 0~100% */
  invert: number
  /** 饱和度倍率百分比 */
  saturate: number
  /** 亮度百分比 */
  brightness: number
  /** 对比度百分比 */
  contrast: number
}

/** 夜间默认滤镜参数（与 palettes.less 的 NIGHT 盘一致） */
export const DEFAULT_BASEMAP_FILTER: BasemapFilter = {
  hueRotate: 180,
  invert: 100,
  saturate: 1600,
  brightness: 80,
  contrast: 90,
}

/** 白天默认滤镜参数（不做任何色相变换） */
export const DAY_BASEMAP_FILTER: BasemapFilter = {
  hueRotate: 0,
  invert: 0,
  saturate: 100,
  brightness: 100,
  contrast: 100,
}

/** 读取 CSS 变量中的数字部分；读不到或非法时回落到 fallback */
const cssNumberVar = (name: string, fallback: number): number => {
  const raw = cssVar(name, '')
  if (!raw) return fallback
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** 从当前调色盘读取底图滤镜参数 */
export const getBasemapFilter = (): BasemapFilter => {
  const fallback = isNightTheme() ? DEFAULT_BASEMAP_FILTER : DAY_BASEMAP_FILTER
  return {
    hueRotate: cssNumberVar('--filter-hue-rotate', fallback.hueRotate),
    invert: cssNumberVar('--filter-invert', fallback.invert),
    saturate: cssNumberVar('--filter-saturate', fallback.saturate),
    brightness: cssNumberVar('--filter-brightness', fallback.brightness),
    contrast: cssNumberVar('--filter-contrast', fallback.contrast),
  }
}

/** 把滤镜参数拼成 CSS filter 字符串 */
export const buildFilterString = (filter: BasemapFilter): string => {
  const hue = filter.hueRotate === 0 ? '0deg' : `${filter.hueRotate}deg`
  return [
    `grayscale(98%)`,
    `invert(${filter.invert}%)`,
    `sepia(20%)`,
    `hue-rotate(${hue})`,
    `saturate(${filter.saturate}%)`,
    `brightness(${filter.brightness}%)`,
    `contrast(${filter.contrast}%)`,
  ].join(' ')
}
