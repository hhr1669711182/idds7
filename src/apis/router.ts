import { appEnv, joinUrl } from '@/config/env'

export interface BackendRouteRecord {
  path: string
  name: string
  component?: string
  redirect?: string
  meta?: Record<string, unknown>
  children?: BackendRouteRecord[]
}

export interface BackendRoutesResponse {
  data?: BackendRouteRecord[]
  routes?: BackendRouteRecord[]
}

const getRoutesApiUrl = () => {
  const routeApiUrl = import.meta.env.VITE_ROUTE_API_URL?.trim()
  if (routeApiUrl) return routeApiUrl
  return joinUrl(appEnv.apiBaseUrl, 'api/routes')
}

const normalizeRoutesResponse = (response: BackendRoutesResponse | BackendRouteRecord[]) => {
  if (Array.isArray(response)) return response
  if (Array.isArray(response.data)) return response.data
  if (Array.isArray(response.routes)) return response.routes
  return []
}

export const fetchBackendRoutes = async (): Promise<BackendRouteRecord[]> => {
  const token = localStorage.getItem('token')
  const response = await fetch(getRoutesApiUrl(), {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : null),
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch backend routes: ${response.status}`)
  }

  return normalizeRoutesResponse(await response.json())
}
