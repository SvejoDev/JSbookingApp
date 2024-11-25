<!-- src/routes/admin/+page.svelte -->
<script>
    import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card";
</script>

<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
    <Card>
        <CardHeader>
            <CardTitle>Total Bookings</CardTitle>
        </CardHeader>
        <CardContent>
            <div class="text-2xl font-bold">0</div>
            <p class="text-xs text-muted-foreground">
                +0% from last month
            </p>
        </CardContent>
    </Card>

    <Card>
        <CardHeader>
            <CardTitle>Revenue</CardTitle>
        </CardHeader>
        <CardContent>
            <div class="text-2xl font-bold">$0</div>
            <p class="text-xs text-muted-foreground">
                +0% from last month
            </p>
        </CardContent>
    </Card>

    <Card>
        <CardHeader>
            <CardTitle>Active Staff</CardTitle>
        </CardHeader>
        <CardContent>
            <div class="text-2xl font-bold">1</div>
            <p class="text-xs text-muted-foreground">
                You (Admin)
            </p>
        </CardContent>
    </Card>
</div>