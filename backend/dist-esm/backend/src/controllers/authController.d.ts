import type { Request, Response } from 'express';
export declare class AuthController {
    private userService;
    private readonly tokenExpiration;
    private readonly jwtSecret;
    register: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
    login: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
    logout: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
    getProfile: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
    verifyEmail: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
    forgotPassword: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
    resetPassword: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
    resendVerification: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
    changePassword: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
    updateSettings: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
    deleteAccount: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
}
//# sourceMappingURL=authController.d.ts.map