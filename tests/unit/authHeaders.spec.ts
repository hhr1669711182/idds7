import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUserStore } from '@/store/useUserStore'

describe('alova beforeRequest 凭证统一：Given store 共享态 When 构造请求头 Then 单一来源且无硬编码兜底', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetModules()
  })

  it('Given 已登录会话 When 注入 Then 带 Bearer 与 clientid，并覆盖旧值', async () => {
    const store = useUserStore()
    store.applySharedState(
      JSON.stringify({
        v: 1,
        updatedAt: 1,
        phase: 'onDuty',
        user: { userId: 'u1' },
        auth: { sessionId: 's1', accessToken: 'tok', Tenantid: 't1', 'X-Trace-Id': 'trace1' },
      }),
    )
    const { applyAuthHeaders } = await import('@/service/authHeaders')
    expect(applyAuthHeaders({ Authorization: 'Bearer stale', clientid: 'stale' })).toEqual({
      Authorization: 'Bearer tok',
      clientid: 'ids-seat-web',
      Tenantid: 't1',
      'X-Trace-Id': 'trace1',
    })
  })

  it('Given 未登录或字段为空 When 注入 Then 不写任何凭证头', async () => {
    const store = useUserStore()
    store.applySharedState(
      JSON.stringify({
        v: 1,
        updatedAt: 1,
        phase: 'onDuty',
        user: { userId: 'u1' },
        auth: { sessionId: 's1', accessToken: '   ', Tenantid: '', 'X-Trace-Id': '  ' },
      }),
    )
    const { applyAuthHeaders } = await import('@/service/authHeaders')
    expect(applyAuthHeaders({ Existing: 'keep' })).toEqual({ Existing: 'keep' })
    store.applySharedState(null)
    expect(applyAuthHeaders({})).toEqual({})
  })

  it('Given alova 主实例 When 读取源码 Then 不再含硬编码 JWT 兜底', async () => {
    const source = (await import('@/service/alova?raw')) as { default: string }
    expect(source.default).not.toMatch(/eyJhbGciOi/)
    expect(source.default).toContain('applyAuthHeaders')
  })

  it('Given 高德代理实例 When 读取源码 Then 不携带任何凭证注入', async () => {
    const source = (await import('@/service/alovaMapProxy?raw')) as { default: string }
    expect(source.default).not.toContain('applyAuthHeaders')
    expect(source.default).not.toContain('applyTraceHeaders')
    expect(source.default).not.toMatch(/eyJhbGciOi/)
  })
})
