import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Cast to any: vitest 3 ships an older vite peer than the project's vite 8,
// so TypeScript sees two incompatible Plugin types. The plugin works at
// runtime, so we only need to silence the type mismatch here.
const paths = tsconfigPaths() as unknown as never

export default defineConfig({
  plugins: [paths],
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    globals: false,
  },
})
