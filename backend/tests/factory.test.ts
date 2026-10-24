import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createApp } from '../src/factory.ts';
import type { Database } from '../src/features/todos/types.ts';
import { record, todo } from './fixture.ts';

afterEach(() => vi.restoreAllMocks());

function setup() {
  const database = { todo: { findFirst: vi.fn().mockResolvedValue({ id: 1 }), findMany: vi.fn().mockResolvedValue([record]) } };
  return { app: createApp(database as unknown as Database), database };
}
it('mounts the todos router backed by the database', async () => {
  const { app, database } = setup();
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(200);
  expect(response.body).toEqual([todo]);
  expect(database.todo.findMany).toHaveBeenCalledOnce();
});
it('mounts the health router', async () => {
  const { app } = setup();
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
});
it('does not send the x-powered-by header', async () => {
  const { app } = setup();
  const response = await request(app).get('/api/health');
  expect(response.headers['x-powered-by']).toBeUndefined();
});
it('serves the OpenAPI specification', async () => {
  const { app } = setup();
  const response = await request(app).get('/openapi.json');
  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('openapi');
  expect(response.body).toHaveProperty('paths');
});
it('serves the Swagger UI under /docs', async () => {
  const { app } = setup();
  const response = await request(app).get('/docs/');
  expect(response.status).toBe(200);
  expect(response.text).toContain('swagger');
});
it('returns a JSON 404 for unknown routes', async () => {
  const { app } = setup();
  const response = await request(app).get('/nope');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Not Found' });
});
it('returns 422 for malformed JSON', async () => {
  const { app } = setup();
  const response = await request(app).post('/api/todos').set('Content-Type', 'application/json').send('{"title":');
  expect(response.status).toBe(422);
  expect(response.body).toEqual({ detail: 'Invalid JSON.' });
});
it('returns 413 for oversized bodies', async () => {
  const { app } = setup();
  const response = await request(app).post('/api/todos').send({ title: 'x', description: 'y'.repeat(200 * 1024) });
  expect(response.status).toBe(413);
  expect(response.body).toEqual({ detail: 'Request body too large.' });
});
it.each([new Error('boom'), 'boom', Object.assign(new Error('other'), { type: 'other' })])('returns 500 and logs unexpected errors: %s', async (error) => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { app, database } = setup();
  database.todo.findMany.mockRejectedValue(error);
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
  expect(log).toHaveBeenCalledWith(error);
});
