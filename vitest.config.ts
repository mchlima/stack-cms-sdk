import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        // Svelte compiles the `.svelte` of the adapter and of the tests for the server.
        plugins: [svelte({ configFile: false })],
        test: {
          name: 'sdk',
          include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
          exclude: ['src/astro/**/*.astro.spec.ts'],
        },
      },
      // Astro compiles its `.astro` with its own Vite config.
      './vitest.astro.config.ts',
    ],
  },
});
