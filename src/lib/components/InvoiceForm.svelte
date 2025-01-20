<script>
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group';

	export let invoiceData = {
		invoiceType: 'pdf',
		invoiceEmail: '',
		glnPeppolId: '',
		marking: '',
		organization: '',
		address: '',
		postalCode: '',
		city: ''
	};
</script>

<div class="space-y-4">
	<RadioGroup
		value={invoiceData.invoiceType}
		onValueChange={(value) => (invoiceData.invoiceType = value)}
	>
		<div class="flex items-center space-x-2">
			<RadioGroupItem value="pdf" id="pdf" />
			<Label for="pdf">Vi önskar att betala mot faktura (PDF)</Label>
		</div>
		<div class="flex items-center space-x-2">
			<RadioGroupItem value="electronic" id="electronic" />
			<Label for="electronic">Vi önskar elektronisk faktura</Label>
		</div>
	</RadioGroup>

	{#if invoiceData.invoiceType === 'pdf'}
		<div class="space-y-2">
			<Label for="invoiceEmail">E-postadress för faktura</Label>
			<Input type="email" id="invoiceEmail" bind:value={invoiceData.invoiceEmail} required />
		</div>
	{:else}
		<div class="space-y-2">
			<Label for="glnPeppolId">GLN/PEPPOL-ID</Label>
			<Input
				type="text"
				id="glnPeppolId"
				bind:value={invoiceData.glnPeppolId}
				maxlength="15"
				required
			/>
		</div>
		<div class="space-y-2">
			<Label for="marking">Märkning</Label>
			<Input type="text" id="marking" bind:value={invoiceData.marking} maxlength="8" required />
		</div>
	{/if}

	<!-- Common invoice details -->
	<div class="space-y-2">
		<Label for="organization">Organisation</Label>
		<Input type="text" id="organization" bind:value={invoiceData.organization} required />
	</div>

	<div class="space-y-2">
		<Label for="address">Adress</Label>
		<Input type="text" id="address" bind:value={invoiceData.address} required />
	</div>

	<div class="grid grid-cols-2 gap-4">
		<div class="space-y-2">
			<Label for="postalCode">Postnummer</Label>
			<Input type="text" id="postalCode" bind:value={invoiceData.postalCode} required />
		</div>
		<div class="space-y-2">
			<Label for="city">Ort</Label>
			<Input type="text" id="city" bind:value={invoiceData.city} required />
		</div>
	</div>
</div>
