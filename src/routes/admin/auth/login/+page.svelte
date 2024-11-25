// src/routes/admin/auth/login/+page.svelte
<script>
    import { supabase } from '$lib/supabaseClient';
    import { goto } from '$app/navigation';
    import { Alert } from "$lib/components/ui/alert";
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import { Card, CardHeader, CardContent, CardFooter } from "$lib/components/ui/card";

    let email = '';
    let password = '';
    let loading = false;
    let error = null;

    async function handleLogin() {
        try {
            loading = true;
            error = null;

            const { data, error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (signInError) throw signInError;

            // Check if user is admin
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', data.user.id)
                .single();

            if (profileError || !profile || profile.role !== 'admin') {
                throw new Error('Unauthorized access');
            }

            goto('/admin');
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
            <h2 class="text-2xl font-bold text-center">Admin Login</h2>
        </CardHeader>
        
        <CardContent>
            <form on:submit|preventDefault={handleLogin} class="space-y-4">
                <div class="space-y-2">
                    <Input
                        type="email"
                        placeholder="Email"
                        bind:value={email}
                        required
                    />
                </div>
                
                <div class="space-y-2">
                    <Input
                        type="password"
                        placeholder="Password"
                        bind:value={password}
                        required
                    />
                </div>

                {#if error}
                    <Alert variant="destructive">
                        {error}
                    </Alert>
                {/if}

                <Button 
                    type="submit" 
                    class="w-full"
                    disabled={loading}
                >
                    {loading ? 'Loading...' : 'Login'}
                </Button>
            </form>
        </CardContent>
    </Card>
</div>