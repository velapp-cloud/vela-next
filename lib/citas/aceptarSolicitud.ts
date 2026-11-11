import type { SupabaseClient } from '@supabase/supabase-js';
import { confirmarCita, combinarFechaHora, duracionAHoras } from '@/lib/citas/confirmar';

export type SolicitudParaAceptar = {
  id: string;
  cliente_id: string;
  fecha: string;
  hora: string;
  duracion: string;
  lugar: string;
  tipo: string;
  mensaje: string;
};

export type ResultadoAceptar =
  | { ok: true; chatId: string | null }
  | { ok: false; error: string; choque?: boolean };

const AVISO_SEPARACION =
  'Para agendar otro debe haber al menos 20 minutos de diferencia entre una cita y otra.';

/**
 * Aceptar una solicitud = abrir el chat y dejar la cita lista para revisar.
 * NO confirma el encuentro: cada persona lo revisa y confirma después, desde el chat.
 * Antes de aceptar se revisa que no haya choque de horario.
 */
export async function aceptarSolicitud(
  supabase: SupabaseClient,
  s: SolicitudParaAceptar,
  miAlias: string,
): Promise<ResultadoAceptar> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false, error: 'Tu sesión expiró. Vuelve a entrar.' };

  // 1) ¿Hay choque de horario?
  const { data: rev, error: revError } = await supabase.rpc('revisar_choque_solicitud', {
    p_cliente: s.cliente_id,
    p_inicio: combinarFechaHora(s.fecha, s.hora),
    p_horas: duracionAHoras(s.duracion),
  });
  if (revError) {
    console.error('Error revisando choque de horario:', revError.message, revError.details, revError.hint, revError.code);
    return { ok: false, error: 'No se pudo revisar tu agenda. Intenta de nuevo.' };
  }
  if (rev?.choque) {
    return {
      ok: false,
      choque: true,
      error:
        rev.quien === 'proveedora'
          ? `Ya tienes un evento reservado a esa hora. No puedes aceptar esta solicitud: recházala o pide otro horario. ${AVISO_SEPARACION}`
          : `Este perfil ya tiene un evento reservado a esa hora. No puedes aceptar esta solicitud. ${AVISO_SEPARACION}`,
    };
  }

  // 2) Chat
  const { data: chatExistente, error: buscarError } = await supabase
    .from('chats')
    .select('id')
    .eq('cliente_id', s.cliente_id)
    .eq('proveedora_id', userId)
    .maybeSingle();

  if (buscarError) {
    console.error('Error buscando chat existente:', buscarError.message, buscarError.details, buscarError.hint, buscarError.code);
    return { ok: false, error: 'No se pudo aceptar la solicitud. Intenta de nuevo.' };
  }

  let errorChat = null;
  let chatId: string | null = chatExistente?.id ?? null;
  if (chatExistente) {
    // Chat reabierto: vuelve a aparecer en la lista de las dos personas.
    const { error } = await supabase.from('chats').update({
      requiere_nueva_solicitud: false,
      oculto_cliente: false,
      oculto_proveedora: false,
      ficha_fecha: s.fecha, ficha_hora: s.hora, ficha_duracion: s.duracion,
      ficha_lugar: s.lugar, ficha_tipo: s.tipo, ficha_mensaje: s.mensaje,
    }).eq('id', chatExistente.id);
    errorChat = error;
  } else {
    const { data: nuevoChat, error } = await supabase.from('chats').insert({
      cliente_id: s.cliente_id, proveedora_id: userId,
      requiere_nueva_solicitud: false,
      oculto_cliente: false,
      oculto_proveedora: false,
      ficha_fecha: s.fecha, ficha_hora: s.hora, ficha_duracion: s.duracion,
      ficha_lugar: s.lugar, ficha_tipo: s.tipo, ficha_mensaje: s.mensaje,
    }).select().single();
    errorChat = error;
    chatId = nuevoChat?.id ?? null;
  }

  if (errorChat) {
    console.error('Error creando/actualizando el chat:', errorChat.message, errorChat.details, errorChat.hint, errorChat.code);
    return { ok: false, error: 'No se pudo crear el chat. Intenta de nuevo.' };
  }

  // 3) Cita pendiente de confirmar (nadie confirma automáticamente)
  if (chatId) {
    try {
      await confirmarCita(supabase, {
        chatId,
        clienteId: s.cliente_id,
        proveedoraId: userId,
        fichaFecha: s.fecha,
        fichaHora: s.hora,
        fichaDuracion: s.duracion,
        fichaLugar: s.lugar,
        fichaTipo: s.tipo,
        fichaMensaje: s.mensaje,
      });
    } catch (citaErr: any) {
      console.error('Error creando la cita (confirmarCita):', citaErr?.message ?? citaErr);
    }
  }

  const { error: borrarError } = await supabase.from('solicitudes').delete().eq('id', s.id);
  if (borrarError) {
    console.error('Error eliminando la solicitud:', borrarError.message, borrarError.details, borrarError.hint, borrarError.code);
  }

  await supabase.from('notificaciones').insert({
    para_usuario_id: s.cliente_id,
    mensaje: `${miAlias} aceptó tu solicitud de encuentro. Ya tienen un chat para coordinar.`,
    chat_id: chatId,
    ruta: chatId ? `/chat/${chatId}` : '/explorar',
  });

  return { ok: true, chatId };
}