/*
 * @Author: hhr
 * @Date: 2026-06-11 17:20:52
 * @LastEditTime: 2026-06-11 17:29:54
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\composables\useAlova.ts
 */
export {
  useRequest,
  useWatcher,
  useForm,
  usePagination,
  useAutoRequest,
  useSerialRequest,
  useSerialWatcher,
  useFetcher,
} from 'alova/client'

export { AppError, toAppError, ERROR_CODES } from '@/service/error'
export type { AppErrorMeta } from '@/service/error'
