/**
 * lib/supabase/client.ts
 * Cliente de Supabase para usar dentro de Client Components ('use client').
 * Equivalente al unico "supabaseClient.ts" que usaba la version de Expo —
 * aqui se separa en 2 archivos (client.ts / server.ts) porque asi lo pide
 * el modelo de Next.js App Router: el navegador y el servidor necesitan
 * manejar la sesion de forma distinta.
 */
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
