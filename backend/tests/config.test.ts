import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

const parts = { POSTGRES_USER: 'taskly', POSTGRES_PASSWORD: 'secret', POSTGRES_HOST: 'db', DB_PORT: '5432', POSTGRES_DB: 'taskly' };

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', '');
  for (const [name, value] of Object.entries(parts)) vi.stubEnv(name, value);
});
afterEach(() => vi.unstubAllEnvs());

it('prefers an explicit override', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://env/db');
  expect(resolveDatabaseUrl('postgresql://override/db')).toBe('postgresql://override/db');
});
it('uses DATABASE_URL when no override is given', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://env/db');
  expect(resolveDatabaseUrl()).toBe('postgresql://env/db');
});
it('falls back to DATABASE_URL when the override is empty', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://env/db');
  expect(resolveDatabaseUrl('')).toBe('postgresql://env/db');
});
it('rewrites the SQLAlchemy psycopg scheme', () => {
  expect(resolveDatabaseUrl('postgresql+psycopg://u:p@h:1/d')).toBe('postgresql://u:p@h:1/d');
});
it('builds the URL from individual variables', () => {
  expect(resolveDatabaseUrl()).toBe('postgresql://taskly:secret@db:5432/taskly');
});
it('encodes credentials and database name', () => {
  vi.stubEnv('POSTGRES_USER', 'us@er');
  vi.stubEnv('POSTGRES_PASSWORD', 'p@ss:w/rd');
  vi.stubEnv('POSTGRES_DB', 'my db');
  const url = new URL(resolveDatabaseUrl());
  expect(decodeURIComponent(url.username)).toBe('us@er');
  expect(decodeURIComponent(url.password)).toBe('p@ss:w/rd');
  expect(url.hostname).toBe('db');
  expect(url.port).toBe('5432');
  expect(decodeURIComponent(url.pathname)).toBe('/my db');
});
it.each(Object.keys(parts))('throws when %s is missing', (name) => {
  vi.stubEnv(name, '');
  expect(() => resolveDatabaseUrl()).toThrow(`Missing environment variable: ${name}`);
});
