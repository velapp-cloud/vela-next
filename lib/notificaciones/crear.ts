/**
 * lib/notificaciones/crear.ts
 *
 * Punto UNICO para insertar notificaciones desde cualquier pantalla
 * (enviar solicitud, aceptar, rechazar, mensajes, etc). Con esto TODAS
 * quedan con una `ruta` explicita y la campanita (NotificacionesBell.tsx)
 * solo tiene que leerla.
 *
 * Uso:
 *   import { crearNotificacion } from '@/lib/notificaciones/crear';
 *   await crearNotificacion(supabase, {
 *     paraUsuarioId: proveedora.id,
 *     mensaje: 'Pedro te envio una solicitud de cita.',
 *     ruta: '/explorar',
 *   });
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type NuevaNotificacion = {
  /** A quien le llega (columna para_usuario_id). */
  paraUsuarioId: string;
  /** Texto que ve en la campanita. */
  mensaje: string;
  /**
   * A donde debe navegar al tocarla, ej:
   *  - '/explorar'              -> le llego una solicitud nueva
   *  - '/chat/<chatId>'         -> ya pueden hablar / mensaje nuevo
   *  - '/encuentro/<citaId>'    -> algo paso con una cita
   * Si se omite pero se pasa chatId, se arma sola como /chat/<chatId>
   * (compatibilidad hacia atras).
   */
  ruta?: string;
  /** Opcional, se sigue guardando por compatibilidad con datos viejos. */
  chatId?: string;
};

export async function crearNotificacion(
  supabase: SupabaseClient,
  n: NuevaNotificacion,
) {
  const ruta = n.ruta ?? (n.chatId ? `/chat/${n.chatId}` : null);

  const { error } = await supabase.from('notificaciones').insert({
    para_usuario_id: n.paraUsuarioId,
    mensaje: n.mensaje,
    chat_id: n.chatId ?? null,
    ruta,
    leida: false,
  });

  if (error) {
    console.error('No se pudo crear la notificacion:', error.message);
  }
}