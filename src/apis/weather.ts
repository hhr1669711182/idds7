import { alovaInstance } from '@/service/alova'

/** 内部标准天气字段（面板直接消费） */
export interface WeatherLive {
  adcode: string
  weather: string
  temperature: string
  winddirection: string
  windpower: string
  humidity: string
  reporttime: string
  province: string
  city: string
  /** 以下扩展字段仅新接口返回 */
  minTemperature?: string
  maxTemperature?: string
  precipitation?: string
  alertLevel?: string
  alertDetail?: string
}

/** 新接口原始拼音字段 */
interface RawWeather {
  xzqh: string
  ybrq?: string
  tq: string
  dqwd: string
  zdwd?: string
  zgwd?: string
  fx?: string
  fl?: string
  sd?: string
  jsl?: string
  ms?: string
  rcsj?: string
  rlsj?: string
  week?: string
  yjdj?: string
  zhgxsj?: string
}

const WEATHER_CACHE = 10 * 60 * 1000

export const fetchWeather = (adcode: string) =>
  alovaInstance.Get<RawWeather>('/address-query-client/api/weather', { params: { areaCode: adcode }, cacheFor: WEATHER_CACHE })

const strip = (v: string | undefined, s: string) => (v && v.endsWith(s) ? v.slice(0, -s.length) : '')

/** 拉取 + 转换为内部标准字段 */
export const loadWeather = async (adcode: string, overrides?: { province?: string; city?: string }): Promise<WeatherLive | null> => {
  const raw = await fetchWeather(adcode)
  if (!raw || !raw.tq) return null
  return {
    adcode: raw.xzqh || adcode,
    weather: raw.tq,
    temperature: raw.dqwd,
    winddirection: strip(raw.fx, '风'),
    windpower: strip(raw.fl, '级'),
    humidity: strip(raw.sd, '%'),
    reporttime: raw.zhgxsj ?? '',
    province: overrides?.province ?? '',
    city: overrides?.city ?? '',
    minTemperature: raw.zdwd || undefined,
    maxTemperature: raw.zgwd || undefined,
    precipitation: raw.jsl || undefined,
    alertLevel: raw.yjdj || undefined,
    alertDetail: raw.ms || undefined,
  }
}
