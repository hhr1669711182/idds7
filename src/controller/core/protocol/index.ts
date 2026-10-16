export interface GISControlEvent<T = any> {
  eventType: string
  data: T
}

export * from './GenericProtocol'
export * from './BusinessProtocol'
export * from './IOProtocol'
export * from './SharedStateProtocol'
export * from './BusinessMapPort'
export * from './IncidentLocationProtocol'
export * from './LegacyMessageProtocol'
