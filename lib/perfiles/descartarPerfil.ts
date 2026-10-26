import type { SupabaseClient } from '@supabase/supabase-js';
import { MOTIVO_OTRO } from '@/lib/perfiles/motivosDescarte';

export type ResultadoDescartar = { ok: true } | { ok: false; error: string };

/**
 * Cuando una persona elimina a la otra y ya había un chat entre las dos:
 *  - El chat queda cerrado (solo lectura) para la persona eliminada, con el motivo a la vista.
 *  - Para quien eliminó, el chat desaparece de su lista.
 * El historial se conserva (Vela es una app de seguridad: sirve como registro).
 */
export async function cerrarChatPorEliminacion(
  supabase: SupabaseClient,
  p: {
    clienteId: string;
    proveedoraId: string;
    quienElimina: 'cliente' | 'proveedora';
    aliasQuienElimina: string;
    motivoVisible: string;
  },
): Promise<void> {
  const { data: chat } = await supabase
    .from('chats')
    .select('id')
    .eq('cliente_id', p.clienteId)
    .eq('proveedora_id', p.proveedoraId)
    .maybeSingle();
  if (!chat) return;

  const texto = `${p.aliasQuienElimina} eliminó este perfil. Motivo: ${p.motivoVisible}.`;

  const { error: msgError } = await supabase.from('mensajes').insert({
    chat_id: chat.id,
    remitente_id: null,
    tipo: 'sistema',
    texto,
    leido: true,
    leido_cliente: true,
    leido_proveedora: true,
  });
  if (msgError) console.error('Error enviando el motivo al chat:', msgError.message);

  const { error: chatError } = await supabase
    .from('chats')
    .update({
      requiere_nueva_solicitud: true,
      ...(p.quienElimina === 'cliente' ? { oculto_cliente: true } : { oculto_proveedora: true }),
    })
    .eq('id', chat.id);
  if (chatError) console.error('Error cerrando el chat:', chatError.message);

  await supabase.from('notificaciones').insert({
    para_usuario_id: p.quienElimina === 'cliente' ? p.proveedoraId : p.clienteId,
    mensaje: texto,
    chat_id: chat.id,
    ruta: `/chat/${chat.id}`,
  });
}

/**
 * El cliente elimina un perfil:
 *  - Se guarda en `bloqueos` (nunca más se le muestra). El motivo, y la nota si eligió "Otro",
 *    quedan ahí como respaldo interno de Vela.
 *  - Si ya había un chat entre los dos, se cierra y se le explica el motivo a la otra persona
 *    (sin la nota privada).
 */
export async function descartarPerfil(
  supabase: SupabaseClient,
  params: { miId: string; miAlias: string; perfilId: string; motivo: string; nota: string },
): Promise<ResultadoDescartar> {
  const { miId, miAlias, perfilId, motivo, nota } = params;
  const esOtro = motivo === MOTIVO_OTRO;
  const motivoInterno = esOtro ? `Otro: ${nota.trim()}` : motivo;

  const { error } = await supabase.from('bloqueos').upsert(
    { proveedora_id: perfilId, cliente_id: miId, motivo: motivoInterno },
    { onConflict: 'proveedora_id,cliente_id' },
  );
  if (error) {
    console.error('Error descartando perfil:', error.message, error.details, error.hint, error.code);
    return { ok: false, error: 'No se pudo eliminar el perfil. Intenta de nuevo.' };
  }

  await cerrarChatPorEliminacion(supabase, {
    clienteId: miId,
    proveedoraId: perfilId,
    quienElimina: 'cliente',
    aliasQuienElimina: miAlias,
    motivoVisible: esOtro ? 'otro motivo' : motivo,
  });

  return { ok: true };
}