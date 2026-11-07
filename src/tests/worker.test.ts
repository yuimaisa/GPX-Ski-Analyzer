import { it, expect } from 'vitest';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import type { Analysis } from '../types/analysis';
it('runs the bundled browser worker without TypeScript or unresolved imports', async () => {
  const bundle = await build({
    entryPoints: ['src/lib/analysis/worker.ts'],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    write: false,
  });
  let message: { result?: Analysis; error?: string } = {};
  const self: {
    onmessage?: (event: { data: { xml: string; filename: string } }) => void;
    postMessage: (v: typeof message) => void;
  } = {
    postMessage: (v) => {
      message = v;
    },
  };
  runInNewContext(bundle.outputFiles[0].text, { self, TextEncoder });
  self.onmessage!({
    data: {
      xml: readFileSync('public/samples/hakuba-synthetic.gpx', 'utf8'),
      filename: 'sample.gpx',
    },
  });
  expect(message.result?.runs).toHaveLength(4);
  expect(message.error).toBeUndefined();
  self.onmessage!({ data: { xml: '<gpx/>', filename: 'empty.gpx' } });
  expect(message.error).toContain('2つ以上');
});
