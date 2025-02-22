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

	return optionalProducts
		.map(
			(product) => `
			<tr>
				<td style="padding: 5px 0; border-bottom: 1px solid #eee;">${product.name}</td>
				<td style="padding: 5px 0; text-align: right; border-bottom: 1px solid #eee;">
					${product.type === 'per_person' ? `${product.quantity} personer` : `${product.quantity} st`}
				</td>
				<td style="padding: 5px 0; text-align: right; border-bottom: 1px solid #eee;">
					${formatPrice(product.total_price)} kr
				</td>
			</tr>
		`
		)
		.join('');
}
