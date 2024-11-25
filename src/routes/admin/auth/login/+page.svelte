<script>
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { Card, CardHeader, CardContent, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Alert } from '$lib/components/ui/alert';

	export let form;
	let loading = false;
</script>

<div class="flex items-center justify-center min-h-screen bg-gray-100">
	<Card class="w-full max-w-md">
		<CardHeader>
			<CardTitle>Admin Login</CardTitle>
		</CardHeader>
		<CardContent>
			<form
				method="POST"
				action="?/login"
				use:enhance={() => {
					loading = true;
					return async ({ result, update }) => {
						loading = false;

						// If the action redirected, manually apply the redirect
						if (result.type === 'redirect') {
							goto(result.location);
							return;
						}

						// Otherwise, update the form
						await update();
					};
				}}
				class="space-y-4"
			>
				<div class="space-y-2">
					<label for="email">Email</label>
					<Input id="email" name="email" type="email" value={form?.email ?? ''} required />
				</div>
				<div class="space-y-2">
					<label for="password">Password</label>
					<Input id="password" name="password" type="password" required />
				</div>
				{#if form?.error}
					<Alert variant="destructive">{form.error}</Alert>
				{/if}
				<Button type="submit" disabled={loading} class="w-full">
					{loading ? 'Loading...' : 'Login'}
				</Button>
			</form>
		</CardContent>
	</Card>
</div>
