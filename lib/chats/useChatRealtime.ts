/**
 * lib/chats/useChatsRealtime.ts
 *
 * Hook para app/(app)/chat/page.tsx (la lista de chats). Hace que un
 * chat nuevo aparezca en la lista AL INSTANTE para las dos personas,
 * sin recargar la pagina.
 *
 * Uso en app/(app)/chat/page.tsx:
 *
 *   useChatsRealtime(perfil?.id, () => cargarChats());
 */

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useChatsRealtime(miId: string | undefined, onCambio: () => void) {
  useEffect(() => {
    if (!miId) return;
    const supabase = createClient();

    const canal = supabase
      .channel(`chats-lista-${miId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chats', filter: `cliente_id=eq.${miId}` },
        () => onCambio(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chats', filter: `proveedora_id=eq.${miId}` },
        () => onCambio(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miId]);
}