// Strict-check shim for socketService to avoid pulling full implementation during
// frontend strict-optional typecheck. Only the minimal surface used by messages UI.

export const socketService = {
  markConversationReadViaSocket: (_conversationId: string, _cb?: (_ack: unknown) => void) => {
    /* no-op */
  },
  createConversation: (
    _payload: unknown,
    _cb?: (_ack: { ok: boolean; conversation?: { id: string }; error?: string }) => void,
  ) => {
    /* no-op */
  },
  sendConversationMessage: (_payload: unknown, _cb?: (_ack: any) => void) => {
    /* no-op */
  },
  startConversationTyping: (_conversationId: string) => {
    /* no-op */
  },
  stopConversationTyping: (_conversationId: string) => {
    /* no-op */
  },
  archiveConversation: (_conversationId: string, _cb?: (_ack: any) => void) => {
    /* no-op */
  },
  on: <TEvent extends string>(_event: TEvent, _handler: (payload: any) => void) => {
    /* no-op */
  },
  off: <TEvent extends string>(_event: TEvent, _handler?: (payload: any) => void) => {
    /* no-op */
  },
  emit: (_event: string, _payload?: unknown) => {
    /* no-op */
  },
  beginTurn: (_roomId: string) => {
    /* no-op */
  },
  deployArmies: (_roomId: string, _territoryId: string, _armies: number) => {
    /* no-op */
  },
  attack: (_roomId: string, _fromId: string, _toId: string) => {
    /* no-op */
  },
  transferConquestArmies: (_roomId: string, _fromId: string, _toId: string, _armies: number) => {
    /* no-op */
  },
  fortify: (_roomId: string, _fromId: string, _toId: string, _armies: number) => {
    /* no-op */
  },
  undoFortify: (_roomId: string) => {
    /* no-op */
  },
  endTurn: (_roomId: string) => {
    /* no-op */
  },
  sendGameAction: (_payload: { roomId: string; action: unknown }) => {
    /* no-op */
  },
}
