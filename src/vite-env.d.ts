/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROUTE_API_URL?: string
  readonly VITE_ENABLE_DYNAMIC_ROUTES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
