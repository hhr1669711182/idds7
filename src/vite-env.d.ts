/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROUTE_API_URL?: string
  readonly VITE_ENABLE_DYNAMIC_ROUTES?: string
  readonly VITE_MESSAGE_SERVICE_ORIGIN?: string
  readonly VITE_MESSAGE_CLIENT?: string
  readonly VITE_MESSAGE_SEAT_KEY?: string
  readonly VITE_WS_URL?: string
  readonly VITE_MAP_CENTER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'virtual:element-styles' {
  const content: string
  export default content
}

/** vite-plugin-svg-icons 生成的图标注册副作用模块 */
declare module 'virtual:svg-icons-register' {}

/** unocss 生成的样式副作用模块 */
declare module 'virtual:uno.css' {}
