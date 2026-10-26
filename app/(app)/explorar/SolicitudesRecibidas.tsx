'use client';

/**
 * app/(app)/explorar/SolicitudesRecibidas.tsx
 *
 * Vista de la proveedora en Explorar: lista de solicitudes de citas.
 * Al Aceptar: crea el chat, crea la cita en `citas` (para que aparezca
 * de una vez en Encuentro para ambos), notifica al cliente con
 * ruta=/chat/<id>, y manda a la proveedora directo a su chat.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { obtenerPerfilesRicos } from '@/lib/perfiles/datosRicos';
import { crearNotificacion } from '@/lib/notificaciones/crear';
import { confirmarCita } from '@/lib/citas/confirmar';
import SolicitudCard, { type SolicitudRecibida } from '@/components/SolicitudCard';

type SolicitudFila = {
  id: string;
  cliente_id: string;
  proveedora_id: string;
  fecha: string;
  hora: string;
  duracion: string;
  lugar: string;
  tipo: string;
  mensaje: string;
  creado_en: string;
};

export default function SolicitudesRecibidas() {
  const supabase = createClient();
  const router = useRouter();
  const { perfil } = useSession();
  const [solicitudes, setSolicitudes] = useState<SolicitudRecibida[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!perfil?.id) return;
    setCargando(true);

    const { data: filas, error } = await supabase
      .from('solicitudes')
      .select('id, cliente_id, proveedora_id, fecha, hora, duracion, lugar, tipo, mensaje, creado_en')
      .eq('proveedora_id', perfil.id)
      .order('creado_en', { ascending: false });

    if (error) {
      console.error('Error cargando solicitudes:', error.message);
      setSolicitudes([]);
      setCargando(false);
      return;
    }

    const filasOk = (filas ?? []) as SolicitudFila[];
    const clienteIds = [...new Set(filasOk.map((f) => f.cliente_id))];
    const ricos = await obtenerPerfilesRicos(supabase, clienteIds);

    const armadas: SolicitudRecibida[] = filasOk
      .filter((f) => ricos[f.cliente_id])
      .map((f) => ({
        id: f.id,
        fecha: f.fecha,
        hora: f.hora,
        duracion: f.duracion,
        lugar: f.lugar,
        tipo: f.tipo,
        mensaje: f.mensaje,
        creado_en: f.creado_en,
        cliente: { ...ricos[f.cliente_id], id: f.cliente_id },
      }));

    setSolicitudes(armadas);
    setCargando(false);
  }, [perfil?.id, supabase]);

useEffect(() => {
  if (!perfil?.id) return;

  const canal = supabase
    .channel(`solicitudes-recibidas-${perfil.id}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'solicitudes', filter: `proveedora_id=eq.${perfil.id}` },
      async (payload) => {
        const fila = payload.new as SolicitudFila;
        const ricos = await obtenerPerfilesRicos(supabase, [fila.cliente_id]);
        if (!ricos[fila.cliente_id]) return;
        setSolicitudes((prev) => [
          {
            id: fila.id,
            fecha: fila.fecha,
            hora: fila.hora,
            duracion: fila.duracion,
            lugar: fila.lugar,
            tipo: fila.tipo,
            mensaje: fila.mensaje,
            creado_en: fila.creado_en,
            cliente: { ...ricos[fila.cliente_id], id: fila.cliente_id },
          },
          ...prev,
        ]);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(canal);
  };
}, [perfil?.id, supabase]);

  const aceptar = async (solicitudId: string) => {
    if (!perfil?.id) return;
    const solicitud = solicitudes.find((s) => s.id === solicitudId);
    if (!solicitud) return;

    setProcesandoId(solicitudId);
    try {
      const { data: chatNuevo, error: errChat } = await supabase
        .from('chats')
        .insert({
          cliente_id: solicitud.cliente.id,
          proveedora_id: perfil.id,
          ficha_fecha: solicitud.fecha,
          ficha_hora: solicitud.hora,
          ficha_duracion: solicitud.duracion,
          ficha_lugar: solicitud.lugar,
          ficha_tipo: solicitud.tipo,
          ficha_mensaje: solicitud.mensaje,
          intentos_reagendado: 0,
          bloqueado: false,
          cliente_confirmo: false,
          proveedora_confirmo: false,
          requiere_nueva_solicitud: false,
        })
        .select('id')
        .single();

      if (errChat || !chatNuevo) {
        console.error('Error creando el chat:', errChat?.message);
        return;
      }

      await supabase.from('mensajes').insert({
        chat_id: chatNuevo.id,
        remitente_id: null,
        tipo: 'sistema',
        texto: 'Solicitud aceptada · ya pueden coordinar',
        leido: true,
      });

      // Crea la cita de una vez, para que aparezca en Encuentro para
      // ambos perfiles sin depender de un paso extra dentro del chat.
      await confirmarCita(supabase, {
        chatId: chatNuevo.id,
        clienteId: solicitud.cliente.id,
        proveedoraId: perfil.id,
        fichaFecha: solicitud.fecha,
        fichaHora: solicitud.hora,
        fichaDuracion: solicitud.duracion,
        fichaLugar: solicitud.lugar,
        fichaTipo: solicitud.tipo,
        fichaMensaje: solicitud.mensaje,
      });

      await supabase.from('solicitudes').delete().eq('id', solicitudId);

      await crearNotificacion(supabase, {
        paraUsuarioId: solicitud.cliente.id,
        mensaje: `${perfil.alias} acepto tu solicitud. ¡Ya pueden hablar!`,
        ruta: `/chat/${chatNuevo.id}`,
        chatId: chatNuevo.id,
      });

      setSolicitudes((prev) => prev.filter((s) => s.id !== solicitudId));
      router.push(`/chat/${chatNuevo.id}`);
    } finally {
      setProcesandoId(null);
    }
  };

  const rechazar = async (solicitudId: string) => {
    if (!perfil?.id) return;
    const solicitud = solicitudes.find((s) => s.id === solicitudId);
    if (!solicitud) return;

    setProcesandoId(solicitudId);
    try {
      await supabase.from('solicitudes').delete().eq('id', solicitudId);

      await supabase.from('bloqueos').insert({
        proveedora_id: perfil.id,
        cliente_id: solicitud.cliente.id,
      });

      await crearNotificacion(supabase, {
        paraUsuarioId: solicitud.cliente.id,
        mensaje: `${perfil.alias} rechazo tu solicitud.`,
        ruta: '/explorar',
      });

      setSolicitudes((prev) => prev.filter((s) => s.id !== solicitudId));
    } finally {
      setProcesandoId(null);
    }
  };

  if (cargando) {
    return <p className="py-10 text-center text-textDim">Cargando solicitudes...</p>;
  }

  if (solicitudes.length === 0) {
    return (
      <p className="py-10 text-center text-textDim">
        No tienes solicitudes pendientes por ahora.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {solicitudes.map((s) => (
        <SolicitudCard
          key={s.id}
          solicitud={s}
          onAceptar={aceptar}
          onRechazar={rechazar}
          procesando={procesandoId === s.id}
        />
      ))}
    </div>
  );
}