// importera rollerna från lucia konfigurationen
import { Roles } from './lucia';

// definiera behörigheter för varje roll
const permissions = {
	[Roles.ADMIN]: [
		'manage_users',
		'invite_users',
		'manage_experiences',
		'manage_bookings',
		'view_finances',
		'manage_inventory',
		'send_confirmations',
		'export_customers'
	],
	[Roles.PLATSCHEF]: [
		'manage_staff',
		'manage_bookings',
		'manage_refunds',
		'view_users',
		'manage_shifts'
	],
	[Roles.OBSERVATOR]: ['view_inventory', 'view_availability', 'view_bookings', 'view_finances'],
	[Roles.STAFF]: ['view_bookings', 'manage_basic_tasks'],
	[Roles.CHAUFFOR]: ['view_assignments', 'manage_transport'],
	[Roles.UPPLEVELSEGUIDE]: ['view_daily_bookings', 'manage_checkins']
};

// hjälpfunktion för att kontrollera om en roll har en specifik behörighet
export function hasPermission(role, permission) {
	return permissions[role]?.includes(permission) ?? false;
}

// hjälpfunktion för att få alla behörigheter för en roll
export function getPermissions(role) {
	return permissions[role] || [];
}

// hjälpfunktion för att kontrollera om användaren har tillgång till en viss route
export function canAccessRoute(role, route) {
	// admin har tillgång till allt
	if (role === Roles.ADMIN) return true;

	// mappning av routes till nödvändiga behörigheter
	const routePermissions = {
		'/admin/staff': ['manage_staff', 'view_users'],
		'/admin/finance': ['view_finances'],
		'/admin/bookings': ['view_bookings', 'manage_bookings'],
		'/admin/inventory': ['view_inventory', 'manage_inventory']
		// lägg till fler routes efter behov
	};

	// hitta behörigheter som krävs för routen
	const requiredPermissions = routePermissions[route];
	if (!requiredPermissions) return false;

	// kontrollera om rollen har någon av de nödvändiga behörigheterna
	return requiredPermissions.some((permission) => hasPermission(role, permission));
}
