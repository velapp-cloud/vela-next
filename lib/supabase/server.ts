/**
 * lib/supabase/server.ts
 * Cliente de Supabase para usar en Server Components, Server Actions, y
 * Route Handlers — lee/escribe la sesion desde las cookies de Next.js
 * (en la version de Expo esto no existia, porque todo corria del lado
 * del cliente; en Next.js con App Router, este es el que hace posible
 * proteger rutas ANTES de que la pagina llegue al navegador).
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Se puede ignorar si esto se llama desde un Server Component
            // sin permiso de escribir cookies — el middleware ya se
            // encarga de refrescar la sesion en esos casos.
          }
        },
      },
    }
  );
}
