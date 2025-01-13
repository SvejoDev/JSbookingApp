export const load = async ({ locals }) => {
	if (!locals.user) {
		return {
			user: null
		};
	}

	return {
		user: {
			email: locals.user.email,
			role: locals.user.role
		}
	};
};
