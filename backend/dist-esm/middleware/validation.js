"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.schemas = exports.sanitizeAllInputs = exports.validateMap = exports.validateProfile = exports.validateMessage = exports.validateGame = exports.validateAuth = void 0;
const joi_1 = __importDefault(require("joi"));
const validator_1 = __importDefault(require("validator"));
const usernamePattern = /^[a-zA-Z0-9_-]+$/;
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
const sqlInjectionPattern = /(\b(ALTER|CREATE|DELETE|DROP|EXEC(UTE)?|INSERT|SELECT|UNION|UPDATE)\b)|(-{2})|(\/*\*+(?:[^*/]|[/][^*])*\*+\/)|(\b(OR|AND)\b.*?=.*?['"=])|([';])|(\bEXEC\b)|(\bCAST\b)|(\bDECLARE\b)/i;
const xssPattern = /<script|javascript:|onerror=|onclick=|<iframe|<embed|<object|eval\(|expression\(|prompt\(|alert\(/i;
const noSqlInjectionPattern = /\$where|\$regex|\$ne|\$gt|\$lt|\$gte|\$lte|\$in|\$nin|\$or|\$and|\$not|\$exists/i;
function sanitizeInput(input) {
    if (!input)
        return input;
    let sanitized = input.replace(/\0/g, '');
    sanitized = sanitized.trim();
    sanitized = validator_1.default.escape(sanitized);
    return sanitized;
}
function validateAgainstPatterns(value, fieldName) {
    if (sqlInjectionPattern.test(value)) {
        return `${fieldName} contains potentially malicious SQL patterns`;
    }
    if (xssPattern.test(value)) {
        return `${fieldName} contains potentially malicious script patterns`;
    }
    if (noSqlInjectionPattern.test(value)) {
        return `${fieldName} contains potentially malicious NoSQL patterns`;
    }
    return null;
}
const authSchema = joi_1.default.object({
    username: joi_1.default.string()
        .min(3)
        .max(20)
        .pattern(usernamePattern)
        .custom((value, helpers) => {
        const error = validateAgainstPatterns(value, 'Username');
        if (error)
            return helpers.error('any.invalid', { message: error });
        return value.trim();
    })
        .messages({
        'string.pattern.base': 'Username can only contain letters, numbers, underscores, and hyphens',
        'string.min': 'Username must be at least 3 characters',
        'string.max': 'Username cannot exceed 20 characters',
    }),
    identifier: joi_1.default.string()
        .max(255)
        .messages({
        'string.empty': 'Please provide username or email',
        'any.required': 'Username or email is required',
    }),
    email: joi_1.default.string()
        .email({ tlds: { allow: true } })
        .max(100)
        .custom((value, helpers) => {
        if (value && !validator_1.default.isEmail(value)) {
            return helpers.error('any.invalid', { message: 'Invalid email format' });
        }
        if (value) {
            const error = validateAgainstPatterns(value, 'Email');
            if (error)
                return helpers.error('any.invalid', { message: error });
            return validator_1.default.normalizeEmail(value) || value;
        }
        return value;
    })
        .messages({
        'string.email': 'Please provide a valid email address',
        'string.max': 'Email cannot exceed 100 characters',
    }),
    password: joi_1.default.string()
        .min(8)
        .max(128)
        .pattern(passwordPattern)
        .required()
        .messages({
        'string.pattern.base': 'Password must contain at least 8 characters, including 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character',
        'string.min': 'Password must be at least 8 characters',
        'string.max': 'Password cannot exceed 128 characters',
    }),
});
const authRegisterSchema = authSchema.fork(['username', 'email'], (schema) => schema.required());
const authLoginSchema = authSchema.fork(['identifier'], (schema) => schema.required());
const gameSchema = joi_1.default.object({
    name: joi_1.default.string()
        .min(3)
        .max(50)
        .pattern(/^[a-zA-Z0-9\s\-_'.!]+$/)
        .required()
        .custom((value, helpers) => {
        const error = validateAgainstPatterns(value, 'Game name');
        if (error)
            return helpers.error('any.invalid', { message: error });
        return sanitizeInput(value);
    })
        .messages({
        'string.pattern.base': 'Game name can only contain letters, numbers, spaces, and basic punctuation',
        'string.min': 'Game name must be at least 3 characters',
        'string.max': 'Game name cannot exceed 50 characters',
    }),
    maxPlayers: joi_1.default.number().integer().min(2).max(8).required().messages({
        'number.min': 'Game must have at least 2 players',
        'number.max': 'Game cannot have more than 8 players',
    }),
    isPrivate: joi_1.default.boolean().default(false),
    password: joi_1.default.string()
        .max(50)
        .custom((value, helpers) => {
        if (value) {
            const error = validateAgainstPatterns(value, 'Game password');
            if (error)
                return helpers.error('any.invalid', { message: error });
        }
        return value;
    }),
    mapId: joi_1.default.string().uuid().required().messages({
        'string.guid': 'Invalid map ID format',
    }),
    settings: joi_1.default.object({
        turnTimeLimit: joi_1.default.number().integer().min(30).max(300),
        cardTradeMode: joi_1.default.string().valid('fixed', 'progressive', 'none'),
        fogOfWar: joi_1.default.boolean(),
        autoAssignTerritories: joi_1.default.boolean(),
    }).default({}),
});
const messageSchema = joi_1.default.object({
    content: joi_1.default.string()
        .min(1)
        .max(500)
        .required()
        .custom((value, helpers) => {
        const error = validateAgainstPatterns(value, 'Message');
        if (error)
            return helpers.error('any.invalid', { message: error });
        return sanitizeInput(value);
    })
        .messages({
        'string.min': 'Message cannot be empty',
        'string.max': 'Message cannot exceed 500 characters',
    }),
    roomId: joi_1.default.string().uuid().required(),
    type: joi_1.default.string().valid('chat', 'system', 'game').default('chat'),
});
const profileSchema = joi_1.default.object({
    username: joi_1.default.string()
        .min(3)
        .max(20)
        .pattern(usernamePattern)
        .custom((value, helpers) => {
        const error = validateAgainstPatterns(value, 'Username');
        if (error)
            return helpers.error('any.invalid', { message: error });
        return sanitizeInput(value);
    }),
    bio: joi_1.default.string()
        .max(500)
        .allow('')
        .custom((value, helpers) => {
        if (value) {
            const error = validateAgainstPatterns(value, 'Bio');
            if (error)
                return helpers.error('any.invalid', { message: error });
            return sanitizeInput(value);
        }
        return value;
    }),
    location: joi_1.default.string()
        .max(100)
        .allow('')
        .custom((value, helpers) => {
        if (value) {
            const error = validateAgainstPatterns(value, 'Location');
            if (error)
                return helpers.error('any.invalid', { message: error });
            return sanitizeInput(value);
        }
        return value;
    }),
    website: joi_1.default.string()
        .uri({ scheme: ['http', 'https'] })
        .max(200)
        .allow('')
        .messages({
        'string.uri': 'Please provide a valid website URL',
    }),
});
const mapSchema = joi_1.default.object({
    name: joi_1.default.string()
        .min(3)
        .max(100)
        .required()
        .custom((value, helpers) => {
        const error = validateAgainstPatterns(value, 'Map name');
        if (error)
            return helpers.error('any.invalid', { message: error });
        return sanitizeInput(value);
    }),
    description: joi_1.default.string()
        .max(1000)
        .allow('')
        .custom((value, helpers) => {
        if (value) {
            const error = validateAgainstPatterns(value, 'Description');
            if (error)
                return helpers.error('any.invalid', { message: error });
            return sanitizeInput(value);
        }
        return value;
    }),
    tags: joi_1.default.array()
        .items(joi_1.default.string()
        .max(30)
        .pattern(/^[a-zA-Z0-9\-_]+$/)
        .custom((value, helpers) => {
        const error = validateAgainstPatterns(value, 'Tag');
        if (error)
            return helpers.error('any.invalid', { message: error });
        return sanitizeInput(value);
    }))
        .max(10)
        .messages({
        'array.max': 'Cannot have more than 10 tags',
    }),
    isPublic: joi_1.default.boolean().default(false),
    territories: joi_1.default.array().min(10).max(200).required().messages({
        'array.min': 'Map must have at least 10 territories',
        'array.max': 'Map cannot have more than 200 territories',
    }),
});
const validateAuth = (req, res, next) => {
    const isRegister = req.path === '/register' || req.path.endsWith('/register');
    const isLogin = req.path === '/login' || req.path.endsWith('/login');
    let schema = authSchema;
    if (isRegister) {
        schema = authRegisterSchema;
    }
    else if (isLogin) {
        schema = authLoginSchema;
    }
    const { error, value } = schema.validate(req.body, {
        abortEarly: false,
    });
    if (error) {
        const details = error.details.map((detail) => {
            const field = detail.path.join('.');
            let message = detail.message;
            if (field === 'password' && detail.type === 'string.pattern.base') {
                message =
                    'Password must be at least 8 characters and include: 1 uppercase letter (A-Z), 1 lowercase letter (a-z), 1 number (0-9), and 1 special character (@$!%*?&)';
            }
            return { field, message };
        });
        let mainMessage = 'Please check your input';
        if (details.length > 0) {
            if (details[0].field === 'password') {
                mainMessage = 'Password does not meet security requirements';
            }
            else if (details[0].field === 'email') {
                mainMessage = 'Please provide a valid email address';
            }
            else if (details[0].field === 'username') {
                mainMessage = 'Username format is invalid';
            }
        }
        return res.status(400).json({
            error: 'Validation failed',
            message: mainMessage,
            details,
        });
    }
    req.body = value;
    return next();
};
exports.validateAuth = validateAuth;
const validateGame = (req, res, next) => {
    const { error, value } = gameSchema.validate(req.body, { abortEarly: false });
    if (error) {
        return res.status(400).json({
            error: 'Validation error',
            message: 'Invalid game configuration',
            details: error.details.map((detail) => ({
                field: detail.path.join('.'),
                message: detail.message,
            })),
        });
    }
    if (value.isPrivate && (!value.password || value.password.trim().length === 0)) {
        return res.status(400).json({
            error: 'Validation error',
            message: 'Private games require a password',
            details: [
                {
                    field: 'password',
                    message: 'Password is required when creating a private game',
                },
            ],
        });
    }
    req.body = value;
    return next();
};
exports.validateGame = validateGame;
const validateMessage = (req, res, next) => {
    const { error, value } = messageSchema.validate(req.body, { abortEarly: false });
    if (error) {
        return res.status(400).json({
            error: 'Validation error',
            message: 'Invalid message',
            details: error.details.map((detail) => ({
                field: detail.path.join('.'),
                message: detail.message,
            })),
        });
    }
    req.body = value;
    return next();
};
exports.validateMessage = validateMessage;
const validateProfile = (req, res, next) => {
    const { error, value } = profileSchema.validate(req.body, { abortEarly: false });
    if (error) {
        return res.status(400).json({
            error: 'Validation error',
            message: 'Invalid profile data',
            details: error.details.map((detail) => ({
                field: detail.path.join('.'),
                message: detail.message,
            })),
        });
    }
    req.body = value;
    return next();
};
exports.validateProfile = validateProfile;
const validateMap = (req, res, next) => {
    const { error, value } = mapSchema.validate(req.body, { abortEarly: false });
    if (error) {
        return res.status(400).json({
            error: 'Validation error',
            message: 'Invalid map data',
            details: error.details.map((detail) => ({
                field: detail.path.join('.'),
                message: detail.message,
            })),
        });
    }
    req.body = value;
    return next();
};
exports.validateMap = validateMap;
const sanitizeAllInputs = (req, res, next) => {
    if (req.query) {
        for (const key of Object.keys(req.query)) {
            if (typeof req.query[key] === 'string') {
                const value = req.query[key];
                const error = validateAgainstPatterns(value, `Query parameter ${key}`);
                if (error) {
                    res.status(400).json({
                        error: 'Security validation failed',
                        message: error,
                    });
                    return;
                }
            }
        }
    }
    if (req.params) {
        for (const key of Object.keys(req.params)) {
            if (typeof req.params[key] === 'string') {
                const value = req.params[key];
                const error = validateAgainstPatterns(value, `URL parameter ${key}`);
                if (error) {
                    res.status(400).json({
                        error: 'Security validation failed',
                        message: error,
                    });
                    return;
                }
            }
        }
    }
    next();
};
exports.sanitizeAllInputs = sanitizeAllInputs;
exports.schemas = {
    auth: authSchema,
    game: gameSchema,
    message: messageSchema,
    profile: profileSchema,
    map: mapSchema,
};
//# sourceMappingURL=validation.js.map