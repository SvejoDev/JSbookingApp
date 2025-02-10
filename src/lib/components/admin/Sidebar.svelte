<script>
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button';
	import {
		Calendar,
		Search,
		PlusCircle,
		Download,
		Star,
		Package,
		Settings,
		DollarSign,
		Users,
		ChevronDown,
		Clock,
		Boxes,
		Menu
	} from 'lucide-svelte';

	let isOpen = false;
	let activeSections = [];

	const toggleSidebar = () => {
		isOpen = !isOpen;
	};

	const toggleSection = (section) => {
		const index = activeSections.indexOf(section);
		if (index === -1) {
			activeSections = [...activeSections, section];
		} else {
			activeSections = activeSections.filter((s) => s !== section);
		}
	};

	$: currentPath = $page.url.pathname;

	const navItems = [
		{
			title: 'Manifest',
			icon: Calendar,
			href: '/admin/bookings'
		},
		{
			title: 'Bokningar',
			icon: Calendar,
			subitems: [
				{ title: 'Sök', href: '/admin/bookings/search', icon: Search },
				{ title: 'Ny bokning', href: '/admin/bookings/new', icon: PlusCircle },
				{ title: 'Exportera', href: '/admin/bookings/export', icon: Download }
			]
		},
		{
			title: 'Upplevelser',
			icon: Star,
			subitems: [
				{ title: 'Redigera', href: '/admin/experiences/edit', icon: Star },
				{ title: 'Skapa ny', href: '/admin/experiences/new', icon: PlusCircle }
			]
		},
		{
			title: 'Produkter',
			icon: Package,
			subitems: [
				{ title: 'Redigera', href: '/admin/products/edit', icon: Package },
				{ title: 'Skapa ny', href: '/admin/products/new', icon: PlusCircle }
			]
		},
		{
			title: 'Inställningar',
			icon: Settings,
			subitems: [
				{ title: 'Öppettider', href: '/admin/settings/hours', icon: Clock },
				{ title: 'Lagerstatus', href: '/admin/settings/inventory', icon: Boxes }
			]
		},
		{
			title: 'Försäljning',
			icon: DollarSign,
			href: '/admin/sales'
		},
		{
			title: 'Personal',
			icon: Users,
			subitems: [
				{ title: 'Redigera', href: '/admin/staff/edit', icon: Users },
				{ title: 'Skapa ny', href: '/admin/staff/new', icon: PlusCircle }
			]
		}
	];
</script>

<nav class="flex flex-col h-full bg-white border-r border-gray-200 shadow-sm">
	<div class="p-6 border-b border-gray-200">
		<div class="flex items-center justify-center">
			<img src="/Logga.svg" alt="STISSES Logo" class="h-8" />
		</div>
		<Button variant="ghost" class="lg:hidden w-full justify-start mt-4" on:click={toggleSidebar}>
			<Menu class="mr-2 h-4 w-4" />
			<span>Menu</span>
		</Button>
	</div>

	<div class="flex-1 overflow-y-auto">
		<ul class={`p-4 space-y-1 ${isOpen ? 'block' : 'hidden lg:block'}`}>
			{#each navItems as item}
				<li>
					{#if item.subitems}
						<button
							class="w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 {activeSections.includes(
								item.title
							)
								? 'bg-gray-100'
								: ''}"
							on:click={() => toggleSection(item.title)}
						>
							<div class="flex items-center gap-3">
								<svelte:component this={item.icon} class="h-4 w-4 text-gray-500" />
								<span class="text-gray-700">{item.title}</span>
							</div>
							<ChevronDown
								class={`h-4 w-4 text-gray-500 transition-transform duration-200 ${
									activeSections.includes(item.title) ? 'rotate-180' : ''
								}`}
							/>
						</button>
						{#if activeSections.includes(item.title)}
							<ul class="mt-1 ml-4 space-y-1">
								{#each item.subitems as subitem}
									<li>
										<a
											href={subitem.href}
											class="flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors hover:bg-gray-100 {currentPath ===
											subitem.href
												? 'bg-gray-100 text-primary font-medium'
												: 'text-gray-600'}"
										>
											<svelte:component this={subitem.icon} class="h-4 w-4 text-gray-400" />
											<span>{subitem.title}</span>
										</a>
									</li>
								{/each}
							</ul>
						{/if}
					{:else}
						<a
							href={item.href}
							class="flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors hover:bg-gray-100 {currentPath ===
							item.href
								? 'bg-gray-100 text-primary font-medium'
								: 'text-gray-600'}"
						>
							<svelte:component this={item.icon} class="h-4 w-4 text-gray-400" />
							<span>{item.title}</span>
						</a>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
	<div class="p-4 border-t border-gray-200">
		<form action="/admin/auth/logout" method="POST">
			<Button variant="ghost" class="w-full justify-start" type="submit">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4 mr-2"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
					/>
				</svg>
				Logga ut
			</Button>
		</form>
	</div>
</nav>

<style>
	/* Custom scrollbar styles */
	.overflow-y-auto {
		scrollbar-width: thin;
		scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
	}

	.overflow-y-auto::-webkit-scrollbar {
		width: 4px;
	}

	.overflow-y-auto::-webkit-scrollbar-track {
		background: transparent;
	}

	.overflow-y-auto::-webkit-scrollbar-thumb {
		background-color: rgba(0, 0, 0, 0.2);
		border-radius: 2px;
	}
</style>
