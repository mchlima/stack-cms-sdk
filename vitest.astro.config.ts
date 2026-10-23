import react from '@astrojs/react';
import { getViteConfig } from 'astro/config';

// The React integration, to test components of another framework inside Astro.
export default getViteConfig(
  {
    test: {
      name: 'astro',
      include: ['src/astro/**/*.astro.spec.ts'],
    },
  },
  { integrations: [react()] },
);
