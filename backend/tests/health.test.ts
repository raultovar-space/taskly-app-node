import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createHealthRouter } from '../src/api/health.ts';
import type { Database } from '../src/features/todos/types.ts';

afterEach(() => vi.restoreAllMocks());

function setup(findFirst = vi.fn().mockResolvedValue({ id: 1 })) {
  const app = express();
  app.use('/api', createHealthRouter({ todo: { findFirst } } as unknown as Database));
  const handleError: ErrorRequestHandler = (error, req, res, next) => res.status(503).json({ detail: String(error) });
  app.use(handleError);
  return { app, findFirst };
}
it('reports ok after probing the database', async () => {
  const { app, findFirst } = setup();
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(findFirst).toHaveBeenCalledWith({ select: { id: true } });
});
it('reports ok when the table is empty', async () => {
  const { app } = setup(vi.fn().mockResolvedValue(null));
  expect((await request(app).get('/api/health')).body).toEqual({ status: 'ok' });
});
it('forwards database failures to the error handler', async () => {
  const { app } = setup(vi.fn().mockRejectedValue(new Error('db down')));
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(503);
  expect(response.body).toEqual({ detail: 'Error: db down' });
});
