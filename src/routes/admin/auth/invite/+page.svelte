<script>
	import { enhance } from '$app/forms';
	import { Alert } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Select } from '$lib/components/ui/select';
	import { Card, CardHeader, CardContent } from '$lib/components/ui/card';

	let loading = false;
	let success = false;
	let error = null;

	function handleSubmit() {
		loading = true;
		return async ({ result }) => {
			loading = false;
			if (result.type === 'success') {
				success = true;
				error = null;
			} else {
				error = result.error;
				success = false;
			}
		};
	}
</script>

// src/routes/admin/auth/invite/+page.svelte
<div class="container mx-auto px-4 py-8">
	<Card class="max-w-md mx-auto">
		<CardHeader>
			<h2 class="text-2xl font-bold">Invite Team Member</h2>
		</CardHeader>

		<CardContent>
			<form method="POST" action="?/invite" use:enhance={handleSubmit} class="space-y-4">
				<div class="space-y-2">
					<label for="email">Email</label>
					<Input id="email" name="email" type="email" required />
				</div>

				<div class="space-y-2">
					<label for="role">Role</label>
					<Select name="role" required>
						<option value="admin">Admin</option>
						<option value="staff">Staff</option>
					</Select>
				</div>

				{#if error}
					<Alert variant="destructive">
						{error}
					</Alert>
				{/if}

				{#if success}
					<Alert>Invitation sent successfully!</Alert>
				{/if}

				<Button type="submit" class="w-full" disabled={loading}>
					{loading ? 'Sending...' : 'Send Invitation'}
				</Button>
			</form>
		</CardContent>
	</Card>
</div>
