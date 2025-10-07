import apiClient from './api'

export interface BlockRecord {
  blockerId: string
  blockedId: string
  createdAt: string
}

export const blockService = {
  async list(): Promise<BlockRecord[]> {
    const res = await apiClient.get<{ blocks: BlockRecord[] }>('/messages/blocks')
    return res.data.blocks ?? []
  },

  async block(blockedUserId: string): Promise<BlockRecord> {
    const res = await apiClient.post<{ block: BlockRecord }>('/messages/blocks', { blockedUserId })
    return res.data.block
  },

  async unblock(blockedUserId: string): Promise<void> {
    await apiClient.delete(`/messages/blocks/${blockedUserId}`)
  },
}

export default blockService
