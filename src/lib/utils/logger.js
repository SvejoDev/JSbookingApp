export const logger = {
	debug: (...args) => {
		if (process.env.NODE_ENV === 'development') {
			console.group('🔍 Debug:');
			console.log(...args);
			console.groupEnd();
		}
	},

	error: (...args) => {
		if (process.env.NODE_ENV === 'development') {
			console.group('❌ Error:');
			console.error(...args);
			console.groupEnd();
		}
	},

	info: (...args) => {
		if (process.env.NODE_ENV === 'development') {
			console.group('ℹ️ Info:');
			console.info(...args);
			console.groupEnd();
		}
	}
};
