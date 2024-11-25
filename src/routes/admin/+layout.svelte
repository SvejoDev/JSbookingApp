<!-- src/routes/admin/+layout.svelte -->
<script>
    import { page } from '$app/stores';
    import { supabase } from '$lib/supabaseClient';
    import { goto } from '$app/navigation';

    async function handleSignOut() {
        const { error } = await supabase.auth.signOut();
        if (!error) {
            goto('/admin/auth/login');
        }
    }
</script>

{#if $page.url.pathname !== '/admin/auth/login'}
    <div class="min-h-screen">
        <!-- Navigation -->
        <nav class="bg-gray-800 text-white">
            <div class="max-w-7xl mx-auto px-4">
                <div class="flex items-center justify-between h-16">
                    <div class="flex items-center">
                        <span class="text-xl font-bold">Admin Dashboard</span>
                        <div class="ml-10 flex items-baseline space-x-4">
                            <a href="/admin" class="px-3 py-2 rounded-md text-sm font-medium" 
                               class:bg-gray-900={$page.url.pathname === '/admin'}>
                                Dashboard
                            </a>
                            <a href="/admin/bookings" class="px-3 py-2 rounded-md text-sm font-medium"
                               class:bg-gray-900={$page.url.pathname.includes('/admin/bookings')}>
                                Bookings
                            </a>
                            <a href="/admin/staff" class="px-3 py-2 rounded-md text-sm font-medium"
                               class:bg-gray-900={$page.url.pathname.includes('/admin/staff')}>
                                Staff
                            </a>
                            <a href="/admin/finance" class="px-3 py-2 rounded-md text-sm font-medium"
                               class:bg-gray-900={$page.url.pathname.includes('/admin/finance')}>
                                Finance
                            </a>
                        </div>
                    </div>
                    <button 
                        on:click={handleSignOut}
                        class="px-3 py-2 rounded-md text-sm font-medium bg-red-600 hover:bg-red-700"
                    >
                        Sign Out
                    </button>
                </div>
            </div>
        </nav>

        <!-- Main Content -->
        <main class="max-w-7xl mx-auto py-6 px-4">
            <slot />
        </main>
    </div>
{:else}
    <slot />
{/if}