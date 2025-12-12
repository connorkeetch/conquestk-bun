/**
 * Stub type declarations for socket.io
 *
 * Socket.io has been removed from the project in favor of Colyseus.
 * These stub types exist to satisfy TypeScript for files that still import
 * socket.io types but whose socket.io functionality is disabled at runtime.
 *
 * TODO: Remove this file once all socket.io dependent code is migrated to Colyseus
 */

declare module 'socket.io' {
  // Phantom type helper to suppress "unused type parameter" errors
  type Phantom<T> = T extends never ? never : unknown

  export interface Socket<
    ClientToServerEvents = Record<string, unknown>,
    ServerToClientEvents = Record<string, unknown>,
    InterServerEvents = Record<string, unknown>,
    SocketData = Record<string, unknown>,
  > {
    // Use phantom types to suppress unused warnings
    _clientEvents?: Phantom<ClientToServerEvents>
    _serverEvents?: Phantom<ServerToClientEvents>
    _interEvents?: Phantom<InterServerEvents>
    id: string
    data: SocketData
    userId?: string
    username?: string
    joinedConversations?: Set<string>
    join(room: string): Promise<void>
    emit(event: string, ...args: unknown[]): boolean
    on(event: string, listener: (...args: unknown[]) => void): this
  }

  export interface RemoteSocket<
    ServerToClientEvents = Record<string, unknown>,
    SocketData = Record<string, unknown>,
  > {
    _serverEvents?: Phantom<ServerToClientEvents>
    id: string
    data: SocketData
    emit(event: string, ...args: unknown[]): boolean
  }

  export interface BroadcastOperator<
    ServerToClientEvents = Record<string, unknown>,
    SocketData = Record<string, unknown>,
  > {
    _serverEvents?: Phantom<ServerToClientEvents>
    _socketData?: Phantom<SocketData>
    emit(event: string, ...args: unknown[]): boolean
  }

  export interface Namespace<
    ClientToServerEvents = Record<string, unknown>,
    ServerToClientEvents = Record<string, unknown>,
    InterServerEvents = Record<string, unknown>,
    SocketData = Record<string, unknown>,
  > {
    _clientEvents?: Phantom<ClientToServerEvents>
    _interEvents?: Phantom<InterServerEvents>
    to(room: string): BroadcastOperator<ServerToClientEvents, SocketData>
    in(room: string): {
      fetchSockets(): Promise<RemoteSocket<ServerToClientEvents, SocketData>[]>
    } & BroadcastOperator<ServerToClientEvents, SocketData>
  }

  export interface Server<
    ClientToServerEvents = Record<string, unknown>,
    ServerToClientEvents = Record<string, unknown>,
    InterServerEvents = Record<string, unknown>,
    SocketData = Record<string, unknown>,
  > extends Namespace<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> {
    of(nsp: string): Namespace<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
  }
}
