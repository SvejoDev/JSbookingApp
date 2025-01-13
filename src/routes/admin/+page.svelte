<script>
    export let data;
    
    $: user = data.user || {};
</script>

<div class="container mx-auto p-4">
    <h1 class="text-2xl font-bold mb-4">Välkommen till Admin-panelen</h1>
    {#if user?.email}
        <p>Inloggad som: {user.email}</p>
    {/if}
</div>