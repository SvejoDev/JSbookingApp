// src/routes/verify/+page.svelte
<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { supabase } from '$lib/supabaseClient';
    import { Card, CardHeader, CardContent, CardTitle } from "$lib/components/ui/card";
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import { Alert } from "$lib/components/ui/alert";

    let password = '';
    let confirmPassword = '';
    let loading = false;
    let error = null;
    let accessToken = '';

    onMount(() => {
        // Get the access token from the URL hash
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.replace('#', ''));
        accessToken = params.get('access_token');
        
        if (!accessToken) {
            error = 'Invalid invitation link';
        }
    });

    async function handleSetPassword() {
        if (password !== confirmPassword) {
            error = 'Passwords do not match';
            return;
        }

        try {
            loading = true;
            error = null;

            // Update the user's password
            const { error: updateError } = await supabase.auth.updateUser({
                password: password
            });

            if (updateError) throw updateError;

            // Redirect to admin login
            goto('/admin/auth/login');
        } catch (e) {
            error = e.message;
        } finally {
            loading = false;
        }
    }
</script>

<div class="flex items-center justify-center min-h-screen bg-gray-100">
    <Card class="w-full max-w-md">
        <CardHeader>
            <CardTitle>Set Your Password</CardTitle>
        </CardHeader>
        
        <CardContent>
            {#if error}
                <Alert variant="destructive" class="mb-4">
                    {error}
                </Alert>
            {/if}

            <form on:submit|preventDefault={handleSetPassword} class="space-y-4">
                <div class="space-y-2">
                    <Input
                        type="password"
                        placeholder="New Password"
                        bind:value={password}
                        required
                        minlength="6"
                    />
                </div>

                <div class="space-y-2">
                    <Input
                        type="password"
                        placeholder="Confirm Password"
                        bind:value={confirmPassword}
                        required
                        minlength="6"
                    />
                </div>

                <Button 
                    type="submit" 
                    class="w-full"
                    disabled={loading || !accessToken}
                >
                    {loading ? 'Setting Password...' : 'Set Password'}
                </Button>
            </form>
        </CardContent>
    </Card>
</div>