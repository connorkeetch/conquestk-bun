export class MatchSvcClient {
  async presenceOnline(_input: {
    user_id: string
    connection_id: string
    room_id?: string
  }): Promise<void> {
    return
  }

  async presenceOffline(_input: { user_id: string; connection_id: string }): Promise<void> {
    return
  }

  async presenceMove(_input: {
    user_id: string
    from_room_id?: string
    to_room_id?: string
  }): Promise<void> {
    return
  }
}
