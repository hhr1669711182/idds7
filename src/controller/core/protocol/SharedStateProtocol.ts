export type MapPhase = 'loggedOut' | 'onDuty' | 'popup' | 'inquiry' | 'dispatch' | 'dispatchTrack'

export interface SharedUser {
  userId?: string
  username?: string
  displayName?: string
  employeeNo?: string
  orgId?: string
  orgName?: string
  roles?: string[]
}

export interface SharedAuth {
  accessToken?: string
  sessionId?: string
  Tenantid?: string
  'X-Trace-Id'?: string
  [key: string]: unknown
}

export interface SharedSeat {
  seatNumber?: string
  terminalId?: string
  [key: string]: unknown
}

export interface SharedCurrentAlarm {
  incidentId?: string
  [key: string]: unknown
}

export interface SharedState {
  v?: number
  updatedAt?: number
  auth?: SharedAuth | null
  user?: SharedUser | null
  seat?: SharedSeat | null
  phase?: MapPhase
  currentAlarm?: SharedCurrentAlarm | null
  mode?: string | null
  [key: string]: unknown
}

export interface SharedMessageSession {
  userId: string
  sessionState: string
  seatKey: string
}
