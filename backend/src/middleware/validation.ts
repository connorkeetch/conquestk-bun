import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import validator from 'validator';

/**
 * Custom validators for enhanced security
 */

// Username validation: alphanumeric with underscores and hyphens
const usernamePattern = /^[a-zA-Z0-9_-]+$/;

// Password validation: at least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;

// Prevent common SQL injection patterns
const sqlInjectionPattern = /(\b(ALTER|CREATE|DELETE|DROP|EXEC(UTE)?|INSERT|SELECT|UNION|UPDATE)\b)|(-{2})|(\/*\*+(?:[^*/]|[/][^*])*\*+\/)|(\b(OR|AND)\b.*?=.*?['"=])|([';])|(\bEXEC\b)|(\bCAST\b)|(\bDECLARE\b)/i;

// Prevent XSS patterns
const xssPattern = /<script|javascript:|onerror=|onclick=|<iframe|<embed|<object|eval\(|expression\(|prompt\(|alert\(/i;

// Prevent NoSQL injection patterns
const noSqlInjectionPattern = /\$where|\$regex|\$ne|\$gt|\$lt|\$gte|\$lte|\$in|\$nin|\$or|\$and|\$not|\$exists/i;

/**
 * Sanitization helpers
 */
function sanitizeInput(input: string): string {
  if (!input) return input;
  
  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Escape HTML entities
  sanitized = validator.escape(sanitized);
  
  return sanitized;
}

function validateAgainstPatterns(value: string, fieldName: string): string | null {
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

/**
 * Validation schemas
 */

// Enhanced authentication schema with security validations
const authSchema = Joi.object({
  username: Joi.string()
    .min(3)
    .max(20)
    .pattern(usernamePattern)
    .custom((value, helpers) => {
      const error = validateAgainstPatterns(value, 'Username');
      if (error) return helpers.error('any.invalid', { message: error });
      return sanitizeInput(value);
    })
    .when('$isRegister', { is: true, then: Joi.required() })
    .messages({
      'string.pattern.base': 'Username can only contain letters, numbers, underscores, and hyphens',
      'string.min': 'Username must be at least 3 characters',
      'string.max': 'Username cannot exceed 20 characters'
    }),
  
  email: Joi.string()
    .email({ tlds: { allow: true } })
    .max(100)
    .required()
    .custom((value, helpers) => {
      if (!validator.isEmail(value)) {
        return helpers.error('any.invalid', { message: 'Invalid email format' });
      }
      const error = validateAgainstPatterns(value, 'Email');
      if (error) return helpers.error('any.invalid', { message: error });
      return validator.normalizeEmail(value) || value;
    })
    .messages({
      'string.email': 'Please provide a valid email address',
      'string.max': 'Email cannot exceed 100 characters'
    }),
  
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(passwordPattern)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least 8 characters, including 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character',
      'string.min': 'Password must be at least 8 characters',
      'string.max': 'Password cannot exceed 128 characters'
    })
});

// Game creation validation
const gameSchema = Joi.object({
  name: Joi.string()
    .min(3)
    .max(50)
    .pattern(/^[a-zA-Z0-9\s\-_'.!]+$/)
    .required()
    .custom((value, helpers) => {
      const error = validateAgainstPatterns(value, 'Game name');
      if (error) return helpers.error('any.invalid', { message: error });
      return sanitizeInput(value);
    })
    .messages({
      'string.pattern.base': 'Game name can only contain letters, numbers, spaces, and basic punctuation',
      'string.min': 'Game name must be at least 3 characters',
      'string.max': 'Game name cannot exceed 50 characters'
    }),
  
  maxPlayers: Joi.number()
    .integer()
    .min(2)
    .max(8)
    .required()
    .messages({
      'number.min': 'Game must have at least 2 players',
      'number.max': 'Game cannot have more than 8 players'
    }),
  
  isPrivate: Joi.boolean().default(false),
  
  password: Joi.string()
    .max(50)
    .when('isPrivate', { is: true, then: Joi.required() })
    .custom((value, helpers) => {
      if (value) {
        const error = validateAgainstPatterns(value, 'Game password');
        if (error) return helpers.error('any.invalid', { message: error });
      }
      return value;
    }),
  
  mapId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Invalid map ID format'
    }),
  
  settings: Joi.object({
    turnTimeLimit: Joi.number().integer().min(30).max(300),
    cardTradeMode: Joi.string().valid('fixed', 'progressive', 'none'),
    fogOfWar: Joi.boolean(),
    autoAssignTerritories: Joi.boolean()
  }).default({})
});

// Message/chat validation
const messageSchema = Joi.object({
  content: Joi.string()
    .min(1)
    .max(500)
    .required()
    .custom((value, helpers) => {
      const error = validateAgainstPatterns(value, 'Message');
      if (error) return helpers.error('any.invalid', { message: error });
      return sanitizeInput(value);
    })
    .messages({
      'string.min': 'Message cannot be empty',
      'string.max': 'Message cannot exceed 500 characters'
    }),
  
  roomId: Joi.string().uuid().required(),
  
  type: Joi.string()
    .valid('chat', 'system', 'game')
    .default('chat')
});

// User profile update validation
const profileSchema = Joi.object({
  username: Joi.string()
    .min(3)
    .max(20)
    .pattern(usernamePattern)
    .custom((value, helpers) => {
      const error = validateAgainstPatterns(value, 'Username');
      if (error) return helpers.error('any.invalid', { message: error });
      return sanitizeInput(value);
    }),
  
  bio: Joi.string()
    .max(500)
    .allow('')
    .custom((value, helpers) => {
      if (value) {
        const error = validateAgainstPatterns(value, 'Bio');
        if (error) return helpers.error('any.invalid', { message: error });
        return sanitizeInput(value);
      }
      return value;
    }),
  
  location: Joi.string()
    .max(100)
    .allow('')
    .custom((value, helpers) => {
      if (value) {
        const error = validateAgainstPatterns(value, 'Location');
        if (error) return helpers.error('any.invalid', { message: error });
        return sanitizeInput(value);
      }
      return value;
    }),
  
  website: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .max(200)
    .allow('')
    .messages({
      'string.uri': 'Please provide a valid website URL'
    })
});

// Map upload validation
const mapSchema = Joi.object({
  name: Joi.string()
    .min(3)
    .max(100)
    .required()
    .custom((value, helpers) => {
      const error = validateAgainstPatterns(value, 'Map name');
      if (error) return helpers.error('any.invalid', { message: error });
      return sanitizeInput(value);
    }),
  
  description: Joi.string()
    .max(1000)
    .allow('')
    .custom((value, helpers) => {
      if (value) {
        const error = validateAgainstPatterns(value, 'Description');
        if (error) return helpers.error('any.invalid', { message: error });
        return sanitizeInput(value);
      }
      return value;
    }),
  
  tags: Joi.array()
    .items(
      Joi.string()
        .max(30)
        .pattern(/^[a-zA-Z0-9\-_]+$/)
        .custom((value, helpers) => {
          const error = validateAgainstPatterns(value, 'Tag');
          if (error) return helpers.error('any.invalid', { message: error });
          return sanitizeInput(value);
        })
    )
    .max(10)
    .messages({
      'array.max': 'Cannot have more than 10 tags'
    }),
  
  isPublic: Joi.boolean().default(false),
  
  territories: Joi.array()
    .min(10)
    .max(200)
    .required()
    .messages({
      'array.min': 'Map must have at least 10 territories',
      'array.max': 'Map cannot have more than 200 territories'
    })
});

/**
 * Validation middleware functions
 */

export const validateAuth = (req: Request, res: Response, next: NextFunction) => {
  const isRegister = req.path === '/register';
  const { error, value } = authSchema.validate(req.body, { 
    context: { isRegister },
    abortEarly: false
  });
  
  if (error) {
    return res.status(400).json({ 
      error: 'Validation error',
      message: 'Invalid input data',
      details: error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }))
    });
  }
  
  // Replace body with sanitized values
  req.body = value;
  return next();
};

