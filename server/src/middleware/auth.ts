import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface AuthedRequest extends Request { userId: number }
export const signToken = (userId: number) => jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '7d' });
export function verifyToken(token: string): number | null {
  try { const p: any = jwt.verify(token, config.jwtSecret); return Number(p.sub); } catch { return null; }
}
/** Bearer header; `?token=` is accepted only for the SSE stream (EventSource cannot set headers). */
export function requireAuth(allowQuery = false) {
  return (req: Request, res: Response, next: NextFunction) => {
    const h = req.headers.authorization;
    const token = h?.startsWith('Bearer ') ? h.slice(7) : allowQuery ? (req.query.token as string) : undefined;
    const id = token ? verifyToken(token) : null;
    if (!id) return res.status(401).json({ error: 'Unauthorized' });
    (req as AuthedRequest).userId = id;
    next();
  };
}
