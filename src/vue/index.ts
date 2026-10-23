import {
  type Component,
  createStaticVNode,
  defineComponent,
  h,
  type PropType,
  type VNodeChild,
} from 'vue';

import type { BlockAttributes, BlockDefinition, CmsBlock } from '../content/blocks.js';
import { type ContentNode, contentNodes } from '../content/model.js';

/**
 * RS-11: `<CmsContent>` for Vue 3 (and Nuxt), with a render function: no template compiler, no state.
 * The component of a block gets `name`, `attributes`, `id` and `node` as props, and the content in the
 * default slot; the component of an element gets the HTML attributes and `node`.
 */
export interface BlockProps<A extends BlockAttributes = Record<string, string>> {
  name: string;
  attributes: A;
  id?: string;
  node: CmsBlock['node'];
}

function draw(
  nodes: ContentNode[],
  blocks: Record<string, Component>,
  components: Record<string, Component | string>,
): VNodeChild[] {
  return nodes.map((node): VNodeChild => {
    switch (node.type) {
      case 'text':
        return node.value;
      case 'html':
        return createStaticVNode(node.html, 1);
      case 'block': {
        const { name, attributes, id, node: element } = node.block;
        const children = draw(node.children, blocks, components);
        const block = blocks[name];
        if (!block) {
          return children;
        }
        return h(
          block,
          { name, attributes, id, node: element },
          children.length ? { default: () => children } : undefined,
        );
      }
      case 'element': {
        const children = draw(node.children, blocks, components);
        const component = node.component ? components[node.tagName] : undefined;
        if (component === undefined) {
          return h(node.tagName, node.attributes, children);
        }
        if (typeof component === 'string') {
          return h(component, node.attributes, children);
        }
        return h(
          component,
          { ...node.attributes, node: node.node },
          children.length ? { default: () => children } : undefined,
        );
      }
    }
  });
}

/**
 * Draws the `hast` of a post, replacing blocks and elements by components of the site (RS-11):
 *
 *   h(CmsContent, { hast: post.hast, blocks: { cta: Cta }, components: { a: NuxtLink } })
 *   <CmsContent :hast="post.hast" :blocks="{ cta: Cta }" :components="{ a: NuxtLink }" />
 */
export const CmsContent = defineComponent({
  name: 'CmsContent',
  props: {
    /** The `hast` of the post (or of a preview). */
    hast: { type: [Object, Array] as PropType<unknown>, required: true },
    /** Blocks replaced by components of the site, by the `data-block`: `{ note: Callout, cta: Cta }`. */
    blocks: { type: Object as PropType<Record<string, Component>>, default: () => ({}) },
    /** Elements replaced by components of the site, by tag: `{ a: NuxtLink, img: NuxtImg }`. */
    components: {
      type: Object as PropType<Record<string, Component | string>>,
      default: () => ({}),
    },
    /** `space.customBlocks`: types the attributes and warns about blocks without a component. */
    customBlocks: { type: Array as PropType<readonly BlockDefinition[] | null>, default: null },
    /** Warns about blocks of the space without a component; in development by default. */
    warn: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  },
  setup(props) {
    return () =>
      draw(
        contentNodes(props.hast, {
          blocks: props.blocks,
          components: props.components,
          customBlocks: props.customBlocks,
          ...(props.warn === undefined ? {} : { warn: props.warn }),
        }),
        props.blocks,
        props.components,
      );
  },
});

export {
  type AttributesOf,
  type BlockAttributesMap,
  type BlockDefinition,
  type CmsBlock,
  missingBlocks,
} from '../content/index.js';
