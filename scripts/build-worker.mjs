import { build } from 'esbuild';
import { workerOptions } from './worker-config.mjs';
await build(workerOptions);
