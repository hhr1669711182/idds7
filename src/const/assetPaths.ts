/*
 * @Description: 资源路径常量层 —— 运行期资源（3D 模型 / 字体 / 视频 / 瓦片）URL 的唯一来源。
 * @FilePath: src/const/assetPaths.ts
 *
 * 设计约定见 herness/02-技术设计/前端/资源文件管理-技术方案.md：
 * - R1 编译期资源（模板 :src、JSON import）直接 import 文件本体，不走本文件；
 * - R2 运行期资源只能由 URL 加载，必须经本文件的 assetUrls 取值，禁止裸写 '/model3d/xxx'；
 * - R3 免编译资源留 public/，同样经本文件取路径，保证 BASE 一致。
 *
 * BASE 归一逻辑集中在 withAssetBase，应用形态（base='./'）与库形态（base='/'）都能得到稳定前缀；
 * 库形态宿主部署在子路径时，base 由 vite 注入为 '/子路径/'，此处会保留该前缀。
 */
import { appEnv } from '@/config/env'

/** 判断是否为需要原样返回的绝对协议 URL（http/https/data/blob 之类）。 */
const ABSOLUTE_URL_PATTERN = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

/**
 * 归一 vite base 为「以 / 开头、以 / 结尾」的前缀，再拼接资源相对路径。
 */
export const withAssetBase = (base: string, path = ''): string => {
  const normalizedBase = base.startsWith('./') ? base.slice(1) : base
  const baseWithSlash = normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`
  const prefix = baseWithSlash.startsWith('/') ? baseWithSlash : `/${baseWithSlash}`
  const normalizedPath = path.replace(/^\/+/, '')
  return normalizedPath ? `${prefix}${normalizedPath}` : prefix
}

/** 运行期资源分类前缀。改目录只需改这里一处。 */
export const ASSET_CATEGORY = {
  /**
   * 3D 模型（BIM / 模型研判）。
   * ⚠️ 当前指向 public/model3d/（原样拷贝，无哈希）。B3 文件迁移到 src/assets/models/ 时，
   * 此处与下方 assetUrls 一并原子切换；gltf 及其 12 张贴图 + .bin 因内部相对 uri 依赖，
   * 无法进 Vite 哈希管线，必须整组留在 public 或用 viteStaticCopy 整目录拷贝。
   */
  model: withAssetBase(appEnv.assetBase, 'model3d/'),
  /** three.js 字体 typeface.json。当前指向 public/fonts/，B3 迁移时一并切换。 */
  font: withAssetBase(appEnv.assetBase, 'fonts/'),
  /** 视频 */
  video: withAssetBase(appEnv.assetBase, 'video/'),
  /** 地图瓦片 / 影像（若确认保留本地兜底） */
  tile: withAssetBase(appEnv.assetBase, 'assets/tiles/'),
  /** 免编译资源（public 根） */
  publicRoot: withAssetBase(appEnv.assetBase),
} as const

/**
 * 语义化键 -> 资源 URL。
 * 迁移批次 B2 会把 BIM/module/*.js 与 fontLoader.vue 的硬编码路径改为引用这里。
 */
export const assetUrls = {
  // 3D 模型
  fireTruck: `${ASSET_CATEGORY.model}xf_fire_truck.glb`,
  fireFighter: `${ASSET_CATEGORY.model}xf_firefighter.glb`,
  fireHydrant: `${ASSET_CATEGORY.model}xf_fire_hydrant.obj`,
  extinguisher: `${ASSET_CATEGORY.model}xf_extinguisher.glb`,
  trappedMan: `${ASSET_CATEGORY.model}xf_trapped_man.glb`,
  smokeTexture: `${ASSET_CATEGORY.model}xf_smoke.png`,
  stationMarker: `${ASSET_CATEGORY.model}xf_zddw.png`,
  entranceMarker: `${ASSET_CATEGORY.model}xf_entrance.png`,
  buildingGltf: `${ASSET_CATEGORY.model}B370921843501063A0.gltf`,

  // three.js 字体
  fontGentilisBold: `${ASSET_CATEGORY.font}gentilis_bold.typeface.json`,
  fontGentilisRegular: `${ASSET_CATEGORY.font}gentilis_regular.typeface.json`,
  fontHelvetikerBold: `${ASSET_CATEGORY.font}helvetiker_bold.typeface.json`,
  fontHelvetikerRegular: `${ASSET_CATEGORY.font}helvetiker_regular.typeface.json`,
  fontOptimerBold: `${ASSET_CATEGORY.font}optimer_bold.typeface.json`,
  fontOptimerRegular: `${ASSET_CATEGORY.font}optimer_regular.typeface.json`,
  fontYefonDianying: `${ASSET_CATEGORY.font}YEFONTDianYingPangBaiTi_Regular.json`,

  /** sprite，App.vue fetch 后注入 #svgBase */
  spriteIcons: `${ASSET_CATEGORY.publicRoot}icons.svg`,
} as const

/**
 * three.js 字体可选清单（FontLoader 下拉项）。
 * 历史上有两份重复定义（components/three/fontLoader.vue 与 composables/three/fontLoader.vue），
 * 且后者 label 有笔误（Helvetiker 粗体重复、Optimer 粗体重复、缺 Optimer 常规体），此处合一。
 */
export const FONT_OPTIONS = [
  { label: 'Gentilis 粗体', value: assetUrls.fontGentilisBold },
  { label: 'Gentilis 常规体', value: assetUrls.fontGentilisRegular },
  { label: 'Helvetiker 粗体', value: assetUrls.fontHelvetikerBold },
  { label: 'Helvetiker 常规体', value: assetUrls.fontHelvetikerRegular },
  { label: 'Optimer 粗体', value: assetUrls.fontOptimerBold },
  { label: 'Optimer 常规体', value: assetUrls.fontOptimerRegular },
  { label: 'YEFONT 电影庞白体', value: assetUrls.fontYefonDianying },
] as const

export { ABSOLUTE_URL_PATTERN }
