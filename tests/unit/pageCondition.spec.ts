import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { useUserStore } from '@/store/useUserStore'
import { usePendingCallLocationStore } from '@/store/usePendingCallLocationStore'
import { ROUTE_NAMES } from '@/router/constants'
import {
  PAGE_CONDITION,
  PAGE_CONDITION_STORAGE_KEY,
  clearPageCondition,
  initPageConditionListener,
  navigateByCondition,
  parsePageCondition,
  requestPageCondition,
  setPageCondition,
} from '@/register/pageCondition'
import * as pageCondition from '@/register/pageCondition'
import { getSharedStateRedirect } from '@/router/sharedStateGuard'

const navigation = vi.hoisted(() => ({ replace: vi.fn(), currentRoute: { value: { name: 'map' } } }))
const logger = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('@/router', () => ({ default: navigation }))
vi.mock('@/utils/logger', () => ({ createLogger: () => logger }))

const shared = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    v: 1,
    updatedAt: 1,
    auth: { sessionId: 'session', accessToken: 'token' },
    user: { userId: 'user' },
    phase: 'popup',
    ...overrides,
  })

const settle = async () => {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve()
}

describe('register/pageCondition / Control 迁移 §10.4', () => {
  const disposers: Array<() => void> = []

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    navigation.currentRoute = ref({ name: ROUTE_NAMES.MAP })
    logger.error.mockClear()
    navigation.replace.mockImplementation(async ({ name }: { name: string }) => {
      navigation.currentRoute.value = { name }
    })
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(async () => {
    disposers.splice(0).forEach((dispose) => dispose())
    await settle()
    vi.restoreAllMocks()
  })

  it('Given 旧页面条件各形状 When 解析/写入/清理 Then 保持已有 API 契约；回归 F9', async () => {
    const condition = PAGE_CONDITION.DISPATCH
    for (const raw of [
      condition,
      ...['condition', 'pageState', 'value'].map((key) => JSON.stringify({ [key]: condition })),
    ]) {
      expect(parsePageCondition(raw)).toBe(condition)
    }
    for (const raw of [null, '', 'broken', 'null', '{}', '[]']) expect(parsePageCondition(raw)).toBeNull()
    await requestPageCondition(condition, 'alarm')
    expect(JSON.parse(localStorage.getItem(PAGE_CONDITION_STORAGE_KEY)!)).toMatchObject({ condition, source: 'alarm' })
    expect(navigation.replace).toHaveBeenCalledOnce()
    await setPageCondition(condition)
    expect(navigation.replace).toHaveBeenCalledOnce()
    clearPageCondition()
    expect(localStorage.getItem(PAGE_CONDITION_STORAGE_KEY)).toBeNull()
  })

  it('Given 历史页面条件 When 初始化 Then 不重放，只监听自有键；回归 F9 刷新误调派', async () => {
    localStorage.setItem(PAGE_CONDITION_STORAGE_KEY, PAGE_CONDITION.DISPATCH)
    const addListener = vi.spyOn(window, 'addEventListener')
    const dispose = initPageConditionListener()
    disposers.push(dispose, initPageConditionListener())
    expect(addListener.mock.calls.filter(([name]) => name === 'storage')).toHaveLength(1)
    await settle()
    expect(navigation.replace).not.toHaveBeenCalled()
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'seat-shared-state',
        newValue: shared({ phase: 'inquiry', currentAlarm: { incidentId: 'I1' } }),
        storageArea: localStorage,
      }),
    )
    await settle()
    expect(navigation.replace).not.toHaveBeenCalled()
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: PAGE_CONDITION_STORAGE_KEY,
        newValue: PAGE_CONDITION.DISPATCH,
        storageArea: localStorage,
      }),
    )
    await settle()
    expect(navigation.replace).toHaveBeenLastCalledWith({ name: ROUTE_NAMES.DISPATCH1 })
    dispose()
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: PAGE_CONDITION_STORAGE_KEY,
        newValue: PAGE_CONDITION.REQUEST,
        storageArea: localStorage,
      }),
    )
    await settle()
    expect(navigation.replace).toHaveBeenCalledOnce()
  })

  it('Given store 共享接收 When 快速阶段变化 Then 合并最新有效目标且有效 onDuty 清缓存；回归 §10.4', async () => {
    const store = useUserStore()
    disposers.push(initPageConditionListener())
    store.applySharedState(shared({ phase: 'inquiry', currentAlarm: { incidentId: 'I1' } }))
    store.applySharedState(shared({ phase: 'popup' }))
    store.applySharedState(shared({ phase: 'dispatchTrack' }))
    await settle()
    expect(navigation.replace).toHaveBeenCalledOnce()
    expect(navigation.replace).toHaveBeenLastCalledWith({ name: ROUTE_NAMES.DISPATCH1 })
    const calls = usePendingCallLocationStore()
    const consume = vi.spyOn(calls, 'consume')
    store.applySharedState('{broken')
    await settle()
    expect(consume).not.toHaveBeenCalled()
    store.applySharedState(shared({ phase: 'onDuty' }))
    await settle()
    expect(consume).toHaveBeenCalledOnce()
    expect(navigation.replace).toHaveBeenLastCalledWith({ name: ROUTE_NAMES.MAP })
  })

  it('Given 导航在途 When 新请求连续到达 Then replace 串行且只保留最新目标；回归 §10.4 并发取消', async () => {
    let finishFirst: () => void = () => {}
    navigation.replace.mockImplementationOnce(
      ({ name }: { name: string }) =>
        new Promise<void>((resolve) => {
          finishFirst = () => {
            navigation.currentRoute.value = { name }
            resolve()
          }
        }),
    )
    const first = navigateByCondition(PAGE_CONDITION.DISPATCH)
    await settle()
    void navigateByCondition(PAGE_CONDITION.REQUEST)
    void navigateByCondition(PAGE_CONDITION.DISPATCH)
    void navigateByCondition(PAGE_CONDITION.REQUEST)
    await settle()
    expect(navigation.replace).toHaveBeenCalledOnce()
    finishFirst()
    await first
    expect(navigation.replace.mock.calls.map(([target]) => target.name)).toEqual([
      ROUTE_NAMES.DISPATCH1,
      ROUTE_NAMES.MAP,
    ])
  })

  it('Given flood When phase/显式/自有键普通意图到达 Then 全部抑制，退出后采用新阶段；回归 §10.4', async () => {
    const store = useUserStore()
    disposers.push(initPageConditionListener())
    store.applySharedState(shared({ mode: 'flood', phase: 'inquiry', currentAlarm: { incidentId: 'I1' } }))
    await navigateByCondition(PAGE_CONDITION.DISPATCH)
    await requestPageCondition(PAGE_CONDITION.DISPATCH)
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: PAGE_CONDITION_STORAGE_KEY,
        newValue: PAGE_CONDITION.DISPATCH,
        storageArea: localStorage,
      }),
    )
    await settle()
    expect(navigation.replace).not.toHaveBeenCalled()
    store.applySharedState(shared({ mode: null, phase: 'dispatchTrack' }))
    await settle()
    expect(navigation.replace).toHaveBeenLastCalledWith({ name: ROUTE_NAMES.DISPATCH1 })
  })

  it('Given 排队普通导航 When flood/非法输入/dispose 在执行前到达 Then 旧意图失效；回归 §10.4', async () => {
    const store = useUserStore()
    const dispose = initPageConditionListener()
    disposers.push(dispose)
    store.applySharedState(shared({ phase: 'dispatchTrack' }))
    store.applySharedState(shared({ mode: 'flood', phase: 'popup' }))
    await settle()
    expect(navigation.replace).not.toHaveBeenCalled()
    store.applySharedState(shared({ phase: 'dispatchTrack' }))
    store.applySharedState('{broken')
    await settle()
    expect(navigation.replace).not.toHaveBeenCalled()
    store.applySharedState(shared({ phase: 'dispatchTrack' }))
    dispose()
    await settle()
    expect(navigation.replace).not.toHaveBeenCalled()
  })

  it('Given flood When 多次特灾意图及普通意图混合 Then 单次导航且普通意图不覆盖；回归 F10 唯一路由出口', async () => {
    const store = useUserStore()
    disposers.push(initPageConditionListener())
    store.applySharedState(shared({ mode: 'flood' }))
    const first = pageCondition.requestSpecialMapNavigation()
    void pageCondition.requestSpecialMapNavigation()
    void navigateByCondition(PAGE_CONDITION.REQUEST)
    store.applySharedState(shared({ mode: 'flood', updatedAt: 2 }))
    await first
    expect(navigation.replace).toHaveBeenCalledOnce()
    expect(navigation.replace).toHaveBeenLastCalledWith({ name: ROUTE_NAMES.DISPATCH1 })
    await pageCondition.requestSpecialMapNavigation()
    expect(navigation.replace).toHaveBeenCalledOnce()
  })

  it.each([{ auth: null }, { phase: 'loggedOut' }])(
    'Given flood 与明确登出 %j When 刷新路由 Then 不重定向或留在特灾页',
    (overrides) => {
      const store = useUserStore()
      store.applySharedState(shared({ mode: 'flood', ...overrides }))
      expect(getSharedStateRedirect(ROUTE_NAMES.MAP, store)).toBeUndefined()
      expect(getSharedStateRedirect(ROUTE_NAMES.DISPATCH1, store)).toEqual({ name: ROUTE_NAMES.MAP, replace: true })
    },
  )

  it.each([{ auth: null }, { phase: 'loggedOut' }])(
    'Given flood 与明确登出 %j When 请求特灾导航 Then 不进入特灾页',
    async (overrides) => {
      const store = useUserStore()
      store.applySharedState(shared({ mode: 'flood', ...overrides }))
      await pageCondition.requestSpecialMapNavigation()
      expect(navigation.replace).not.toHaveBeenCalled()
    },
  )

  it('Given 已排队特灾导航 When 执行前 phase 登出 Then 执行时再次拦截', async () => {
    const store = useUserStore()
    store.applySharedState(shared({ mode: 'flood' }))
    const done = pageCondition.requestSpecialMapNavigation()
    store.applySharedState(shared({ mode: 'flood', phase: 'loggedOut' }))
    await done
    expect(navigation.replace).not.toHaveBeenCalled()
  })

  it('Given 已排队特灾导航 When phase 登出后同会话恢复 Then 不复活旧意图', async () => {
    const store = useUserStore()
    disposers.push(initPageConditionListener())
    store.applySharedState(shared({ mode: 'flood' }))
    const done = pageCondition.requestSpecialMapNavigation()
    store.applySharedState(shared({ mode: 'flood', phase: 'loggedOut' }))
    store.applySharedState(shared({ mode: 'flood' }))
    await done
    expect(navigation.replace).not.toHaveBeenCalled()
    await pageCondition.requestSpecialMapNavigation()
    expect(navigation.replace).toHaveBeenCalledOnce()
  })

  it('Given flood 快照缺 auth When 守卫与特灾导航执行 Then 保留旧兼容语义', async () => {
    const store = useUserStore()
    store.applySharedState(shared({ mode: 'flood', auth: undefined }))
    expect(getSharedStateRedirect(ROUTE_NAMES.MAP, store)).toEqual({ name: ROUTE_NAMES.DISPATCH1, replace: true })
    expect(getSharedStateRedirect(ROUTE_NAMES.DISPATCH1, store)).toBeUndefined()
    await pageCondition.requestSpecialMapNavigation()
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith({ name: ROUTE_NAMES.DISPATCH1 })
  })

  it.each(['normal', 'exit', 'session', 'logout', 'dispose'] as const)(
    'Given 特灾意图 When 执行前 %s Then 不执行旧特灾导航；回归 F10 会话失效',
    async (reason) => {
      const store = useUserStore()
      const dispose = initPageConditionListener()
      disposers.push(dispose)
      store.applySharedState(shared({ mode: reason === 'normal' ? null : 'flood' }))
      const navigationDone = pageCondition.requestSpecialMapNavigation()
      if (reason === 'exit') store.applySharedState(shared({ mode: null }))
      if (reason === 'session') store.applySharedState(shared({ mode: 'flood', user: { userId: 'other' } }))
      if (reason === 'logout') store.applySharedState(shared({ mode: 'flood', auth: null }))
      if (reason === 'dispose') dispose()
      await navigationDone
      await settle()
      expect(navigation.replace).not.toHaveBeenCalled()
    },
  )

  it('Given 普通导航在途 When flood 请求进入 Then 特灾与普通导航共用串行队列；回归 F10', async () => {
    const store = useUserStore()
    navigation.currentRoute.value = { name: ROUTE_NAMES.DISPATCH1 }
    let finishFirst: () => void = () => {}
    navigation.replace.mockImplementationOnce(
      ({ name }: { name: string }) =>
        new Promise<void>((resolve) => {
          finishFirst = () => {
            navigation.currentRoute.value = { name }
            resolve()
          }
        }),
    )
    const ordinary = navigateByCondition(PAGE_CONDITION.REQUEST)
    await settle()
    store.applySharedState(shared({ mode: 'flood' }))
    const special = pageCondition.requestSpecialMapNavigation()
    await settle()
    expect(navigation.replace).toHaveBeenCalledOnce()
    finishFirst()
    await Promise.all([ordinary, special])
    expect(navigation.replace.mock.calls.map(([target]) => target.name)).toEqual([
      ROUTE_NAMES.MAP,
      ROUTE_NAMES.DISPATCH1,
    ])
  })

  it('Given 导航失败 When 后续新意图到达 Then 可继续导航；回归 F9', async () => {
    const error = new Error('navigation failed')
    navigation.replace.mockRejectedValueOnce(error)
    await navigateByCondition(PAGE_CONDITION.DISPATCH)
    await navigateByCondition(PAGE_CONDITION.DISPATCH)
    expect(navigation.replace).toHaveBeenCalledTimes(2)
    expect(logger.error).toHaveBeenCalledExactlyOnceWith('页面状态切换失败', {
      condition: PAGE_CONDITION.DISPATCH,
      error,
    })
  })

  it('Given 刷新路由 When store 阶段及 flood 变化 Then 统一 helper 决定保留/重定向；回归 §10.4', () => {
    const store = useUserStore()
    const readStorage = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('shared storage read')
    })
    store.applySharedState(shared({ phase: 'inquiry', currentAlarm: { incidentId: 'I1' } }))
    expect(getSharedStateRedirect(ROUTE_NAMES.DISPATCH1, store)).toBeUndefined()
    store.applySharedState(shared({ phase: 'dispatchTrack' }))
    expect(getSharedStateRedirect(ROUTE_NAMES.DISPATCH1, store)).toBeUndefined()
    store.applySharedState(shared({ phase: 'dispatch' }))
    expect(getSharedStateRedirect(ROUTE_NAMES.DISPATCH1, store)).toEqual({ name: ROUTE_NAMES.MAP, replace: true })
    store.applySharedState(shared({ phase: 'popup', mode: 'flood' }))
    expect(getSharedStateRedirect(ROUTE_NAMES.MAP, store)).toEqual({ name: ROUTE_NAMES.DISPATCH1, replace: true })
    expect(getSharedStateRedirect(ROUTE_NAMES.DISPATCH1, store)).toBeUndefined()
    expect(readStorage).not.toHaveBeenCalled()
  })
})
