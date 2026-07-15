import { defineConfig } from 'vitest/config'

// Standalone config so vitest doesn't load the Cloudflare/React vite plugins.
// Game logic is pure and runs in plain node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
