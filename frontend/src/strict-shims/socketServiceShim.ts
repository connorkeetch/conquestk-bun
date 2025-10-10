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
}
