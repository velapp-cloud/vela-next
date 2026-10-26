'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';

export default function NotificacionesBell() {
  const supabase = createClient();
  const router = useRouter();
  const { perfil } = useSession();
  const [sinLeer, setSinLeer] = useState(0);

  const cargarContador = useCallback(async () => {
    if (!perfil?.id) return;
    const { count, error } = await supabase
      .from('notificaciones')
      .select('*', { count: 'exact', head: true })
      .eq('para_usuario_id', perfil.id)
      .eq('leida', false);
    // Sin conexión: se conserva el número que ya se ve.
    if (error) return;
    setSinLeer(count ?? 0);
  }, [perfil?.id, supabase]);

  useEffect(() => {
    if (!perfil?.id) return;
    cargarContador();

    const canal = supabase
      .channel(`notificaciones-bell-${perfil.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notificaciones', filter: `para_usuario_id=eq.${perfil.id}` },
        () => cargarContador(),
      )
      .subscribe();

    // Al volver el internet o la pestaña, se corrige solo.
    const alVolverConexion = () => cargarContador();
    const alVolverAVer = () => {
      if (document.visibilityState === 'visible') cargarContador();
    };
    window.addEventListener('online', alVolverConexion);
    document.addEventListener('visibilitychange', alVolverAVer);

    return () => {
      supabase.removeChannel(canal);
      window.removeEventListener('online', alVolverConexion);
      document.removeEventListener('visibilitychange', alVolverAVer);
    };
  }, [perfil?.id, supabase, cargarContador]);

  return (
    <button
      onClick={() => router.push('/notificaciones')}
      className="relative flex h-11 w-11 items-center justify-center rounded-full bg-vela-surface-2 border border-vela-line text-vela-text"
      aria-label="Notificaciones"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {sinLeer > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-vela-public px-1 text-[11px] font-bold text-white">
          {sinLeer > 9 ? '9+' : sinLeer}
        </span>
      )}
    </button>
  );
}