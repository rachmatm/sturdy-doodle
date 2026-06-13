import { defineConfig } from 'vitest/config';

// Unit tests run in a Node environment (the code under test is server-only).
// Only files under src/ matching *.test.ts are picked up, so the Next build is
// never involved.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
