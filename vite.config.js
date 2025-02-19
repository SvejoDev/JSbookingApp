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
		allowedHosts: ['svejo.se', 'stisses.se', 'localhost', 'book.stisses.dev.svejo.se'],
		hmr: false
	},
	preview: {
		port: 3001,
		host: true,
		strictPort: true
	}
});
