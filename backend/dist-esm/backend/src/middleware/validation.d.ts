import type { NextFunction, Request, Response } from 'express';
import Joi from 'joi';
export declare const validateAuth: (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const validateGame: (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const validateMessage: (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const validateProfile: (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const validateMap: (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const sanitizeAllInputs: (req: Request, res: Response, next: NextFunction) => void;
export declare const schemas: {
    auth: Joi.ObjectSchema<any>;
    game: Joi.ObjectSchema<any>;
    message: Joi.ObjectSchema<any>;
    profile: Joi.ObjectSchema<any>;
    map: Joi.ObjectSchema<any>;
};
//# sourceMappingURL=validation.d.ts.map