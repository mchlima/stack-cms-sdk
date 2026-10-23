/** The components of `.astro` files, which Astro compiles (RS-11). */
declare module '*.astro' {
  const component: (...args: never[]) => unknown;
  export default component;
}
