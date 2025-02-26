// importera miljövariabler från $app/environment
import { browser, dev } from '$app/environment';

// en konfigurerbar logger som kan styras via miljövariabler
const isProduction = !dev;

// hjälpfunktion för att hämta miljövariabler säkert
// fungerar både på server och klient
const getEnvValue = (key, defaultValue) => {
	// i webbläsaren, använd window.__env om det finns
	if (browser) {
		if (window.__env && window.__env[key] !== undefined) {
			return window.__env[key];
		}
		return defaultValue;
	}

	// på servern, använd process.env
	try {
		// dynamisk import fungerar bara på servern
		const env = process.env || {};
		return env[key] !== undefined ? env[key] : defaultValue;
	} catch (e) {
		return defaultValue;
	}
};

// möjlighet att stänga av loggning även i utvecklingsmiljö
const isLoggingDisabled = getEnvValue('DISABLE_LOGGING', 'false') === 'true';

// möjlighet att aktivera specifika loggnivåer
const defaultLogLevels = ['debug', 'info', 'warn', 'error'];
const enabledLogLevels = (() => {
	const levels = getEnvValue('LOG_LEVELS', '');
	return levels ? levels.split(',') : defaultLogLevels;
})();

// hjälpfunktion för att kontrollera om en loggnivå är aktiverad
const isLevelEnabled = (level) => {
	if (isLoggingDisabled) return false;
	if (isProduction && level !== 'error') return false;
	return enabledLogLevels.includes(level);
};

// fånga alla console-anrop och dirigera dem till logger
if (browser) {
	// spara originala console-metoder
	const originalConsole = {
		log: console.log,
		error: console.error,
		warn: console.warn,
		info: console.info,
		debug: console.debug
	};

	// ersätt console-metoder med logger-anrop
	console.log = (...args) => {
		if (isLevelEnabled('info')) {
			originalConsole.log(...args);
		}
	};

	console.error = (...args) => {
		if (isLevelEnabled('error')) {
			originalConsole.error(...args);
		}
	};

	console.warn = (...args) => {
		if (isLevelEnabled('warn')) {
			originalConsole.warn(...args);
		}
	};

	console.info = (...args) => {
		if (isLevelEnabled('info')) {
			originalConsole.info(...args);
		}
	};

	console.debug = (...args) => {
		if (isLevelEnabled('debug')) {
			originalConsole.debug(...args);
		}
	};
}

export const logger = {
	debug: (...args) => {
		if (isLevelEnabled('debug')) {
			console.group('🔍 debug:');
			console.log(...args);
			console.groupEnd();
		}
	},

	error: (...args) => {
		// felmeddelanden loggas alltid i produktion, om inte all loggning är avstängd
		if (isLevelEnabled('error')) {
			console.group('❌ error:');
			console.error(...args);
			console.groupEnd();
		}
	},

	info: (...args) => {
		if (isLevelEnabled('info')) {
			console.group('ℹ️ info:');
			console.info(...args);
			console.groupEnd();
		}
	},

	warn: (...args) => {
		if (isLevelEnabled('warn')) {
			console.group('⚠️ varning:');
			console.warn(...args);
			console.groupEnd();
		}
	}
};

// för att undvika att behöva importera logger överallt
// kan vi lägga till en global logger i utvecklingsmiljö
if (browser && !isProduction) {
	window.logger = logger;
}
