<script>
	// props
	export let value = 0;
	export let min = 0;
	export let max = Infinity;
	export let onValueChange = (value) => {};

	// metoder
	function handleChange(event) {
		const newValue = Math.min(Math.max(parseInt(event.target.value) || 0, min), max);
		if (newValue !== value) {
			value = newValue;
			onValueChange(value);
		}
	}

	function increment() {
		if (value < max) {
			value++;
			onValueChange(value);
		}
	}

	function decrement() {
		if (value > min) {
			value--;
			onValueChange(value);
		}
	}
</script>

<div class="flex items-center gap-2">
	<button
		type="button"
		class="px-2 py-1 border rounded-l hover:bg-gray-100"
		on:click={decrement}
		disabled={value <= min}
	>
		-
	</button>
	<input
		type="number"
		{min}
		{max}
		{value}
		on:change={handleChange}
		class="w-16 text-center border-y"
	/>
	<button
		type="button"
		class="px-2 py-1 border rounded-r hover:bg-gray-100"
		on:click={increment}
		disabled={value >= max}
	>
		+
	</button>
</div>
