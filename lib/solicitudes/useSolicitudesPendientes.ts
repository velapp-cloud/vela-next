import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export const EVENTO_SOLICITUDES = 'vela:solicitudes-cambio';

/** Avisa a la barra de pestañas que las solicitudes cambiaron (aceptar, rechazar...) para actualizar el punto al instante. */
export function avisarCambioSolicitudes() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_SOLICITUDES));
}

/**
 * Cantidad de solicitudes recibidas que todavía no se han respondido.
 * Sirve para pintar el punto rojo en la pestaña "Vela" (Explorar).
 * Si la persona no recibe solicitudes (cliente), el número siempre es 0.
 *
 * Se actualiza en vivo por tres caminos: cambios en solicitudes, chats y bloqueos, y también
 * cuando llega una notificación nueva (la solicitud siempre trae la suya).
 */
export function useSolicitudesPendientes(miId: string | undefined, pantalla?: string) {
  const [total, setTotal] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const contar = useCallback(async () => {
    if (!miId) return;
    const supabase = createClient();
    const { count, error } = await supabase
      .from('solicitudes')
      .select('id', { count: 'exact', head: true })
      .eq('proveedora_id', miId);
    // Sin conexión: se conserva el número que ya se ve.
    if (error) return;
    setTotal(count ?? 0);
  }, [miId]);

  // Si llegan varios cambios seguidos, se cuenta una sola vez.
  const programar = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { contar(); }, 300);
  }, [contar]);

  // Cada vez que se cambia de pantalla, se vuelve a contar.
  useEffect(() => {
    contar();
  }, [contar, pantalla]);

  useEffect(() => {
    if (!miId) {
      setTotal(0);
      return;
    }
    const supabase = createClient();
    const canal = supabase
      .channel(`badge-solicitudes-${miId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'solicitudes', filter: `proveedora_id=eq.${miId}` },
        programar,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chats', filter: `proveedora_id=eq.${miId}` },
        programar,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bloqueos', filter: `proveedora_id=eq.${miId}` },
        programar,
      )
      // Segundo camino: cada solicitud nueva trae una notificación para esta persona.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `para_usuario_id=eq.${miId}` },
        programar,
      )
      .subscribe();

    const alVolverConexion = () => { contar(); };
    const alVolverAVer = () => {
      if (document.visibilityState === 'visible') contar();
    };
    window.addEventListener('online', alVolverConexion);
    window.addEventListener(EVENTO_SOLICITUDES, programar);
    document.addEventListener('visibilitychange', alVolverAVer);

    // Respaldo por si una solicitud se cancela y el tiempo real no avisa.
    const respaldo = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) contar();
    }, 60_000);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(canal);
      window.removeEventListener('online', alVolverConexion);
      window.removeEventListener(EVENTO_SOLICITUDES, programar);
      document.removeEventListener('visibilitychange', alVolverAVer);
      clearInterval(respaldo);
    };
  }, [miId, contar, programar]);

  return total;
}