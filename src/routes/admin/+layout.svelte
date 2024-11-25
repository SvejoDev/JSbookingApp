<!-- src/routes/admin/+layout.svelte -->
<script>
	import { page } from '$app/stores';
</script>

{#if $page.url.pathname !== '/admin/auth/login'}
	<div class="min-h-screen">
		<header class="bg-gray-800 text-white p-4">
			<div class="max-w-7xl mx-auto">
				<h1 class="text-xl font-bold">Admin Dashboard</h1>
			</div>
		</header>
		<main class="max-w-7xl mx-auto p-4">
			<slot />
		</main>
	</div>
{:else}
	<slot />
{/if}
