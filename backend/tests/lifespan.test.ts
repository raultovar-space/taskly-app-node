import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { start } from '../src/core/lifespan.ts';

const mocks = vi.hoisted(() => ({
  createDatabase: vi.fn(),
  initialize: vi.fn(),
  createApp: vi.fn(),
  resolveDatabaseUrl: vi.fn(() => 'postgresql://test:test@localhost:5432/test'),
}));
vi.mock('../src/core/database.ts', () => ({ createDatabase: mocks.createDatabase, initialize: mocks.initialize }));
vi.mock('../src/core/config.ts', () => ({ resolveDatabaseUrl: mocks.resolveDatabaseUrl }));
vi.mock('../src/factory.ts', () => ({ createApp: mocks.createApp }));

type FakeServer = EventEmitter & { address: () => { port: number }; close: ReturnType<typeof vi.fn> };

function setup({ fail }: { fail?: Error } = {}) {
  const database = { $connect: vi.fn().mockResolvedValue(undefined), $disconnect: vi.fn().mockResolvedValue(undefined) };
  let server: FakeServer | undefined;
  const app = {
    listen: vi.fn((port: number, host: string, callback: () => void) => {
      server = Object.assign(new EventEmitter(), { address: () => ({ port }), close: vi.fn() }) as FakeServer;
      const current = server;
      process.nextTick(() => (fail ? current.emit('error', fail) : callback()));
      return server;
    }),
  };
  mocks.createDatabase.mockReturnValue(database);
  mocks.initialize.mockResolvedValue(undefined);
  mocks.createApp.mockReturnValue(app);
  const handlers = new Map<string, () => void>();
  vi.spyOn(process, 'once').mockImplementation(((event: string, handler: () => void) => {
    handlers.set(event, handler);
    return process;
  }) as typeof process.once);
  const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as typeof process.exit);
  return { database, app, handlers, exit, getServer: () => server! };
}

let exitCode: typeof process.exitCode;
beforeEach(() => {
  exitCode = process.exitCode;
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  process.exitCode = exitCode;
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('connects, initializes and listens on the default port', async () => {
  vi.stubEnv('API_PORT', '');
  const { database, app, handlers } = setup();
  const result = await start();
  expect(mocks.createDatabase).toHaveBeenCalledWith('postgresql://test:test@localhost:5432/test');
  expect(database.$connect).toHaveBeenCalledOnce();
  expect(mocks.initialize).toHaveBeenCalledWith(database);
  expect(mocks.createApp).toHaveBeenCalledWith(database);
  expect(app.listen).toHaveBeenCalledWith(8000, '0.0.0.0', expect.any(Function));
  expect(result.database).toBe(database);
  expect(console.log).toHaveBeenCalledWith('Taskly App Node API listening on port 8000');
  expect([...handlers.keys()]).toEqual(['SIGTERM', 'SIGINT']);
});
it('listens on API_PORT when set', async () => {
  vi.stubEnv('API_PORT', '9123');
  const { app } = setup();
  await start();
  expect(app.listen).toHaveBeenCalledWith(9123, '0.0.0.0', expect.any(Function));
});
it('disconnects and rethrows when connecting fails', async () => {
  const { database } = setup();
  const error = new Error('refused');
  database.$connect.mockRejectedValue(error);
  await expect(start()).rejects.toBe(error);
  expect(database.$disconnect).toHaveBeenCalledOnce();
  expect(mocks.createApp).not.toHaveBeenCalled();
});
it('disconnects and rethrows when the server fails to listen', async () => {
  const error = new Error('EADDRINUSE');
  const { database } = setup({ fail: error });
  await expect(start()).rejects.toBe(error);
  expect(database.$disconnect).toHaveBeenCalledOnce();
});
it.each(['SIGTERM', 'SIGINT'])('closes the server and disconnects on %s', async (signal) => {
  const { database, handlers, exit, getServer } = setup();
  await start();
  vi.useFakeTimers();
  handlers.get(signal)!();
  const server = getServer();
  expect(server.close).toHaveBeenCalledOnce();
  await server.close.mock.calls[0][0]();
  expect(database.$disconnect).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(10000);
  expect(exit).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(exitCode);
});
it('logs disconnect failures and sets a failing exit code', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { database, handlers, getServer } = setup();
  await start();
  const error = new Error('disconnect failed');
  database.$disconnect.mockRejectedValue(error);
  vi.useFakeTimers();
  handlers.get('SIGTERM')!();
  await getServer().close.mock.calls[0][0]();
  expect(log).toHaveBeenCalledWith(error);
  expect(process.exitCode).toBe(1);
});
it('forces exit when shutdown takes longer than 10 seconds', async () => {
  const { handlers, exit } = setup();
  await start();
  vi.useFakeTimers();
  handlers.get('SIGTERM')!();
  vi.advanceTimersByTime(9999);
  expect(exit).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(exit).toHaveBeenCalledWith(1);
});