export const validateGame = (req: Request, res: Response, next: NextFunction) => {
  const { error, value } = gameSchema.validate(req.body, { abortEarly: false });
  
  if (error) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Invalid game configuration',
      details: error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }))
    });
  }
  
  req.body = value;
  return next();
};

export const validateMessage = (req: Request, res: Response, next: NextFunction) => {
  const { error, value } = messageSchema.validate(req.body, { abortEarly: false });
  
  if (error) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Invalid message',
      details: error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }))
    });
  }
  
  req.body = value;
  return next();
};

export const validateProfile = (req: Request, res: Response, next: NextFunction) => {
  const { error, value } = profileSchema.validate(req.body, { abortEarly: false });
  
  if (error) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Invalid profile data',
      details: error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }))
    });
  }
  
  req.body = value;
  return next();
};

export const validateMap = (req: Request, res: Response, next: NextFunction) => {
  const { error, value } = mapSchema.validate(req.body, { abortEarly: false });
  
  if (error) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Invalid map data',
      details: error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }))
    });
  }
  
  req.body = value;
  return next();
};

/**
 * Generic input sanitization middleware for all requests
 */
export const sanitizeAllInputs = (req: Request, res: Response, next: NextFunction): any => {
  // Sanitize query parameters
  if (req.query) {
    for (const key of Object.keys(req.query)) {
      if (typeof req.query[key] === 'string') {
        const value = req.query[key] as string;
        const error = validateAgainstPatterns(value, `Query parameter ${key}`);
        if (error) {
          return res.status(400).json({
            error: 'Security validation failed',
            message: error
          });
        }
      }
    }
  }
  
  // Sanitize URL parameters
  if (req.params) {
    for (const key of Object.keys(req.params)) {
      if (typeof req.params[key] === 'string') {
        const value = req.params[key];
        const error = validateAgainstPatterns(value, `URL parameter ${key}`);
        if (error) {
          return res.status(400).json({
            error: 'Security validation failed',
            message: error
          });
        }
      }
    }
  }
  
  return next();
};

// Export validation schemas for testing
export const schemas = {
  auth: authSchema,
  game: gameSchema,
  message: messageSchema,
  profile: profileSchema,
  map: mapSchema
};