import type { Element, Root, RootContent } from 'hast';
import { type Components, type Options, toJsxRuntime } from 'hast-util-to-jsx-runtime';
import type { ComponentType, JSX, ReactNode } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';

import {
  type BlockAttributes,
  type BlockDefinition,
  type CmsBlock,
  readBlock,
  warnMissingBlock,
  warnMissingBlocks,
  warnsByDefault,
} from '../content/blocks.js';

/** What a block of the CMS gives to the component that takes its place (RS-05). */
export interface BlockProps<A extends BlockAttributes = Record<string, string>> {
  /** `answer`, `note`, `steps`, `image`, `video`, `table`, `code` or a block of the space. */
  name: string;
  /**
   * The attributes of the block, without the `data-`: `{ type: 'warning' }`, `{ href, label }`. Text, or
   * typed by `customBlocks` (`BlockProps<CmsBlockAttributes['cta']>`).
   */
  attributes: A;
  /** The `id` of the block, when it has one (the answer, for the table of contents). */
  id?: string;
  /** The content of the block, already drawn (and with its own replacements). */
  children?: ReactNode;
  /** The element as the CMS made it, for whoever wants all of it. */
  node: Element;
}

/** A component of a block, with its attributes of any type (`never` takes any `BlockProps<A>`). */
export type BlockComponent = ComponentType<BlockProps<never>>;

type Tag = keyof JSX.IntrinsicElements;

/** Components of the site for the elements, by tag; each one gets the props of the element and its `node`. */
export type ElementComponents = {
  [T in Tag]?: ComponentType<JSX.IntrinsicElements[T] & { node?: Element }> | Tag;
};

export interface CmsContentProps {
  /** The `hast` of the post (or of a preview). */
  hast: unknown;
  /** Elements replaced by components of the site: `{ a: Link, img: Image, table: Table }`. */
  components?: ElementComponents;
  /** Blocks replaced by components of the site, by the `data-block`: `{ note: Callout, cta: Cta }`. */
  blocks?: Record<string, BlockComponent>;
  /**
   * `space.customBlocks`: types the attributes (`number`, `boolean`) and warns, in development, about the
   * blocks of the space without a component (RS-12).
   */
  customBlocks?: readonly BlockDefinition[] | null;
  /** Warns about blocks of the space without a component; in development by default. */
  warn?: boolean;
}

/** `toJsxRuntime` with the return of React 19: its types use the global `JSX`, which React 19 dropped. */
const toReact = toJsxRuntime as unknown as (tree: Root, options: Options) => ReactNode;

/** The tag a replaced block takes while it goes through the conversion. */
const SLOT = 'cms-block';

interface Slot {
  block: CmsBlock;
}

interface Context {
  blocks: Record<string, unknown>;
  customBlocks: readonly BlockDefinition[] | null;
  warn: boolean;
}

/**
 * Puts a slot where each replaced block is; a block of the space without a component leaves its content
 * (RS-12); everything else stays as the CMS made it.
 */
function withSlots<T extends Root | Element>(node: T, context: Context): T {
  const children = node.children.flatMap((child: RootContent): RootContent[] => {
    if (child.type !== 'element') {
      return [child];
    }
    const block = readBlock(child, context.customBlocks);
    const inner = withSlots(child, context);
    if (block && Object.hasOwn(context.blocks, block.name)) {
      const slot: Slot = { block };
      const element: Element = {
        type: 'element',
        tagName: SLOT,
        properties: {},
        children: inner.children,
        data: slot as unknown as Element['data'],
      };
      return [element];
    }
    if (block?.custom) {
      if (context.warn) {
        warnMissingBlock(block.name);
      }
      return inner.children;
    }
    return [inner];
  });
  return { ...node, children: children };
}

/**
 * RS-05: draws the `hast` of a post with React. Elements and blocks named in `components` and `blocks`
 * become components of the site; the rest comes out as the HTML of the CMS (CS-03).
 */
export function CmsContent({
  hast,
  components = {},
  blocks = {},
  customBlocks = null,
  warn = warnsByDefault(),
}: CmsContentProps): ReactNode {
  if (warn) {
    warnMissingBlocks(customBlocks, blocks);
  }
  const tree = withSlots(hast as Root, { blocks, customBlocks, warn });
  const BlockSlot = ({ node, children }: { node?: Element; children?: ReactNode }) => {
    const slot = node?.data as unknown as Slot | undefined;
    const Block = slot ? (blocks[slot.block.name] as ComponentType<BlockProps>) : undefined;
    if (!slot || !Block) {
      return children;
    }
    const { name, attributes, id, node: original } = slot.block;
    return jsx(Block, { name, attributes, id, node: original, children });
  };
  return toReact(tree, {
    Fragment,
    jsx,
    jsxs,
    passNode: true,
    components: { ...components, [SLOT]: BlockSlot } as unknown as Partial<Components>,
  });
}
