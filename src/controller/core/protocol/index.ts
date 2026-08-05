export interface GISControlEvent<T = any> {
  eventType: string;
  data: T;
}

export * from './GenericProtocol';
export * from './BusinessProtocol';
export * from './IOProtocol';