import type { RequestHandler, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { DomainError } from '../domain/errors';

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
  });
  next();
};

export function localAccess(origins: string[], token: string): RequestHandler {
  const allowedOrigins = new Set(origins);
  const allowedHosts = new Set(origins.map(origin => new URL(origin).host));
  return (req, _res, next) => {
    if (!allowedHosts.has(req.get('host') || '') || req.get('sec-fetch-site') === 'cross-site') return next(new DomainError('error.forbidden', 403));
    const origin = req.get('origin');
    if (origin && !allowedOrigins.has(origin)) return next(new DomainError('error.forbidden', 403));
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (!origin || !allowedOrigins.has(origin) || req.get('x-wiki-token') !== token)) return next(new DomainError('error.forbidden', 403));
    next();
  };
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof DomainError) return res.status(error.status).json({ error: { code: error.code, params: error.params, ...error.details } });
  if (error instanceof ZodError || error instanceof SyntaxError) return res.status(400).json({ error: { code: 'error.invalidRequest' } });
  if (error instanceof Error && 'status' in error && error.status === 413) return res.status(413).json({ error: { code: 'error.tooLarge' } });
  console.error(error);
  res.status(500).json({ error: { code: 'error.internal' } });
};
