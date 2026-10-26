import type { SupabaseClient } from '@supabase/supabase-js';

/** Marca como leidos, para mi rol, todos los mensajes de ese chat que
 * no mande yo. Se llama al entrar al chat y cuando llega un mensaje
 * nuevo mientras ya lo tengo abierto. */
export async function marcarChatLeido(supabase: SupabaseClient, chatId: string, miId: string, miRol: 'cliente' | 'proveedora') {
  const columna = miRol === 'cliente' ? 'leido_cliente' : 'leido_proveedora';
  await supabase
    .from('mensajes')
    .update({ [columna]: true })
    .eq('chat_id', chatId)
    .neq('remitente_id', miId);
}