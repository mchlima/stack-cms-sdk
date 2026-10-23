<script>
  let { href, children } = $props();
</script>

<a {href} data-site-link="">{@render children?.()}</a>
