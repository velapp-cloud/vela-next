import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// El filtro "in" de Supabase Realtime admite como máximo 100 valores.
const MAX_CHATS_ESCUCHADOS = 100;

/**
 * Total de chats que necesitan atención, para pintar el numerito rojo en el tab de Chat:
 * - chats con mensajes sin leer, y
 * - chats nuevos donde todavía nadie escribió (conversaciones por iniciar).
 *
 * El conteo lo hace la base de datos (función total_chats_atencion), así no se
 * descargan todos los mensajes. Solo escucha los cambios de MIS chats.
 * El segundo parámetro se conserva para no cambiar a quien llama a este hook.
 */
export function useTotalSinLeer(miId: string | undefined, _miRol?: 'cliente' | 'proveedora') {
  const [total, setTotal] = useState(0);
  const [idsChats, setIdsChats] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const revisar = useCallback(async () => {
    if (!miId) return;
    const supabase = createClient();

    const { data, error } = await supabase.rpc('total_chats_atencion');
    // Sin conexión: se conserva el número que ya se ve.
    if (error) return;
    setTotal(typeof data === 'number' ? data : 0);

    const { data: misChats, error: errorChats } = await supabase
      .from('chats')
      .select('id')
      .or(`cliente_id.eq.${miId},proveedora_id.eq.${miId}`)
      .order('creado_en', { ascending: false })
      .limit(MAX_CHATS_ESCUCHADOS);
    if (!errorChats) {
      setIdsChats((misChats ?? []).map((c: any) => c.id as string).sort().join(','));
    }
  }, [miId]);

  // Si llegan varios cambios seguidos, se revisa una sola vez.
  const programarRevision = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { revisar(); }, 300);
  }, [revisar]);

  // Chats míos: avisan cuando se crea, se cierra o se oculta uno.
  useEffect(() => {
    if (!miId) return;
    revisar();
    const supabase = createClient();
    const canal = supabase
      .channel(`badge-chats-${miId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chats', filter: `cliente_id=eq.${miId}` },
        programarRevision,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chats', filter: `proveedora_id=eq.${miId}` },
        programarRevision,
      )
      .subscribe();

    // Cuando vuelve el internet o se vuelve a la pestaña, se corrige solo.
    const alVolverConexion = () => revisar();
    const alVolverAVer = () => {
      if (document.visibilityState === 'visible') revisar();
    };
    window.addEventListener('online', alVolverConexion);
    document.addEventListener('visibilitychange', alVolverAVer);

    // Respaldo por si el tiempo real se cae sin avisar.
    const respaldo = setInterval(() => {
      if (typeof navigator === 'undefined' || navigator.onLine) revisar();
    }, 60_000);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(canal);
      window.removeEventListener('online', alVolverConexion);
      document.removeEventListener('visibilitychange', alVolverAVer);
      clearInterval(respaldo);
    };
  }, [miId, revisar, programarRevision]);

  // Mensajes de mis chats: cambian el número de "sin leer".
  useEffect(() => {
    if (!miId || !idsChats) return;
    const supabase = createClient();
    const canal = supabase
      .channel(`badge-mensajes-${miId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mensajes', filter: `chat_id=in.(${idsChats})` },
        programarRevision,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [miId, idsChats, programarRevision]);

  return total;
}