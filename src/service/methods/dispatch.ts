import { alovaInstance } from '../alova'

export type NavPath = {
  fullPath: [number, number][]
  tmcs: any[]
}

export type GetNavPathPlanDTO = {
  alarmId: string
}

export const getNavPathPlanMethod = (payload: GetNavPathPlanDTO) =>
  alovaInstance.Post<NavPath[], GetNavPathPlanDTO>(
    '/dispatch/navPathPlan',
    payload,
    { meta: { showError: true, cacheFor: 0 } }
  )
