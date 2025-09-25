import apiClient from './api'
import type {
  ConversationDetail,
  ConversationListItem,
  ConversationMessage,
  UnreadSummaryEntry,
} from '../types/messages'

export async function fetchConversations(options?: {
  limit?: number
  offset?: number
}): Promise<ConversationListItem[]> {
  const response = await apiClient.get<{ conversations: ConversationListItem[] }>(
    '/messages/conversations',
    {
      params: options,
    },
  )
  return response.data.conversations ?? []
}

export async function fetchConversationDetail(
  conversationId: string,
  options?: { markRead?: boolean },
): Promise<ConversationDetail> {
  const response = await apiClient.get<ConversationDetail>(
    `/messages/conversations/${conversationId}`,
    {
      params: options?.markRead === false ? { markRead: false } : undefined,
    },
  )
  return response.data
}

export async function fetchConversationMessages(
  conversationId: string,
  options?: { before?: string; limit?: number },
): Promise<ConversationMessage[]> {
  const response = await apiClient.get<{ messages: ConversationMessage[] }>(
    `/messages/conversations/${conversationId}/messages`,
    { params: options },
  )
  return response.data.messages ?? []
}

export async function fetchUnreadSummary(): Promise<UnreadSummaryEntry[]> {
  const response = await apiClient.get<{ conversations: UnreadSummaryEntry[] }>(
    '/messages/conversations/unread',
  )
  return response.data.conversations ?? []
}
