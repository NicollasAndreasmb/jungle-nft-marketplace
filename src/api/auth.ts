/**
 * Session and account endpoints: register, login, current session, logout and realtime ticket.
 */
import {
  type LoginRequest,
  type RegisterRequest,
  realtimeTicketSchema,
  sessionLookupSchema,
  sessionSchema,
} from './contracts'
import { request, requestVoid } from './http'

export const authApi = {
  getSession: (signal?: AbortSignal) => request(sessionLookupSchema, { url: '/auth/session', method: 'GET', signal }),
  login: (body: LoginRequest) => request(sessionSchema, { url: '/auth/login', method: 'POST', data: body }),
  register: (body: RegisterRequest) => request(sessionSchema, { url: '/auth/register', method: 'POST', data: body }),
  logout: () => requestVoid({ url: '/auth/logout', method: 'POST' }),
  createRealtimeTicket: () => request(realtimeTicketSchema, { url: '/realtime/ticket', method: 'POST' }),
}
