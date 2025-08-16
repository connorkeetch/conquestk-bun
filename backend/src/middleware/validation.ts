import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

const authSchema = Joi.object({
  username: Joi.string().min(3).max(30).when('$isRegister', { is: true, then: Joi.required() }),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

export const validateAuth = (req: Request, res: Response, next: NextFunction) => {
  const isRegister = req.path === '/register';
  const { error } = authSchema.validate(req.body, { context: { isRegister } });
  
  if (error) {
    return res.status(400).json({ 
      message: 'Validation error', 
      details: error.details.map(detail => detail.message)
    });
  }
  
  return next();
};