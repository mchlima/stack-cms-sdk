<script>
  /**
   * RS-11: draws the `hast` of a post with Svelte 5 (and SvelteKit), replacing blocks and elements by
   * components of the site. No state: it draws again when the props change.
   */
  import { contentNodes } from '../content/model.js';
  import CmsNodes from './CmsNodes.svelte';

  /** @type {import('./index.js').CmsContentProps} */
  let { hast, blocks = {}, components = {}, customBlocks = null, warn = undefined } = $props();

  const nodes = $derived(
    contentNodes(hast, {
      blocks,
      components,
      customBlocks,
      ...(warn === undefined ? {} : { warn }),
    }),
  );
</script>

<CmsNodes {nodes} {blocks} {components} />
