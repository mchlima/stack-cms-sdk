<script>
  let { attributes, children } = $props();
</script>

<div role="note" data-seen={attributes.type}>{@render children?.()}</div>
