<script>
	import { page } from '$app/stores';
	import Sidebar from '$lib/components/admin/Sidebar.svelte';

	// Check if we're on the login page
	$: isLoginPage = $page.url.pathname === '/admin/auth/login';
</script>

<div class="flex h-screen bg-gray-100">
	{#if !isLoginPage}
		<div class="w-64 flex-shrink-0">
			<Sidebar />
		</div>
	{/if}
	<div class="flex-grow overflow-auto">
		<main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
			<slot />
		</main>
	</div>
</div>
