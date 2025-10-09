export interface User {
    id: string;
    username: string;
    email: string;
    password_hash: string;
    email_verified?: boolean;
    verification_token?: string | null;
    is_admin?: boolean;
    skill_rating?: number;
    skill_confidence?: number;
    total_ranked_games?: number;
    ranked_wins?: number;
    ranked_losses?: number;
    highest_skill_rating?: number;
    last_ranked_game_at?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=user.d.ts.map