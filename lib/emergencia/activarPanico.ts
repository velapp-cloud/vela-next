import type { SupabaseClient } from '@supabase/supabase-js';

export type MotivoEmergencia = 'fui_agredido' | 'me_faltaron_respeto' | 'cita_no_como_planeado' | 'otro';

export const ETIQUETA_MOTIVO: Record<MotivoEmergencia, string> = {
  fui_agredido: 'Fui agredido/a',
  me_faltaron_respeto: 'Me faltaron el respeto',
  cita_no_como_planeado: 'La cita no salió como planeado',
  otro: 'Otro motivo',
};

export async function registrarEmergencia(supabase: SupabaseClient, params: {
  citaId: string;
  reportadoPor: string;
  contraparteId: string;
  motivo: MotivoEmergencia;
}) {
  await supabase.from('citas').update({
    en_emergencia: true,
    en_emergencia_por: params.reportadoPor,
    emergencia_iniciada_en: new Date().toISOString(),
  }).eq('id', params.citaId);

  await supabase.from('reportes_emergencia').insert({
    cita_id: params.citaId,
    reportado_por: params.reportadoPor,
    contraparte_id: params.contraparteId,
    motivo: params.motivo,
  });

  // Aviso a la otra persona (además del bloqueo que le aparece en pantalla).
  await supabase.from('notificaciones').insert({
    para_usuario_id: params.contraparteId,
    mensaje: '🚨 La otra persona activó una alerta de emergencia en la cita. Tu app quedó bloqueada hasta que la resuelva.',
    ruta: '/encuentro',
  });
}

export async function desactivarEmergencia(supabase: SupabaseClient, citaId: string) {
  await supabase.from('citas').update({
    en_emergencia: false,
    en_emergencia_por: null,
    emergencia_automatica: false,
  }).eq('id', citaId);
}

export async function avisarContactosEmergencia(supabase: SupabaseClient, usuarioId: string, mensaje: string) {
  const { data: contactos } = await supabase
    .from('contactos_emergencia')
    .select('nombre, pais_dial, telefono')
    .eq('usuario_id', usuarioId);

  (contactos ?? []).forEach((c) => {
    const numero = `${c.pais_dial}${c.telefono}`.replace(/[^\d]/g, '');
    if (!numero) return;
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
  });

  return contactos?.length ?? 0;
}