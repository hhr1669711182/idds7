/**
 * ol-ext 没有随包提供类型声明。
 *
 * 裸声明（`declare module 'ol-ext/*'`）会让所有导入都退化成 any，
 * 且具名导入会被当成 namespace（`Cannot use namespace 'X' as a type`）。
 * 这里给出一个带构造函数签名的通配声明：具名导入得到「可 new 的类」，
 * 其余成员仍为 any，但至少能作为类型使用。
 */
declare module 'ol-ext/*' {
  const OlExtClass: new (...args: any[]) => any
  export default OlExtClass
}

/**
 * ol-ext 的 overlay / particule 等具名导出需要一个可作为类型使用的实例类型。
 */
declare module 'ol-ext/overlay/AnimatedCanvas' {
  const AnimatedCanvas: new (...args: any[]) => AnimatedCanvasInstance
  export default AnimatedCanvas
  export type AnimatedCanvasInstance = any
}
