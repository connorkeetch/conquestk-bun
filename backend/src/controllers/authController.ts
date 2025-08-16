import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserService } from '../services/userService';
import { logger } from '../utils/logger';

export class AuthController {
  private userService = new UserService();

  register = async (req: Request, res: Response) => {
    try {
      const { username, email, password } = req.body;
      
      const existingUser = await this.userService.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await this.userService.create({
        username,
        email,
        password: hashedPassword
      });

      const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '24h' }
      );

      return res.status(201).json({
        message: 'User created successfully',
        token,
        user: { id: user.id, username: user.username, email: user.email }
      });
    } catch (error) {
      logger.error('Registration error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  login = async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      
      const user = await this.userService.findByEmail(email);
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '24h' }
      );

      return res.json({
        message: 'Login successful',
        token,
        user: { id: user.id, username: user.username, email: user.email }
      });
    } catch (error) {
      logger.error('Login error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  logout = async (req: Request, res: Response) => {
    return res.json({ message: 'Logout successful' });
  };

  getProfile = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const user = await this.userService.findById(userId);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      return res.json({
        user: { id: user.id, username: user.username, email: user.email }
      });
    } catch (error) {
      logger.error('Get profile error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}