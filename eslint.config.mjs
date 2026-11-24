import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.agents/**',
    '.codex/**',
    '.next/**',
    '.worktrees/**',
    '.wrangler/**',
    'out/**',
    'coverage/**',
    'next-env.d.ts',
    'public/analysis-worker.js',
  ]),
]);
