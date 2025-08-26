export interface User {
  id: string;
  username: string;
  email: string;
  password: string;
  email_verified?: boolean;
  verification_token?: string | null;
  verification_sent_at?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}