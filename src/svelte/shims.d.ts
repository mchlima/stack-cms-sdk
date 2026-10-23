/** The components of `.svelte` files, which the bundler of the site compiles (RS-11). */
declare module '*.svelte' {
  const component: unknown;
  export default component;
}
