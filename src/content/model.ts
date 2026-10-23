import type { Element, Root, RootContent, Text } from 'hast';
import { toHtml } from 'hast-util-to-html';
import { find, html as htmlSchema } from 'property-information';

import {
  type BlockDefinition,
  type BlockNames,
  blockName,
  type CmsBlock,
  isCustomBlock,
  readBlock,
  warnMissingBlock,
  warnMissingBlocks,
  warnsByDefault,
} from './blocks.js';

/**
 * RS-10: the content cut where the site puts its components, for the adapters of each framework. What has
 * no component inside comes as the HTML of the CMS, ready.
 */
export type ContentNode =
  | { type: 'text'; value: string }
  /** An element (or a comment) with nothing replaced inside, as the HTML of the CMS. */
  | { type: 'html'; html: string; node: Element | null }
  /** An element with something replaced inside, or replaced itself (`component`) by one of the site. */
  | {
      type: 'element';
      tagName: string;
      attributes: Record<string, string>;
      component: boolean;
      children: ContentNode[];
      node: Element;
    }
  /** A block that the site has a component for. */
  | { type: 'block'; block: CmsBlock; children: ContentNode[] };

export interface ContentOptions {
  /** The names of the blocks that have a component in the site (a map of components works). */
  blocks?: BlockNames;
  /** The names of the elements that have a component in the site, by tag. */
  components?: BlockNames;
  /** `space.customBlocks`: types the attributes and says which blocks of the space have no component. */
  customBlocks?: readonly BlockDefinition[] | null;
  /** Warns about blocks of the space without a component; in development by default. */
  warn?: boolean;
}

const names = (value: BlockNames | undefined): Set<string> =>
  new Set(
    value === undefined
      ? []
      : Symbol.iterator in value
        ? (value as Iterable<string>)
        : Object.keys(value),
  );

/** The attributes of an element as HTML writes them (`class`, `data-type`), for the frameworks. */
export function htmlAttributes(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(element.properties)) {
    if (value === null || value === undefined || value === false || Number.isNaN(value)) {
      continue;
    }
    const info = find(htmlSchema, key);
    attributes[info.attribute] =
      value === true
        ? ''
        : Array.isArray(value)
          ? value.join(info.commaSeparated ? ', ' : ' ')
          : String(value);
  }
  return attributes;
}

/** Cuts the `hast` where the site puts its components (RS-10, RS-11, RS-12). */
export function contentNodes(hast: unknown, options: ContentOptions = {}): ContentNode[] {
  const blocks = names(options.blocks);
  const components = names(options.components);
  const customBlocks = options.customBlocks ?? null;
  const warn = options.warn ?? warnsByDefault();
  if (warn) {
    warnMissingBlocks(customBlocks, blocks);
  }

  const touched = new WeakMap<Element, boolean>();
  /** Whether something in the element (or the element itself) is not the HTML of the CMS. */
  const isTouched = (element: Element): boolean => {
    let value = touched.get(element);
    if (value === undefined) {
      const block = blockName(element);
      value =
        components.has(element.tagName) ||
        (block !== null && (blocks.has(block) || isCustomBlock(block))) ||
        element.children.some((child) => child.type === 'element' && isTouched(child));
      touched.set(element, value);
    }
    return value;
  };

  const convert = (children: RootContent[]): ContentNode[] =>
    children.flatMap((child): ContentNode[] => {
      if (child.type === 'text') {
        return [{ type: 'text', value: child.value }];
      }
      if (child.type === 'comment' || (child.type as string) === 'raw') {
        return [{ type: 'html', html: toHtml(child, { allowDangerousHtml: true }), node: null }];
      }
      if (child.type !== 'element') {
        return [];
      }
      if (!isTouched(child)) {
        return [{ type: 'html', html: toHtml(child, { allowDangerousHtml: true }), node: child }];
      }
      const block = readBlock(child, customBlocks);
      if (block && blocks.has(block.name)) {
        return [{ type: 'block', block, children: convert(child.children) }];
      }
      if (block?.custom) {
        // RS-12: a block of the space without a component never breaks the page.
        if (warn) {
          warnMissingBlock(block.name);
        }
        return convert(child.children);
      }
      return [
        {
          type: 'element',
          tagName: child.tagName,
          attributes: htmlAttributes(child),
          component: components.has(child.tagName),
          children: convert(child.children),
          node: child,
        },
      ];
    });

  const root = hast as Root | Element;
  return convert(root.type === 'root' ? root.children : [root]);
}

/** A block, for `renderHtml`: the block and the HTML of its content, already drawn. */
export type HtmlBlock = (block: CmsBlock, children: string) => string;

/** An element, for `renderHtml`: its tag, attributes and node, and the HTML of its content. */
export type HtmlElement = (
  element: { tagName: string; attributes: Record<string, string>; node: Element },
  children: string,
) => string;

export interface RenderHtmlOptions extends Omit<ContentOptions, 'blocks' | 'components'> {
  /** Blocks replaced by HTML of the site, by the `data-block`: `{ cta: (block) => '<a …>' }`. */
  blocks?: Record<string, HtmlBlock>;
  /** Elements replaced by HTML of the site, by tag. */
  components?: Record<string, HtmlElement>;
}

/**
 * RS-13: the content as HTML, for a site without React, Vue, Astro or Svelte. Each block named in
 * `blocks` becomes what its function returns (HTML, not escaped: escape what comes from outside); the rest
 * is the HTML of the CMS.
 */
export function renderHtml(hast: unknown, options: RenderHtmlOptions = {}): string {
  const blocks = options.blocks ?? {};
  const components = options.components ?? {};
  const draw = (nodes: ContentNode[]): string =>
    nodes
      .map((node) => {
        switch (node.type) {
          case 'text':
            return toHtml({ type: 'text', value: node.value });
          case 'html':
            return node.html;
          case 'block': {
            const block = blocks[node.block.name];
            return block ? block(node.block, draw(node.children)) : draw(node.children);
          }
          case 'element': {
            const inner = draw(node.children);
            const component = node.component ? components[node.tagName] : undefined;
            if (component) {
              return component(
                { tagName: node.tagName, attributes: node.attributes, node: node.node },
                inner,
              );
            }
            return toHtml(
              // `raw` is the HTML already drawn; hast-util-to-html writes it as it is.
              {
                ...node.node,
                children: inner ? [{ type: 'raw', value: inner } as unknown as Text] : [],
              },
              { allowDangerousHtml: true },
            );
          }
        }
      })
      .join('');
  return draw(contentNodes(hast, { ...options, blocks, components }));
}
