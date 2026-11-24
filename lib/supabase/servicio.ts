/**
 * lib/supabase/servicio.ts
 * Cliente de Supabase con la clave service_role. SOLO para código del servidor
 * (rutas /api). Se salta RLS: nunca lo importes desde un componente 'use client'.
 */
import { createClient } from '@supabase/supabase-js';

export function crearClienteServicio() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor');
  }
  return createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}