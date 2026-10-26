'use client';

/**
 * components/ToastNotificaciones.tsx
 *
 * Ventana emergente (toast) que aparece arriba a la derecha cada vez
 * que llega una notificacion nueva, ademas de sumarse a la campanita.
 * Se autodesaparece a los 6 segundos, se puede cerrar a mano, y si le
 * das clic se marca como leida y navega a la misma `ruta` que usa la campanita.
 *
 * Se monta UNA sola vez en app/(app)/layout.tsx, asi funciona en todos
 * los modulos sin importar en cual estes.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';

type ToastNoti = {
  id: string;
  mensaje: string;
  ruta: string | null;
  chat_id: string | null;
};

export default function ToastNotificaciones() {
  const supabase = createClient();
  const router = useRouter();
  const { perfil } = useSession();
  const [toasts, setToasts] = useState<ToastNoti[]>([]);

  useEffect(() => {
    if (!perfil?.id) return;

    const canal = supabase
      .channel(`toast-notificaciones-${perfil.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificaciones',
          filter: `para_usuario_id=eq.${perfil.id}`,
        },
        (payload) => {
          const n = payload.new as ToastNoti;
          setToasts((prev) => [...prev, n]);
          setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== n.id));
          }, 6000);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [perfil?.id, supabase]);

  const abrir = async (t: ToastNoti) => {
    setToasts((prev) => prev.filter((x) => x.id !== t.id));
    // Se marca leída de inmediato: la campanita baja en tiempo real.
    supabase.from('notificaciones').update({ leida: true }).eq('id', t.id).then(() => {});
    const destino = t.ruta ?? (t.chat_id ? `/chat/${t.chat_id}` : null);
    if (destino) router.push(destino);
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => abrir(t)}
          className="w-80 max-w-[88vw] rounded-2xl border border-vela-line bg-vela-surface p-4 text-left shadow-2xl animate-in slide-in-from-top-2"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-vela-text">{t.mensaje}</p>
            <span
              onClick={(e) => {
                e.stopPropagation();
                setToasts((prev) => prev.filter((x) => x.id !== t.id));
              }}
              className="flex h-8 w-8 -mr-2 -mt-1 flex-shrink-0 items-center justify-center text-vela-text-faint"
            >
              ✕
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}