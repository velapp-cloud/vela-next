import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * app/page.tsx
 * Entrada de la app ("/"): sin sesión va a la bienvenida (login/registro);
 * con sesión va a Explorar, y el layout de (app) decide el resto.
 */
export default async function Inicio() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  redirect(data.user ? '/explorar' : '/welcome');
}