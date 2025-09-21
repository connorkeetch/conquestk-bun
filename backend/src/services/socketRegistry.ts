import type { Server } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared'

let ioInstance: Server<ClientToServerEvents, ServerToClientEvents> | null = null

export function registerSocketServer(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
): void {
  ioInstance = io
}

export function getSocketServer(): Server<ClientToServerEvents, ServerToClientEvents> {
  if (!ioInstance) {
    throw new Error('Socket server not initialized')
  }
  return ioInstance
}

export function tryGetSocketServer():
  | Server<ClientToServerEvents, ServerToClientEvents>
  | null {
  return ioInstance
}
