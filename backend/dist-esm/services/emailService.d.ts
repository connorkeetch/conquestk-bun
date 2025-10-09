interface VerificationEmailData {
    username: string;
    email: string;
    verificationLink: string;
    expiresIn: string;
}
declare class EmailService {
    private resend;
    private emailEnabled;
    constructor();
    private initialize;
    private sendEmail;
    generateVerificationToken(): string;
    sendVerificationEmail(data: VerificationEmailData): Promise<boolean>;
    sendPasswordResetEmail(data: {
        username: string;
        email: string;
        resetLink: string;
        expiresIn: string;
    }): Promise<boolean>;
    isEnabled(): boolean;
}
declare const _default: EmailService;
export default _default;
//# sourceMappingURL=emailService.d.ts.map