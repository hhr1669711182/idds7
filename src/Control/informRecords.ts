export const INFORM_UNREAD_COUNT_EVENT = 'ids:inform-unread-count'

const jsonHeaders = { 'Content-Type': 'application/json' }

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
  })
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url} ${response.status}`)
  }
  return response.json() as Promise<T>
}

export const acknowledgeInformRecord = async (recordId: unknown) => {
  const id = String(recordId ?? '').trim()
  if (!id) return false

  //应使用消息基址
  await requestJson('/api/inform-record-refs/batch-update-status', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify([id]),
  })
  return true
}

export const fetchUnreadCount = async () => {
  const result = await requestJson<{ data?: number }>('/api/inform-record-refs/total')
  return Math.max(0, Number(result?.data) || 0)
}

export const loadMessages = async (current = 1, size = 20) => {
  const result = await requestJson<{ data?: unknown }>('/api/inform-record-refs/pages', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ current, size, entity: {} }),
  })
  return result?.data
}

export const markAllMessagesRead = async () => {
  await requestJson('/api/inform-record-refs/batch-read')
  window.dispatchEvent(new CustomEvent(INFORM_UNREAD_COUNT_EVENT, { detail: 0 }))
}

export const startUnreadCountPolling = (intervalMs = 30000) => {
  let stopped = false

  const refresh = async () => {
    try {
      const count = await fetchUnreadCount()
      if (!stopped) {
        window.dispatchEvent(new CustomEvent(INFORM_UNREAD_COUNT_EVENT, { detail: count }))
      }
    } catch (error) {
      if (!stopped) console.warn('[inform-records] 未读消息数量查询失败', error)
    }
  }

  void refresh()
  const timer = window.setInterval(refresh, intervalMs)
  return () => {
    stopped = true
    window.clearInterval(timer)
  }
}
