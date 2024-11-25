// src/routes/+page.svelte
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
    let showVerifyForm = false;

    onMount(() => {
        // Check if this is an invitation link
        const hash = window.location.hash;
        if (hash && hash.includes('type=invite')) {
            showVerifyForm = true;
            // Set the access token in the session
            const params = new URLSearchParams(hash.replace('#', ''));
            const accessToken = params.get('access_token');
            
            if (accessToken) {
                // Set the session with the access token
                supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: params.get('refresh_token')
                });
            } else {
                error = 'Invalid invitation link';
            }
        } else {
            // If not an invitation link, redirect to home or login
            goto('/admin/auth/login');
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

            // Show success message and redirect
            alert('Password set successfully! Please log in.');
            goto('/admin/auth/login');
        } catch (e) {
            error = e.message;
        } finally {
            loading = false;
        }
    }
</script>

{#if showVerifyForm}
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
                        disabled={loading}
                    >
                        {loading ? 'Setting Password...' : 'Set Password'}
                    </Button>
                </form>
            </CardContent>
        </Card>
    </div>
{/if}