/**
 * lib/notificaciones/meEncanta.ts
 * Crea la notificación "X te dio Me encanta" para la otra persona.
 * Regla del plan:
 *  - Si quien da el Me encanta es VIP, su plan siempre se muestra (los VIP ya tienen insignia pública).
 *  - Si no es VIP, su plan solo se muestra cuando quien lo recibe es VIP.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ETIQUETA_PLAN } from '@/lib/planes/colorPlan';

export async function notificarMeEncanta(
  supabase: SupabaseClient,
  datos: {
    paraId: string;
    paraPlan: string | null | undefined;
    deAlias: string | null | undefined;
    dePlan: string | null | undefined;
  },
): Promise<void> {
  const alias = datos.deAlias || 'Alguien';
  const emisorVip = datos.dePlan === 'vip';
  const receptorVip = datos.paraPlan === 'vip';
  const planTexto = datos.dePlan ? ETIQUETA_PLAN[datos.dePlan] : null;

  const mostrarPlan = !!planTexto && (emisorVip || receptorVip);
  const mensaje = mostrarPlan
    ? `${alias} (plan ${planTexto}) te dio Me encanta ❤️`
    : `${alias} te dio Me encanta ❤️`;

  const { error } = await supabase.from('notificaciones').insert({
    para_usuario_id: datos.paraId,
    mensaje,
    ruta: '/explorar',
  });
  if (error) {
    console.error('Error creando notificación de Me encanta:', error.message, error.details, error.hint, error.code);
  }
}