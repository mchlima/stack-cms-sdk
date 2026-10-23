import { describe, expect, it, vi } from 'vitest';
import { type Component, createSSRApp, defineComponent, h, type PropType } from 'vue';
import { renderToString } from 'vue/server-renderer';

import fixture from '../react/fixtures/post.json' with { type: 'json' };
import custom from '../test/fixtures/custom-blocks.json' with { type: 'json' };
import { CUSTOM_EXPECTED, tree, withoutCustomBlocks } from '../test/html.js';
import { CmsContent } from './index.js';

const draw = (props: Record<string, unknown>) =>
  renderToString(createSSRApp({ render: () => h(CmsContent, props as never) }));

/** The props of a block: undeclared, Vue would put them as attributes of the root. */
const blockProps = {
  name: String,
  id: String,
  node: Object,
};

const Cta = defineComponent({
  props: {
    ...blockProps,
    attributes: { type: Object as PropType<Record<string, string>>, required: true },
  },
  setup(props, { slots }) {
    return () =>
      h('a', { class: 'cta', href: props.attributes.href }, [
        props.attributes.label,
        slots.default?.(),
      ]);
  },
});

const Destaque = defineComponent({
  props: {
    ...blockProps,
    attributes: { type: Object as PropType<{ nivel?: number; aberto?: boolean }> },
  },
  setup(props, { slots }) {
    return () =>
      h(
        'section',
        {
          class: 'destaque',
          'data-types': `${typeof props.attributes?.nivel} ${typeof props.attributes?.aberto}`,
        },
        slots.default?.(),
      );
  },
});

const Link = defineComponent({
  inheritAttrs: false,
  props: { href: String, node: Object },
  setup(props, { slots }) {
    return () => h('a', { href: props.href, 'data-site-link': '' }, slots.default?.());
  },
});

describe('<CmsContent> for Vue (RS-11)', () => {
  it('without replacements, draws the HTML of the CMS, without the blocks of the space', async () => {
    const html = await draw({ hast: fixture.hast, warn: false });
    expect(tree(html)).toEqual(tree(withoutCustomBlocks(fixture.html)));
  });

  it('CS-03: a block of the space becomes the component of the site; the rest stays the same', async () => {
    const html = await draw({ hast: fixture.hast, blocks: { cta: Cta } });
    const expected = fixture.html.replace(
      /<div data-block="cta"[^>]*>(.*?)<\/div>/s,
      '<a class="cta" href="https://stack201.com.br/contato">Fale com a gente$1</a>',
    );
    expect(tree(html)).toEqual(tree(expected));
  });

  it('blocks of the CMS and elements are replaced, with their attributes and id', async () => {
    const seen: unknown[] = [];
    const Note: Component = (props: { attributes: unknown }, { slots }) => {
      seen.push(props.attributes);
      return h('div', { role: 'note' }, slots.default?.());
    };
    Note.props = ['name', 'attributes', 'id', 'node'];
    const Answer: Component = (props: { id?: string }, { slots }) =>
      h('div', { id: props.id }, slots.default?.());
    Answer.props = ['name', 'attributes', 'id', 'node'];
    const html = await draw({
      hast: fixture.hast,
      blocks: { note: Note, answer: Answer },
      components: { a: Link },
      warn: false,
    });
    expect(seen).toEqual([{ type: 'warning' }]);
    expect(html).toContain('<div role="note"><p>Imagens sem tamanho pioram o CLS.</p></div>');
    expect(html).toContain('<div id="resposta"><p>O LCP bom');
    expect(html).toContain('<a href="https://web.dev/lcp" data-site-link>guia do Google</a>');
  });

  it('blocks of the space in the new form, nested, with attributes typed by customBlocks', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const html = await draw({
      hast: custom.hast,
      customBlocks: custom.customBlocks,
      blocks: { cta: Cta, destaque: Destaque },
      components: { a: Link },
      warn: true,
    });
    expect(tree(html)).toEqual(tree(CUSTOM_EXPECTED));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"banner"'));
    warn.mockRestore();
  });
});
