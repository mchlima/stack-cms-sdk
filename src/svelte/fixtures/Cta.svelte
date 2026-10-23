<script>
  let { attributes, children } = $props();
</script>

<a class="cta" href={attributes.href}>{attributes.label}{@render children?.()}</a>
