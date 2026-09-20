/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROUTE_API_URL?: string
  readonly VITE_ENABLE_DYNAMIC_ROUTES?: string
  readonly VITE_MESSAGE_SERVICE_ORIGIN?: string
  readonly VITE_MESSAGE_CLIENT?: string
  readonly VITE_MESSAGE_SEAT_KEY?: string
  readonly VITE_WS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
