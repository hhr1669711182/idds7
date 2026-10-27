import { defineStore } from 'pinia'
import { THEME_COLOR } from '../const'

/**
 * 调色盘预设：内置盘 + 自定义。
 *
 * 预设盘是「主题感知的二元组」：每个预设同时给出 DAY / NIGHT 两套值，
 * 切换主题时自动取对应的一套，因此预设盘与主题正交、互不覆盖。
 */
export const PALETTE_PRESETS = ['NIGHT', 'DAY', 'OCEAN', 'EMBER', 'GLASS'] as const
export type PalettePreset = (typeof PALETTE_PRESETS)[number]
export type PaletteName = PalettePreset | 'CUSTOM'

const PALETTE_STORAGE_KEY = 'ids-gis-web:palette'

/** 调色盘状态持久化结构 */
interface PaletteStorage {
  palette: PaletteName
  custom: Record<string, string>
  filter: Record<string, number> | null
}

const readStorage = (key: string): string | null => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const writeStorage = (key: string, value: unknown): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 隐私模式下 localStorage 不可写，忽略即可
  }
}

export const useCommonStore = defineStore('commonStore', {
  state: () => {
    return {
      // 与 index.html 的 data-theme="NIGHT" 保持一致：系统默认夜间模式
      themeColor: THEME_COLOR.NIGHT,
      // 当前调色盘预设；'CUSTOM' 表示由用户自定义变量覆盖
      palette: 'NIGHT' as PaletteName,
      // 自定义调色盘变量（键为 CSS 变量名，值为颜色字符串）
      customPalette: {} as Record<string, string>,
      // 底图滤镜覆盖值；null 表示跟随调色盘预设
      filterOverride: null as Record<string, number> | null,
    }
  },
  getters: {
    /** 生效中的调色盘名，写入 data-palette 属性 */
    activePalette: (state): string => state.palette,
    /** 是否处于自定义调色盘状态 */
    isCustomPalette: (state): boolean => state.palette === 'CUSTOM',
  },
  actions: {
    setThemeColor(color: string) {
      this.themeColor = color
      // 库模式下宿主页面未必带 data-theme，这里统一兜底同步，避免 store 与 DOM 脱节
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', color)
      }
      return { color }
    },
    /** 切换调色盘预设；预设盘通过 data-palette 属性覆盖主题默认盘 */
    setPalette(palette: PaletteName) {
      this.palette = palette
      if (typeof document === 'undefined') return
      const root = document.documentElement
      if (palette === 'CUSTOM') {
        root.setAttribute('data-palette', 'CUSTOM')
        this.applyCustomPalette()
      } else {
        root.setAttribute('data-palette', palette)
        this.clearCustomPalette()
      }
      this.persist()
    },
    /** 应用自定义变量：直接写根元素 inline style，覆盖调色盘预设 */
    applyCustomPalette() {
      if (typeof document === 'undefined') return
      const root = document.documentElement
      Object.entries(this.customPalette).forEach(([name, value]) => {
        root.style.setProperty(name, value)
      })
    },
    /** 清除自定义变量覆盖，回到预设盘 */
    clearCustomPalette() {
      if (typeof document === 'undefined') return
      const root = document.documentElement
      Object.keys(this.customPalette).forEach((name) => {
        root.style.removeProperty(name)
      })
    },
    /** 更新单个自定义变量并持久化 */
    setCustomPaletteVar(name: string, value: string) {
      this.customPalette = { ...this.customPalette, [name]: value }
      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty(name, value)
      }
      // 改自定义变量即进入自定义盘
      if (this.palette !== 'CUSTOM') this.setPalette('CUSTOM')
      else this.persist()
    },
    /** 移除单个自定义变量，回落到预设盘里该 token 的原值 */
    resetCustomPaletteVar(name: string) {
      if (!(name in this.customPalette)) return
      const next = { ...this.customPalette }
      delete next[name]
      this.customPalette = next
      if (typeof document !== 'undefined') {
        document.documentElement.style.removeProperty(name)
      }
      if (Object.keys(next).length === 0 && this.palette === 'CUSTOM') {
        this.setPalette('NIGHT')
      } else {
        this.persist()
      }
    },
    /** 清空全部自定义变量，回到预设盘 */
    resetCustomPalette() {
      this.customPalette = {}
      this.clearCustomPalette()
      this.setPalette('NIGHT')
    },
    /** 设置底图滤镜覆盖值（null 表示跟随预设盘） */
    setFilterOverride(filter: Record<string, number> | null) {
      this.filterOverride = filter
      if (typeof document !== 'undefined') {
        const root = document.documentElement
        if (!filter) {
          ;[
            '--filter-hue-rotate',
            '--filter-invert',
            '--filter-saturate',
            '--filter-brightness',
            '--filter-contrast',
          ].forEach((name) => root.style.removeProperty(name))
        } else {
          Object.entries(filter).forEach(([key, value]) => {
            root.style.setProperty(`--filter-${key}`, `${value}${key === 'hueRotate' ? 'deg' : '%'}`)
          })
        }
      }
      this.persist()
    },
    /** 持久化调色盘状态 */
    persist() {
      writeStorage(PALETTE_STORAGE_KEY, {
        palette: this.palette,
        custom: this.customPalette,
        filter: this.filterOverride,
      } satisfies PaletteStorage)
    },
    /** 从 localStorage 恢复调色盘状态（调色盘 + 自定义变量 + 滤镜） */
    restorePalette() {
      const raw = readStorage(PALETTE_STORAGE_KEY)
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<PaletteStorage>
          if (parsed.palette) {
            this.palette = parsed.palette
          }
          if (parsed.custom && typeof parsed.custom === 'object') {
            this.customPalette = parsed.custom
          }
          if (parsed.filter && typeof parsed.filter === 'object') {
            this.filterOverride = parsed.filter
          }
        } catch {
          // 数据损坏时忽略，使用默认盘
        }
      }
      // 数据落 DOM：先切预设盘，再叠加自定义变量与滤镜覆盖
      this.setPalette(this.palette)
      this.setFilterOverride(this.filterOverride)
    },
  },
})
