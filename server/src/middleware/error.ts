import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
export const wrap = (fn: (req: any, res: Response) => Promise<any> | any) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) return res.status(400).json({ error: 'Invalid input', details: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
  if (err?.message === 'Not allowed by CORS') return res.status(403).json({ error: 'CORS_ORIGIN_NOT_ALLOWED', message: 'This browser address is not allowed by the backend. Add it to CORS_ORIGINS and restart HYRD.' });
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error('[http:error]', JSON.stringify({ method: _req.method, path: _req.path, status, error: err?.message || 'unknown' }));
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message, ...(status >= 500 ? { message: 'The backend could not complete this request. Check the backend terminal for the request path and error.' } : {}) });
}
