'use client';

/**
 * components/ToastMensajes.tsx
 *
 * Ventana emergente cuando llega un mensaje nuevo en cualquiera de tus
 * chats, SIN pasar por la tabla `notificaciones` (para que la campanita
 * quede limpia, solo con solicitudes aceptadas). No se muestra si ya
 * tienes esa conversacion abierta (ver chatAbierto.ts) — igual que
 * WhatsApp no te banner-ea un chat que ya estas viendo.
 *
 * Solo escucha los mensajes de TUS chats (filtro por chat), no los de
 * toda la app.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { getChatAbierto } from '@/lib/chats/chatAbierto';

type ToastMsg = { id: string; chatId: string; alias: string; texto: string };

// El filtro "in" de Supabase Realtime admite como máximo 100 valores.
const MAX_CHATS_ESCUCHADOS = 100;

export default function ToastMensajes() {
  const supabase = createClient();
  const router = useRouter();
  const { perfil } = useSession();
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  // Ids de mis chats (separados por coma): cuando cambian, se vuelve a suscribir.
  const [idsChats, setIdsChats] = useState('');
  const misChatsRef = useRef<Record<string, { otroId: string; otroAlias: string }>>({});

  const cargarMisChats = useCallback(async () => {
    if (!perfil?.id) return;
    const { data: chats, error } = await supabase
      .from('chats')
      .select('id, cliente_id, proveedora_id')
      .or(`cliente_id.eq.${perfil.id},proveedora_id.eq.${perfil.id}`)
      .order('creado_en', { ascending: false })
      .limit(MAX_CHATS_ESCUCHADOS);
    if (error) return;

    const otrasIds = (chats ?? []).map((c) => (c.cliente_id === perfil.id ? c.proveedora_id : c.cliente_id));
    const { data: personas } = otrasIds.length
      ? await supabase.from('perfiles_publicos').select('id, alias').in('id', otrasIds)
      : { data: [] };
    const aliasPorId = Object.fromEntries((personas ?? []).map((p) => [p.id, p.alias]));

    const mapa: Record<string, { otroId: string; otroAlias: string }> = {};
    for (const c of chats ?? []) {
      const otroId = c.cliente_id === perfil.id ? c.proveedora_id : c.cliente_id;
      mapa[c.id] = { otroId, otroAlias: aliasPorId[otroId] ?? 'Alguien' };
    }
    misChatsRef.current = mapa;
    setIdsChats(Object.keys(mapa).sort().join(','));
  }, [perfil?.id, supabase]);

  // 1) Mis chats, y avisar cuando aparece uno nuevo.
  useEffect(() => {
    if (!perfil?.id) return;
    cargarMisChats();

    const canalChats = supabase
      .channel(`toast-chats-${perfil.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chats', filter: `cliente_id=eq.${perfil.id}` },
        () => cargarMisChats(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chats', filter: `proveedora_id=eq.${perfil.id}` },
        () => cargarMisChats(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalChats);
    };
  }, [perfil?.id, supabase, cargarMisChats]);

  // 2) Mensajes nuevos, solo de mis chats.
  useEffect(() => {
    if (!perfil?.id || !idsChats) return;

    const canalMensajes = supabase
      .channel(`toast-mensajes-${perfil.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `chat_id=in.(${idsChats})` },
        (payload) => {
          const m = payload.new as { id: string; chat_id: string; remitente_id: string | null; texto: string };
          if (!m.remitente_id || m.remitente_id === perfil.id) return; // mio o de sistema
          const info = misChatsRef.current[m.chat_id];
          if (!info) return; // no es un chat mio
          if (getChatAbierto() === m.chat_id) return; // ya lo tiene abierto

          setToasts((prev) => [...prev, { id: m.id, chatId: m.chat_id, alias: info.otroAlias, texto: m.texto }]);
          setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== m.id)), 6000);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalMensajes);
    };
  }, [perfil?.id, idsChats, supabase]);

  const abrir = (t: ToastMsg) => {
    setToasts((prev) => prev.filter((x) => x.id !== t.id));
    router.push(`/chat/${t.chatId}`);
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-20 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => abrir(t)}
          className="w-80 max-w-[88vw] rounded-2xl border border-vela-line bg-vela-surface p-4 text-left shadow-2xl"
        >
          <p className="text-base font-bold text-vela-text">{t.alias}</p>
          <p className="mt-0.5 truncate text-sm text-vela-text-dim">{t.texto}</p>
        </button>
      ))}
    </div>
  );
}