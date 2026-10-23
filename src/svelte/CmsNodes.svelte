<script>
  /** The nodes of the content; written without spaces between tags, which would go to the page. */
  import CmsNodes from './CmsNodes.svelte';

  /** @type {{ nodes: import('../content/model.js').ContentNode[], blocks: Record<string, any>, components: Record<string, any> }} */
  let { nodes, blocks, components } = $props();
</script>

{#each nodes as node}{#if node.type === 'text'}{node.value}{:else if node.type === 'html'}{@html node.html}{:else if node.type === 'block'}{@const Block = blocks[node.block.name]}{#if node.children.length}<Block
        name={node.block.name}
        attributes={node.block.attributes}
        id={node.block.id}
        node={node.block.node}><CmsNodes nodes={node.children} {blocks} {components} /></Block
      >{:else}<Block
        name={node.block.name}
        attributes={node.block.attributes}
        id={node.block.id}
        node={node.block.node}
      />{/if}{:else}{@const Component = node.component ? components[node.tagName] : undefined}{#if Component && typeof Component !== 'string'}{#if node.children.length}<Component
          {...node.attributes}
          node={node.node}><CmsNodes nodes={node.children} {blocks} {components} /></Component
        >{:else}<Component {...node.attributes} node={node.node} />{/if}{:else if node.children.length}<svelte:element
        this={Component ?? node.tagName}
        {...node.attributes}><CmsNodes nodes={node.children} {blocks} {components} /></svelte:element
      >{:else}<svelte:element this={Component ?? node.tagName} {...node.attributes} />{/if}{/if}{/each}
