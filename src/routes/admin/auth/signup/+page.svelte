<script>
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { Card, CardHeader, CardContent, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Alert } from '$lib/components/ui/alert';

	export let data;
	export let form;
	let loading = false;
</script>

<div class="flex items-center justify-center min-h-screen bg-gray-100">
	<Card class="w-full max-w-md">
		<CardHeader>
			<CardTitle>Skapa konto</CardTitle>
		</CardHeader>
		<CardContent>
			<form
				method="POST"
				use:enhance={() => {
					loading = true;
					return async ({ result }) => {
						loading = false;
						if (result.type === 'redirect') {
							goto(result.location);
						}
					};
				}}
				class="space-y-4"
			>
				<input type="hidden" name="token" value={data.token} />

				<div class="space-y-2">
					<label for="email">Email</label>
					<Input id="email" name="email" type="email" value={data.email} readonly />
				</div>

				<div class="space-y-2">
					<label for="password">Lösenord</label>
					<Input
						id="password"
						name="password"
						type="password"
						required
						autocomplete="new-password"
					/>
					<p class="text-sm text-gray-500">minst 8 tecken med minst en siffra</p>
				</div>

				{#if form?.message}
					<Alert variant="destructive">{form.message}</Alert>
				{/if}

				<Button type="submit" disabled={loading} class="w-full">
					{loading ? 'Skapar konto...' : 'Skapa konto'}
				</Button>
			</form>
		</CardContent>
	</Card>
</div>
