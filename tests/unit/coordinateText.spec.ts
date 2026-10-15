import { describe, expect, it } from 'vitest'
import { isCoordinateText, parseCoordinateText } from '@/service/coordinateText'

/**
 * 坐标文本解析契约：把检索框里的多种写法归一为 WGS84 [lng, lat]。
 * 本模块只做解析，不做任何坐标转换 —— 出参即入参坐标系。
 */
describe('service/coordinateText 经纬度文本识别', () => {
  it('英文逗号 / 中文逗号 / 空格三种分隔符均识别', () => {
    expect(parseCoordinateText('123.2436,34.4364')).toEqual([123.2436, 34.4364])
    expect(parseCoordinateText('123.2436，34.4364')).toEqual([123.2436, 34.4364])
    expect(parseCoordinateText('123.2436 34.4364')).toEqual([123.2436, 34.4364])
  })

  it('数组字符串 "[lng, lat]" 识别（兼容带空格写法）', () => {
    expect(parseCoordinateText('[123.2436,34.4364]')).toEqual([123.2436, 34.4364])
    expect(parseCoordinateText('[123.2436, 34.4364]')).toEqual([123.2436, 34.4364])
  })

  it('对象字符串按标准键名识别（大小写不敏感）', () => {
    expect(parseCoordinateText('{"lng":123.2436,"lat":34.4364}')).toEqual([123.2436, 34.4364])
    expect(parseCoordinateText('{"LNG":123.2436,"LAT":34.4364}')).toEqual([123.2436, 34.4364])
  })

  it('对象字符串支持别名键（lon / longitude / latitude / x / y）', () => {
    expect(parseCoordinateText('{"lon":113.93,"lat":22.53}')).toEqual([113.93, 22.53])
    expect(parseCoordinateText('{"longitude":113.93,"latitude":22.53}')).toEqual([113.93, 22.53])
    expect(parseCoordinateText('{"x":113.93,"y":22.53}')).toEqual([113.93, 22.53])
  })

  it('对象字符串的省略写法：坐标塞在字符串值 / 键名里也能解析', () => {
    expect(parseCoordinateText('{"location":"113.93,22.53"}')).toEqual([113.93, 22.53])
    expect(parseCoordinateText('{"113.93,22.53":"addr"}')).toEqual([113.93, 22.53])
  })

  it('经纬度超出合法范围时返回 null（回归：脏输入污染查询）', () => {
    expect(parseCoordinateText('181,34.4364')).toBeNull()
    expect(parseCoordinateText('123.2436,91')).toBeNull()
    expect(parseCoordinateText('-181,-91')).toBeNull()
  })

  it('非坐标文本返回 null：普通地址 / 关键词 / 空串', () => {
    expect(parseCoordinateText('南头消防救援站')).toBeNull()
    expect(parseCoordinateText('深圳')).toBeNull()
    expect(parseCoordinateText('')).toBeNull()
    expect(parseCoordinateText('   ')).toBeNull()
  })

  it('非法 JSON 串不抛错，退回其它规则尝试', () => {
    expect(parseCoordinateText('{"lng":113.93,')).toBeNull()
    expect(parseCoordinateText('[113.93,22.53')).toEqual([113.93, 22.53])
  })

  it('首尾空白被容忍，不影响解析', () => {
    expect(parseCoordinateText('  113.93 , 22.53  ')).toEqual([113.93, 22.53])
  })

  it('isCoordinateText 与 parseCoordinateText 判定一致', () => {
    expect(isCoordinateText('113.93,22.53')).toBe(true)
    expect(isCoordinateText('深圳南山区')).toBe(false)
    expect(isCoordinateText('')).toBe(false)
  })
})
