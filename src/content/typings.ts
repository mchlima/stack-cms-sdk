import type { BlockAttributeDefinition, BlockDefinition } from './blocks.js';

/**
 * RS-14: the attributes of a block with the type of its definition. With the definitions `as const` (or
 * the file of `blockTypes`), each component of a block gets its attributes typed.
 */
export type AttributeValue<A extends BlockAttributeDefinition> = A extends { type: 'number' }
  ? number
  : A extends { type: 'boolean' }
    ? boolean
    : A extends { type: 'enum'; values: readonly (infer V extends string)[] }
      ? V
      : string;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** `{ href: string; label: string; variant?: 'primary' | 'secondary' }`, from a definition `as const`. */
export type AttributesOf<D extends BlockDefinition> = Simplify<
  {
    [
      A in D['attributes'][number] as A extends { required: true } ? A['name'] : never
    ]: AttributeValue<A>;
  } & {
    [
      A in D['attributes'][number] as A extends { required: true } ? never : A['name']
    ]?: AttributeValue<A>;
  }
>;

/** The attributes of each block of the space, by name, from `customBlocks` `as const`. */
export type BlockAttributesMap<Defs extends readonly BlockDefinition[]> = {
  [D in Defs[number] as D['name']]: AttributesOf<D>;
};

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const key = (name: string) => (IDENTIFIER.test(name) ? name : `'${name.replace(/'/g, "\\'")}'`);
const comment = (text: string | null | undefined, indent: string) =>
  text ? `${indent}/** ${text.replace(/\*\//g, '*\\/').replace(/\s*\n\s*/g, ' ')} */\n` : '';

function typeOf(attribute: BlockAttributeDefinition): string {
  switch (attribute.type) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'enum':
      return attribute.values?.length
        ? attribute.values.map((value) => `'${value.replace(/'/g, "\\'")}'`).join(' | ')
        : 'string';
    default:
      return 'string';
  }
}

interface Described {
  description?: string | null;
}

export interface BlockTypesOptions {
  /** The name of the interface; `CmsBlockAttributes` by default. */
  name?: string;
}

/**
 * RS-14: the text of a `.ts` (or `.d.ts`) with the attributes of each block of the space, from
 * `space.customBlocks`. `npx cms-sdk blocks-types` writes it from the Delivery API.
 */
export function blockTypes(
  customBlocks: readonly (BlockDefinition & Described)[],
  options: BlockTypesOptions = {},
): string {
  const name = options.name ?? 'CmsBlockAttributes';
  const blocks = customBlocks
    .map((block) => {
      const attributes = block.attributes
        .map(
          (attribute) =>
            comment((attribute as Described).description, '    ') +
            `    ${key(attribute.name)}${attribute.required ? '' : '?'}: ${typeOf(attribute)};\n`,
        )
        .join('');
      return (
        comment(block.description, '  ') +
        `  ${key(block.name)}: ${attributes ? `{\n${attributes}  }` : 'Record<string, never>'};\n`
      );
    })
    .join('');
  return (
    '// Gerado por @stack201/cms-sdk (blockTypes) a partir de space.customBlocks. Não edite à mão.\n\n' +
    `/** Os atributos de cada bloco do space, pelo nome. */\nexport interface ${name} {\n${blocks}}\n\n` +
    `export type CmsCustomBlockName = keyof ${name};\n`
  );
}
