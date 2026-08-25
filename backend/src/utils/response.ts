import { Response } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  statusCode: number;
  details?: unknown;
  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function ok<T>(res: Response, data: T, message = 'Success') {
  return res.status(200).json({ success: true, message, data });
}

export function created<T>(res: Response, data: T, message = 'Created') {
  return res.status(201).json({ success: true, message, data });
}

export function noContent(res: Response) {
  return res.status(204).send();
}

/** Centralized error handler middleware */
export function errorHandler(err: unknown, _req: unknown, res: Response, _next: unknown) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ success: false, message: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ success: false, message: 'Validation failed', details: err.flatten() });
  }
  // Prisma known errors
  const prismaError = (err as { code?: string; message?: string }) || {};
  if (prismaError.code === 'P2002') {
    return res.status(409).json({ success: false, message: 'A record with this value already exists' });
  }
  if (prismaError.code === 'P2025') {
    return res.status(404).json({ success: false, message: 'Record not found' });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({ success: false, message: 'Internal server error' });
}

export function notFound(_req: unknown, res: Response) {
  return res.status(404).json({ success: false, message: 'Route not found' });
}