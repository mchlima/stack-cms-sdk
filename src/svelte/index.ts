import type { Component, Snippet } from 'svelte';

import type { BlockAttributes, BlockDefinition, CmsBlock } from '../content/blocks.js';
import Content from './CmsContent.svelte';

/**
 * RS-11: `<CmsContent>` for Svelte 5 (and SvelteKit). The file `.svelte` goes in the package as it is and
 * the bundler of the site compiles it, like any library of Svelte.
 */

/** What a block gives to the component that takes its place; the content comes in `children`. */
export interface BlockProps<A extends BlockAttributes = Record<string, string>> {
  name: string;
  attributes: A;
  id?: string;
  node: CmsBlock['node'];
  children?: Snippet;
}

export interface CmsContentProps {
  /** The `hast` of the post (or of a preview). */
  hast: unknown;
  /** Blocks replaced by components of the site, by the `data-block`: `{ note: Callout, cta: Cta }`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each block has its own attributes
  blocks?: Record<string, Component<any>>;
  /** Elements replaced by components of the site (or by another tag), by tag: `{ a: Link }`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each element has its own props
  components?: Record<string, Component<any> | string>;
  /** `space.customBlocks`: types the attributes and warns about blocks without a component. */
  customBlocks?: readonly BlockDefinition[] | null;
  /** Warns about blocks of the space without a component; in development by default. */
  warn?: boolean;
}

export const CmsContent = Content as Component<CmsContentProps>;

export {
  type AttributesOf,
  type BlockAttributesMap,
  type BlockDefinition,
  type CmsBlock,
  missingBlocks,
} from '../content/index.js';
