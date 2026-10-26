import type { SupabaseClient } from '@supabase/supabase-js';
import { ESTADO_CANCELADA } from '@/lib/citas/estados';

/**
 * Cancela la cita con un motivo y cierra el chat: la única forma de volver a
 * contactarse es que el cliente envíe una solicitud nueva. NO crea bloqueo.
 */
export async function cancelarCitaConMotivo(
  supabase: SupabaseClient,
  params: { citaId: string; chatId: string; miId: string; otroId: string; miAlias: string; motivo: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { citaId, chatId, miId, otroId, miAlias, motivo } = params;

  const { error: citaError } = await supabase.from('citas').update({
    estado_manual: ESTADO_CANCELADA,
    cancelado_por: miId,
    motivo_cancelacion: motivo,
    cliente_confirmo: false,
    proveedora_confirmo: false,
  }).eq('id', citaId);

  if (citaError) {
    console.error('Error cancelando la cita:', citaError.message, citaError.details, citaError.hint, citaError.code);
    return { ok: false, error: 'No se pudo cancelar la cita. Intenta de nuevo.' };
  }

  const { error: chatError } = await supabase.from('chats').update({ requiere_nueva_solicitud: true }).eq('id', chatId);
  if (chatError) console.error('Error cerrando el chat:', chatError.message);

  const texto = `${miAlias} canceló la cita. Motivo: ${motivo}`;

  const { error: msgError } = await supabase.from('mensajes').insert({
    chat_id: chatId,
    remitente_id: null,
    tipo: 'sistema',
    texto,
    leido: true,
    leido_cliente: true,
    leido_proveedora: true,
  });
  if (msgError) console.error('Error enviando el motivo al chat:', msgError.message);

  await supabase.from('notificaciones').insert({
    para_usuario_id: otroId,
    mensaje: texto,
    chat_id: chatId,
    ruta: `/chat/${chatId}`,
  });

  return { ok: true };
}