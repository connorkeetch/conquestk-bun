import type { User } from '../types/user.js';
type CreateUserInput = {
    username: string;
    email: string;
    password: string;
    email_verified?: boolean;
    verification_token?: string | null;
};
type PasswordResetTokenRow = {
    id: string;
    user_id: string;
    token: string;
    expires_at: Date;
    used_at: Date | null;
    created_at: Date;
};
type PasswordResetToken = PasswordResetTokenRow & {
    used: boolean;
};
export type EmailVerificationLog = {
    user_id: string;
    email: string;
    token: string;
    created_at: Date;
};
export declare class UserService {
    create(userData: CreateUserInput): Promise<User>;
    findById(id: string): Promise<User | null>;
    findByEmail(email: string): Promise<User | null>;
    findByUsername(username: string): Promise<User | null>;
    findByVerificationToken(token: string): Promise<User | null>;
    verifyEmail(userId: string): Promise<void>;
    updateVerificationToken(userId: string, token: string): Promise<void>;
    logEmailVerification(data: {
        user_id: string;
        email: string;
        token: string;
    }): Promise<void>;
    updateEmailVerificationLog(token: string): Promise<void>;
    getEmailVerificationLogByToken(token: string): Promise<EmailVerificationLog | null>;
    getRecentVerificationAttempts(userId: string): Promise<number>;
    createPasswordResetToken(data: {
        user_id: string;
        token: string;
        expires_at: Date;
    }): Promise<void>;
    findPasswordResetToken(token: string): Promise<PasswordResetToken | null>;
    markPasswordResetTokenUsed(token: string): Promise<void>;
    updatePassword(userId: string, hashedPassword: string): Promise<void>;
    getRecentPasswordResetAttempts(userId: string): Promise<number>;
    deleteUser(userId: string): Promise<void>;
    updateLastLogin(userId: string): Promise<void>;
}
export {};
//# sourceMappingURL=userService.d.ts.map