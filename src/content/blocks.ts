import type { Element, ElementContent, Root, RootContent } from 'hast';

/**
 * RS-10: the blocks of the CMS without a framework. Each block of the `hast` is an element with
 * `dataBlock`; the blocks of every space are below, any other name is a block of the space.
 */
export const CMS_BLOCKS = [
  'answer',
  'note',
  'steps',
  'questions',
  'takeaways',
  'table',
  'image',
  'video',
  'code',
  'unknown',
] as const;

/** A block that every space has. */
export type CmsBlockName = (typeof CMS_BLOCKS)[number];

/** A value of an attribute: `number` and `boolean` when the definition of the block says so. */
export type BlockValue = string | number | boolean;

/** The attributes of a block, without the `data-`. */
export type BlockAttributes = Record<string, BlockValue | undefined>;

/** The part of a definition of a block (`space.customBlocks`) the SDK reads; `as const` works too. */
export interface BlockDefinition {
  name: string;
  container?: boolean;
  attributes: readonly BlockAttributeDefinition[];
}

export interface BlockAttributeDefinition {
  name: string;
  type: string;
  required?: boolean;
  values?: readonly string[] | null;
}

/** A block of the content, as the CMS made it (RS-10). */
export interface CmsBlock<A extends BlockAttributes = BlockAttributes> {
  /** `answer`, `note`, `steps`, `image`, `video`, `table`, `code` or a block of the space (`cta`). */
  name: string;
  /** The attributes without the `data-`, typed by the definition of the block when there is one. */
  attributes: A;
  /** The `id` of the block, when it has one (the answer, for the table of contents). */
  id?: string;
  /** Whether it is a block of the space (and not one of every space). */
  custom: boolean;
  /** The content of the block. */
  children: ElementContent[];
  /** The element as the CMS made it. */
  node: Element;
}

const BUILT_IN = new Set<string>(CMS_BLOCKS);

/** Whether a block is one of the space, and not one of every space. */
export const isCustomBlock = (name: string): boolean => !BUILT_IN.has(name);

/** The name of the block of an element (its `data-block`), or `null`. */
export function blockName(node: RootContent | Root): string | null {
  if (node.type !== 'element') {
    return null;
  }
  const value = node.properties.dataBlock ?? node.properties['data-block'];
  return typeof value === 'string' ? value : null;
}

const kebab = (value: string) => value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * The `data-*` of an element, by the name of the attribute (`cta-text`). The API writes them in camelCase
 * (`dataCtaText`), and wrote `data-href` before: both work.
 */
export function rawAttributes(element: Element): Record<string, string> {
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

/** A value with the type of its definition: `number` and `boolean` come as text in the `hast`. */
function typed(value: string, type: string | undefined): BlockValue {
  if (type === 'number') {
    const number = Number(value);
    return value.trim() !== '' && Number.isFinite(number) ? number : value;
  }
  if (type === 'boolean') {
    return value === '' || value === 'true' ? true : value === 'false' ? false : value;
  }
  return value;
}

/** The attributes of a block, typed by its definition; without one, all of them are text. */
export function blockAttributes(
  element: Element,
  definition?: BlockDefinition | null,
): BlockAttributes {
  const raw = rawAttributes(element);
  if (!definition) {
    return raw;
  }
  const attributes: BlockAttributes = {};
  for (const [name, value] of Object.entries(raw)) {
    attributes[name] = typed(value, definition.attributes.find((a) => a.name === name)?.type);
  }
  return attributes;
}

/** The block of an element, or `null` when it is not one. */
export function readBlock(
  node: RootContent | Root,
  customBlocks?: readonly BlockDefinition[] | null,
): CmsBlock | null {
  const name = blockName(node);
  if (!name || node.type !== 'element') {
    return null;
  }
  const definition = customBlocks?.find((block) => block.name === name);
  const id = node.properties.id;
  return {
    name,
    attributes: blockAttributes(node, definition),
    ...(typeof id === 'string' ? { id } : {}),
    custom: isCustomBlock(name),
    children: node.children,
    node,
  };
}

/** Every block of the content, in the order of the text (the blocks inside blocks too). */
export function blocksOf(
  hast: unknown,
  customBlocks?: readonly BlockDefinition[] | null,
): CmsBlock[] {
  const found: CmsBlock[] = [];
  const visit = (node: Root | RootContent) => {
    const block = readBlock(node, customBlocks);
    if (block) {
      found.push(block);
    }
    if ('children' in node) {
      node.children.forEach(visit);
    }
  };
  visit(hast as Root);
  return found;
}

/** The names of a map of components, or a list of names. */
export type BlockNames = Iterable<string> | Record<string, unknown>;

const namesOf = (names: BlockNames | undefined): Set<string> =>
  new Set(
    names === undefined
      ? []
      : Symbol.iterator in names
        ? (names as Iterable<string>)
        : Object.keys(names),
  );

/** The blocks of the space that the site has no component for (RS-12). */
export function missingBlocks(
  customBlocks: readonly BlockDefinition[] | null | undefined,
  blocks: BlockNames | undefined,
): string[] {
  const names = namesOf(blocks);
  return (customBlocks ?? []).map((block) => block.name).filter((name) => !names.has(name));
}

/** Written as it is, so that bundlers replace `process.env.NODE_ENV`; outside Node it may not exist. */
declare const process: { env: Record<string, string | undefined> };

/** Whether the SDK warns: in development by default (`NODE_ENV` other than `production`). */
export function warnsByDefault(): boolean {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

const warned = new Set<string>();

/** Warns once per message, so a build of many pages does not repeat it. */
export function warnOnce(message: string): void {
  if (!warned.has(message)) {
    warned.add(message);
    console.warn(`[cms-sdk] ${message}`);
  }
}

/** The warning of a block of the space without a component in the site (RS-12). */
export function warnMissingBlock(name: string): void {
  warnOnce(
    `O bloco "${name}" do space não tem componente no site: o conteúdo dele sai sem ele (e some, se não tiver conteúdo). Passe-o em blocks.`,
  );
}

/** Warns about every block of the space without a component, when there is a definition. */
export function warnMissingBlocks(
  customBlocks: readonly BlockDefinition[] | null | undefined,
  blocks: BlockNames | undefined,
): void {
  missingBlocks(customBlocks, blocks).forEach(warnMissingBlock);
}
