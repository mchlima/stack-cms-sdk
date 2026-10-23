<script>
  let { attributes, children } = $props();
</script>

<section class="destaque" data-types="{typeof attributes.nivel} {typeof attributes.aberto}">{@render children?.()}</section>
