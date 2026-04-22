import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

const defineInjections = {
  __PKG_VERSION__: JSON.stringify(pkg.version),
}

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'node20',
    define: defineInjections,
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    target: 'node20',
    define: defineInjections,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
])
