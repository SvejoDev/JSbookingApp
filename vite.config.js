import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	optimizeDeps: {
		include: ['lucia', '@lucia-auth/adapter-postgresql']
	},
	ssr: {
		noExternal: ['lucia', '@lucia-auth/adapter-postgresql']
	},
	server: {
		port: 3001,
		host: true,
		strictPort: true,
		allowedHosts: ['stisses.se', 'localhost']
	},
	preview: {
		port: 3001,
		host: true,
		strictPort: true
	}
});
