import { defineStore } from 'pinia'
import { TYPES, INIT_LINE_STATE, INIT_PLOYGON_STATE, INIT_CIRCLE_STATE } from '../const/const.map.ts'

type ListItem = {
  uuid: string
  marker?: any
  overlay?: any
  feature?: any
  [key: string]: unknown
}

interface CardStoreDataStruct {
  helpMsg: string
  list: Array<ListItem>
  showUuid: string
  active: string
  // 当前绘制/量算工具类型标识（工具实例本体在 composables/useDrawTool 的模块级单例中，不存 store）
  drawToolType: string
}

export const defaultState = {
  name: '未命名',
  type: '',
  uuid: '',
  formData: {},
}

export const useCardStore = defineStore('cardStore', {
  state: (): CardStoreDataStruct => {
    return {
      helpMsg: '',
      list: [],
      showUuid: '',
      active: '',
      drawToolType: '',
    }
  },
  actions: {
    setActive(type: string) {
      this.active = type
    },
    addData(data: { type: string; uuid: string }) {
      const { type } = data
      let p = { ...defaultState, ...data }
      switch (type) {
        case TYPES.LINESTRING:
          p.formData = INIT_LINE_STATE
          break
        case TYPES.POLYGON:
        case TYPES.RECT:
          p.formData = INIT_PLOYGON_STATE
          break
        case TYPES.CIRCLE:
          p.formData = INIT_CIRCLE_STATE
          break
        default:
      }
      this.list.push({ ...p })
      this.showUuid = data.uuid
      return p
    },
    setShowUuid(uuid: string) {
      this.showUuid = uuid
    },
    setItem(item: Object) {
      this.list.forEach((i: { uuid: string }, index: number) => {
        if (i.uuid == this.showUuid) {
          this.list[index] = { ...i, ...item }
        }
      })
    },
    getItem(): ListItem {
      return this.list.find((i: { uuid: string }) => i.uuid == this.showUuid) || ({} as ListItem)
    },
    removeItem(item: { uuid: string }) {
      this.list = this.list.filter((i) => i.uuid != item.uuid)
    },
  },
})
