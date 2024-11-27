<!-- src/routes/admin/+page.svelte -->
<script>
	export let data;
</script>

<div class="p-4">
	<h1 class="text-2xl font-bold mb-4">Admin Dashboard</h1>
	<p class="mb-4">Welcome, {data.profile.email}!</p>

	<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
		<div class="p-4 bg-white rounded shadow">
			<h2 class="font-bold mb-2">Profile Details</h2>
			<p>Role: {data.profile.role}</p>
			<p>ID: {data.profile.id}</p>
		</div>
	</div>
</div>
