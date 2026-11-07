export const workerOptions = {
  entryPoints: ['src/lib/analysis/worker.ts'],
  outfile: 'public/analysis-worker.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  minify: true,
  legalComments: 'eof',
};
