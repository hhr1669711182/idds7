/**
 * 主题色读取工具。
 *
 * 地图样式（OL Style）与面板样式（CSS 变量）共用同一套主题色定义：
 * - 面板层：直接用 CSS 变量 `var(--accent-cyan)`，主题切换自动生效
 * - 地图层：OL 的 Stroke / Fill / Icon 不认 CSS 变量，必须在绘制时把变量值取出来，
 *   所以统一走 `cssVar()` 读取，并提供回落色兜底。
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
