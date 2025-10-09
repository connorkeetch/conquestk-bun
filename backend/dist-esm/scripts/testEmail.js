"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const emailService_js_1 = __importDefault(require("../services/emailService.js"));
const logger_js_1 = require("../utils/logger.js");
async function testEmail() {
    const testEmail = 'connorkeetch@gmail.com';
    const testUsername = 'TestUser';
    const testToken = 'test-token-123';
    try {
        const verificationResult = await emailService_js_1.default.sendVerificationEmail({
            username: testUsername,
            email: testEmail,
            verificationLink: `http://localhost:5173/verify-email/${testToken}`,
            expiresIn: '24 hours',
        });
        if (verificationResult) {
            logger_js_1.logger.info('✅ Verification email sent successfully', { testEmail });
        }
        else {
            logger_js_1.logger.warn('⚠️ Verification email service returned falsy result', { testEmail });
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const resetResult = await emailService_js_1.default.sendPasswordResetEmail({
            username: testUsername,
            email: testEmail,
            resetLink: `http://localhost:5173/reset-password/${testToken}`,
            expiresIn: '1 hour',
        });
        if (resetResult) {
            logger_js_1.logger.info('✅ Password reset email sent successfully', { testEmail });
        }
        else {
            logger_js_1.logger.warn('⚠️ Password reset email service returned falsy result', { testEmail });
        }
    }
    catch (error) {
        logger_js_1.logger.error('❌ Test email script encountered an error', { error });
    }
    process.exit(0);
}
testEmail();
//# sourceMappingURL=testEmail.js.map