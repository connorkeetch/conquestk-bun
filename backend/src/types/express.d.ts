// Type definitions for extending Express Request interface

declare namespace Express {
  interface Request {
    userId?: string;
  }
}