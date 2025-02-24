// Gemensamma hjälpfunktioner för e-post
export function formatDateTime(date, time) {
	if (!date || !time) return 'Ej angivet';
	try {
		const dateObj = new Date(date);
		const formattedDate = dateObj.toLocaleDateString('sv-SE', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
		const formattedTime = time.split(':').slice(0, 2).join(':');
		return `${formattedDate} kl. ${formattedTime}`;
	} catch (error) {
		console.error('Fel vid datumformatering:', error);
		return 'Ogiltigt datum/tid';
	}
}

export function formatPrice(price) {
	return typeof price === 'number' ? price.toFixed(2) : '0.00';
}

export function formatOptionalProducts(optionalProducts) {
	if (!optionalProducts || optionalProducts.length === 0) return '';

	return `
		<h3 style="margin-top: 20px;">Tillvalsprodukter</h3>
		<table style="width: 100%; border-collapse: collapse;">
			<tr>
				<th style="text-align: left;">Produkt</th>
				<th style="text-align: right;">Antal</th>
				<th style="text-align: right;">Pris</th>
			</tr>
			${optionalProducts
				.map(
					(product) => `
				<tr>
					<td>${product.name}</td>
					<td style="text-align: right;">${product.quantity}</td>
					<td style="text-align: right;">${formatPrice(product.total_price)} kr</td>
				</tr>
			`
				)
				.join('')}
		</table>
	`;
}

export function formatDate(dateString) {
	if (!dateString) return 'Ej angivet';
	try {
		const date = new Date(dateString);
		return date.toLocaleDateString('sv-SE', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	} catch (error) {
		console.error('Fel vid datumformatering:', error);
		return 'Ogiltigt datum';
	}
}
