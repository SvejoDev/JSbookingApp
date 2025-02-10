<script>
	import { page } from '$app/stores';
	import Sidebar from '$lib/components/admin/Sidebar.svelte';
	import { browser } from '$app/environment';

	// kontrollera om vi är på login-sidan
	$: isLoginPage = $page.url.pathname === '/admin/auth/login';

	// omdirigera till bokningar om vi är på /admin
	$: if (browser && $page.url.pathname === '/admin' && !isLoginPage) {
		window.location.href = '/admin/bookings';
	}
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
