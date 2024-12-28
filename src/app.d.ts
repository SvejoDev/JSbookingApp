/// <reference types="@sveltejs/kit" />
import type { AuthRequest } from '@lucia-auth/sveltekit';

// se https://kit.svelte.dev/docs/types#app
declare global {
    namespace App {
        interface Locals {
            auth: AuthRequest;
            user: {
                id: string;
                email: string;
                role: string;
            } | null;
        }
    }
}