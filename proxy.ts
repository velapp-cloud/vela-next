/**
 * proxy.ts
 * (Se llamaba "middleware.ts" en versiones anteriores de Next.js —
 * Next.js 16 renombro esta convencion a "proxy.ts", mismo proposito.)
 * Corre en el servidor antes de cada peticion. Su unico trabajo es
 * mantener la sesion de Supabase fresca (refrescar el token si esta por
 * vencer) — esto es NUEVO respecto a la version de Expo, donde el
 * refresco de sesion solo pasaba del lado del cliente. Aqui NO se
 * decide todavia a donde redirigir segun rol/verificacion — eso vive en
 * cada layout, igual que "hidratarSession" vivia en _layout.tsx.
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Esto fuerza a Supabase a revisar/refrescar el token — sin esta
  // linea, la sesion podia vencerse en silencio en llamadas del
  // servidor (Server Components), aunque el navegador la siguiera
  // viendo activa.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
