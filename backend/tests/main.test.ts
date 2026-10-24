import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock('../src/core/lifespan.ts', () => ({ start: mocks.start }));

let exitCode: typeof process.exitCode;
beforeEach(() => {
  exitCode = process.exitCode;
  vi.resetModules();
});
afterEach(() => {
  process.exitCode = exitCode;
  mocks.start.mockReset();
  vi.restoreAllMocks();
});

it('starts the application', async () => {
  mocks.start.mockResolvedValue({});
  await import('../src/main.ts');
  await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  expect(process.exitCode).toBe(exitCode);
});
it('logs startup failures and sets a failing exit code', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = new Error('no database');
  mocks.start.mockRejectedValue(error);
  await import('../src/main.ts');
  await vi.waitFor(() => expect(log).toHaveBeenCalledWith('Cannot start Taskly App Node API:', error));
  expect(process.exitCode).toBe(1);
});
