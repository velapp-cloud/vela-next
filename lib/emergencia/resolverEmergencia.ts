import type { SupabaseClient } from '@supabase/supabase-js';
import { ESTADO_CANCELADA } from '@/lib/citas/estados';
import { desactivarEmergencia } from '@/lib/emergencia/activarPanico';
import { ahoraServidor } from '@/lib/utils/horaServidor';

/**
 * lib/emergencia/resolverEmergencia.ts
 * Qué pasa cuando quien activó la alerta la desactiva:
 *  - seguirConLaCita: la cita continúa y el cronómetro se reanuda justo donde se detuvo.
 *  - cancelarPorEmergencia: la cita se cancela con el motivo y el chat se cierra.
 * En los dos casos se guarda/avisa el motivo.
 */

export type DatosResolver = {
  citaId: string;
  miId: string;
  miAlias: string;
  motivo: string;
};

export type ResultadoResolver = { ok: true; tiempoAjustado?: boolean } | { ok: false; error: string };

async function leerCita(supabase: SupabaseClient, citaId: string) {
  const { data } = await supabase
    .from('citas')
    .select('cliente_id, proveedora_id, chat_id, iniciada_en, emergencia_iniciada_en')
    .eq('id', citaId)
    .maybeSingle();
  return data as {
    cliente_id: string;
    proveedora_id: string;
    chat_id: string | null;
    iniciada_en: string | null;
    emergencia_iniciada_en: string | null;
  } | null;
}

export async function seguirConLaCita(supabase: SupabaseClient, d: DatosResolver): Promise<ResultadoResolver> {
  try {
    // Se lee ANTES de desactivar: al desactivar puede borrarse la hora en que empezó la alerta.
    const cita = await leerCita(supabase, d.citaId);
    if (!cita) return { ok: false, error: 'No se encontró la cita.' };

    await desactivarEmergencia(supabase, d.citaId);

    // El tiempo que estuvo activa la alerta no cuenta: se corre la hora de inicio esa misma cantidad,
    // así el cronómetro real continúa donde se detuvo (y no sigue corriendo "por detrás").
    let tiempoAjustado = false;
    if (cita.iniciada_en && cita.emergencia_iniciada_en) {
      const pausaMs = Math.max(0, ahoraServidor() - new Date(cita.emergencia_iniciada_en).getTime());
      if (pausaMs > 0) {
        const nuevoInicio = new Date(new Date(cita.iniciada_en).getTime() + pausaMs).toISOString();
        const { error } = await supabase.from('citas').update({ iniciada_en: nuevoInicio }).eq('id', d.citaId);
        if (error) console.error('No se pudo reanudar el cronómetro:', error.message);
        else tiempoAjustado = true;
      }
    }

    const otroId = cita.cliente_id === d.miId ? cita.proveedora_id : cita.cliente_id;
    await supabase.from('notificaciones').insert({
      para_usuario_id: otroId,
      mensaje: `${d.miAlias} desactivó la alerta de emergencia y la cita continúa. Motivo: ${d.motivo}.`,
      ruta: '/encuentro',
    });

    return { ok: true, tiempoAjustado };
  } catch (err) {
    console.error('Error desactivando la alerta:', err);
    return { ok: false, error: 'No se pudo desactivar la alerta. Intenta de nuevo.' };
  }
}

export async function cancelarPorEmergencia(supabase: SupabaseClient, d: DatosResolver): Promise<ResultadoResolver> {
  try {
    const cita = await leerCita(supabase, d.citaId);
    if (!cita) return { ok: false, error: 'No se encontró la cita.' };

    await desactivarEmergencia(supabase, d.citaId);

    const { error } = await supabase
      .from('citas')
      .update({ estado_manual: ESTADO_CANCELADA, motivo_cancelacion: d.motivo })
      .eq('id', d.citaId);
    if (error) {
      console.error('Error cancelando la cita:', error.message);
      return { ok: false, error: 'No se pudo cancelar la cita. Intenta de nuevo.' };
    }

    const otroId = cita.cliente_id === d.miId ? cita.proveedora_id : cita.cliente_id;

    // Aviso en el chat (cierra la conversación a la vista de las dos personas) y notificación.
    // Si alguno de los dos falla, la cita ya quedó cancelada; no se interrumpe nada.
    if (cita.chat_id) {
      await supabase.from('mensajes').insert({
        chat_id: cita.chat_id,
        remitente_id: d.miId,
        texto: `${d.miAlias} canceló la cita. Motivo: ${d.motivo}`,
        tipo: 'sistema',
      });
    }
    await supabase.from('notificaciones').insert({
      para_usuario_id: otroId,
      mensaje: `${d.miAlias} canceló la cita durante la alerta de emergencia. Motivo: ${d.motivo}.`,
      ruta: '/encuentro',
    });

    return { ok: true };
  } catch (err) {
    console.error('Error cancelando por emergencia:', err);
    return { ok: false, error: 'No se pudo cancelar la cita. Intenta de nuevo.' };
  }
}