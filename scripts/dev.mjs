// Map the managed preview's Vite-style host/port flags to Next.js.
import { spawn } from 'node:child_process';
import { context } from 'esbuild';
import { workerOptions } from './worker-config.mjs';
const worker = await context(workerOptions);
await worker.watch();
const args = process.argv.slice(2);
const value = (key, fallback) => {
  const i = args.indexOf(key);
  return i >= 0 ? args[i + 1] : fallback;
};
const child = spawn(
  process.execPath,
  [
    'node_modules/next/dist/bin/next',
    'dev',
    '--hostname',
    value('--host', '0.0.0.0'),
    '--port',
    value('--port', '3000'),
  ],
  { stdio: 'inherit' },
);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', async (code) => {
  await worker.dispose();
  process.exit(code ?? 1);
});
