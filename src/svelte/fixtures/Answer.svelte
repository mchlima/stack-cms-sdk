<script>
  let { id, children } = $props();
</script>

<div {id}>{@render children?.()}</div>
