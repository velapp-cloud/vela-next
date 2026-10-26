/**
 * lib/solicitudes/enviar.ts
 *
 * Helper para enviar una solicitud de cita (usado desde
 * app/(app)/perfil-detalle/[id]/page.tsx, en el boton "Enviar
 * solicitud"). Centraliza el insert + la notificacion para que la
 * notificacion SIEMPRE lleve una `ruta` (asi la campanita de la
 * proveedora sabe llevarla a /explorar al tocarla).
 *
 * Integracion en perfil-detalle/[id]/page.tsx: donde hoy tengas el
 * insert directo a `solicitudes` dentro del onSubmit del formulario de
 * agendar cita, reemplazalo por una llamada a esta funcion:
 *
 *   import { enviarSolicitud } from '@/lib/solicitudes/enviar';
 *   ...
 *   const { error } = await enviarSolicitud(supabase, {
 *     clienteId: perfil.id,
 *     proveedoraId: params.id,
 *     clienteAlias: perfil.alias,
 *     fecha, hora, duracion, lugar, tipo, mensaje,
 *   });
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { crearNotificacion } from '@/lib/notificaciones/crear';

export type DatosSolicitud = {
  clienteId: string;
  proveedoraId: string;
  clienteAlias: string;
  fecha: string;
  hora: string;
  duracion: string;
  lugar: string;
  tipo: string;
  mensaje: string;
};

export async function enviarSolicitud(supabase: SupabaseClient, datos: DatosSolicitud) {
  const { error } = await supabase.from('solicitudes').insert({
    cliente_id: datos.clienteId,
    proveedora_id: datos.proveedoraId,
    fecha: datos.fecha,
    hora: datos.hora,
    duracion: datos.duracion,
    lugar: datos.lugar,
    tipo: datos.tipo,
    mensaje: datos.mensaje,
  });

  if (error) return { error };

  await crearNotificacion(supabase, {
    paraUsuarioId: datos.proveedoraId,
    mensaje: `${datos.clienteAlias} te envio una solicitud de cita.`,
    ruta: '/explorar',
  });

  return { error: null };
}