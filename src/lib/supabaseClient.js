import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '$env/static/private';

console.log('SUPABASE_URL:', SUPABASE_URL); // Debugging line
console.log('SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY); // Debugging line

const supabaseUrl = SUPABASE_URL;
const supabaseKey = SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);
