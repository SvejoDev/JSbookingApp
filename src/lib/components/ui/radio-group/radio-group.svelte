<script>
	import { RadioGroup } from 'bits-ui';
	import { cn } from '$lib/utils';

	let className = undefined;
	export { className as class };
</script>

<RadioGroup.Root class={cn('grid gap-2', className)} {...$$restProps}>
	<slot />
</RadioGroup.Root>
