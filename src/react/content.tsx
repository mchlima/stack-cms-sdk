import type { Element, Root, RootContent } from 'hast';
import { type Components, type Options, toJsxRuntime } from 'hast-util-to-jsx-runtime';
import type { ComponentType, JSX, ReactNode } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';

/** What a block of the CMS gives to the component that takes its place (RS-05). */
export interface BlockProps {
  /** `answer`, `note`, `steps`, `image`, `video`, `table`, `code` or a block of the space. */
  name: string;
  /** The attributes of the block, without the `data-`: `{ type: 'warning' }`, `{ href, label }`. */
  attributes: Record<string, string>;
  /** The `id` of the block, when it has one (the answer, for the table of contents). */
  id?: string;
  /** The content of the block, already drawn (and with its own replacements). */
  children?: ReactNode;
  /** The element as the CMS made it, for whoever wants all of it. */
  node: Element;
}

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
  blocks?: Record<string, ComponentType<BlockProps>>;
}

/** `toJsxRuntime` with the return of React 19: its types use the global `JSX`, which React 19 dropped. */
const toReact = toJsxRuntime as unknown as (tree: Root, options: Options) => ReactNode;

/** The tag a replaced block takes while it goes through the conversion. */
const SLOT = 'cms-block';

interface Slot {
  block: string;
  original: Element;
}

const kebab = (value: string) => value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** The `data-*` of an element, by name: the API writes some as `dataType` and some as `data-href`. */
function attributesOf(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(element.properties)) {
    const name = key.startsWith('data-')
      ? key.slice(5)
      : /^data[A-Z]/.test(key)
        ? kebab(key.slice(4)).slice(1)
        : null;
    if (name && name !== 'block' && value !== null && value !== undefined) {
      attributes[name] = Array.isArray(value) ? value.join(' ') : String(value);
    }
  }
  return attributes;
}

const blockOf = (element: Element): string | null => {
  const value = element.properties.dataBlock ?? element.properties['data-block'];
  return typeof value === 'string' ? value : null;
};

/** Puts a slot where each replaced block is; everything else stays as the CMS made it. */
function withSlots<T extends Root | Element>(node: T, blocks: Record<string, unknown>): T {
  const children = node.children.map((child: RootContent): RootContent => {
    if (child.type !== 'element') {
      return child;
    }
    const block = blockOf(child);
    const inner = withSlots(child, blocks);
    if (block && block in blocks) {
      const slot: Slot = { block, original: child };
      const element: Element = {
        type: 'element',
        tagName: SLOT,
        properties: {},
        children: inner.children,
        data: slot as unknown as Element['data'],
      };
      return element;
    }
    return inner;
  });
  return { ...node, children: children };
}

/**
 * RS-05: draws the `hast` of a post with React. Elements and blocks named in `components` and `blocks`
 * become components of the site; the rest comes out as the HTML of the CMS (CS-03).
 */
export function CmsContent({ hast, components = {}, blocks = {} }: CmsContentProps): ReactNode {
  const tree = withSlots(hast as Root, blocks);
  const BlockSlot = ({ node, children }: { node?: Element; children?: ReactNode }) => {
    const slot = node?.data as unknown as Slot | undefined;
    const Block = slot ? blocks[slot.block] : undefined;
    if (!slot || !Block) {
      return children;
    }
    const id = slot.original.properties.id;
    return jsx(Block, {
      name: slot.block,
      attributes: attributesOf(slot.original),
      id: typeof id === 'string' ? id : undefined,
      node: slot.original,
      children,
    });
  };
  return toReact(tree, {
    Fragment,
    jsx,
    jsxs,
    passNode: true,
    components: { ...components, [SLOT]: BlockSlot } as unknown as Partial<Components>,
  });
}
