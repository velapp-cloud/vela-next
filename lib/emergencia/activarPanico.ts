import type { SupabaseClient } from '@supabase/supabase-js';

export type MotivoEmergencia = 'fui_agredido' | 'me_faltaron_respeto' | 'cita_no_como_planeado' | 'otro';

export const ETIQUETA_MOTIVO: Record<MotivoEmergencia, string> = {
  fui_agredido: 'Fui agredido/a',
  me_faltaron_respeto: 'Me faltaron el respeto',
  cita_no_como_planeado: 'La cita no salió como planeado',
  otro: 'Otro motivo',
};

/**
 * Activa la alerta de emergencia. El SERVIDOR registra la hora exacta y el tiempo
 * que quedaba de la cita en ese momento (queda guardado como respaldo para Vela),
 * bloquea a la otra persona y le manda la notificación.
 */
export async function registrarEmergencia(supabase: SupabaseClient, params: {
  citaId: string;
  reportadoPor: string;
  contraparteId: string;
  motivo: MotivoEmergencia;
}): Promise<{ yaActiva: boolean; restanteSegundos: number | null }> {
  const { data, error } = await supabase.rpc('activar_emergencia', { p_cita_id: params.citaId });

  if (error || !data?.ok) {
    console.error('No se pudo activar la alerta:', error?.message ?? data?.error);
    throw new Error('No se pudo activar la alerta');
  }

  // Si ya estaba activa no se duplica el reporte.
  if (!data.ya_activa) {
    const { error: errorReporte } = await supabase.from('reportes_emergencia').insert({
      cita_id: params.citaId,
      reportado_por: params.reportadoPor,
      contraparte_id: params.contraparteId,
      motivo: params.motivo,
    });
    if (errorReporte) console.error('Error guardando el reporte de emergencia:', errorReporte.message);
  }

  return { yaActiva: !!data.ya_activa, restanteSegundos: data.restante_segundos ?? null };
}

export async function desactivarEmergencia(supabase: SupabaseClient, citaId: string) {
  await supabase.from('citas').update({
    en_emergencia: false,
    en_emergencia_por: null,
    emergencia_automatica: false,
  }).eq('id', citaId);
}

/**
 * Avisa por SMS (desde el servidor) a los contactos de emergencia de quien activó la alerta.
 * No abre ninguna ventana. Devuelve null si no se pudo contactar al servidor.
 */
export async function avisarContactosPorSms(
  supabase: SupabaseClient,
  citaId: string,
): Promise<{ enviados: number; total: number } | null> {
  try {
    const { data: sesion } = await supabase.auth.getSession();
    const token = sesion.session?.access_token;
    if (!token) return null;
    const resp = await fetch('/api/emergencia/sms-panico', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ cita_id: citaId }),
    });
    if (!resp.ok) return null;
    const r = await resp.json();
    if (r.omitido) return null;
    return { enviados: r.enviados ?? 0, total: r.total ?? 0 };
  } catch {
    return null;
  }
}

/**
 * Antes abría WhatsApp por cada contacto para enviar un mensaje a mano.
 * Ya no abre ninguna ventana: los avisos van por SMS desde el servidor.
 * Se conserva solo para no romper a quien la importe; siempre devuelve 0.
 */
export async function avisarContactosEmergencia(_supabase: SupabaseClient, _usuarioId: string, _mensaje: string) {
  return 0;
}