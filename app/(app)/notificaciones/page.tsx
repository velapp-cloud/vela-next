'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';

type Notificacion = {
  id: string;
  mensaje: string;
  leida: boolean;
  creado_en: string;
  chat_id: string | null;
  ruta: string | null;
};

type Filtro = 'no_leidas' | 'leidas' | 'todas';

export default function NotificacionesPage() {
  const supabase = createClient();
  const router = useRouter();
  const { perfil } = useSession();

  const [notis, setNotis] = useState<Notificacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('no_leidas');
  // Solo la primera carga muestra "Cargando..."; las siguientes se hacen en silencio.
  const primeraCarga = useRef(true);

  const cargar = useCallback(async () => {
    if (!perfil?.id) return;
    if (primeraCarga.current) setCargando(true);
    const { data, error } = await supabase
      .from('notificaciones')
      .select('id, mensaje, leida, creado_en, chat_id, ruta')
      .eq('para_usuario_id', perfil.id)
      .order('creado_en', { ascending: false })
      .limit(100);
    // Sin conexión: se conserva lo que ya se ve.
    if (!error) setNotis(data ?? []);
    primeraCarga.current = false;
    setCargando(false);
  }, [perfil?.id, supabase]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!perfil?.id) return;
    const canal = supabase
      .channel(`notificaciones-pagina-${perfil.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `para_usuario_id=eq.${perfil.id}` },
        (payload) => {
          setNotis((prev) => [payload.new as Notificacion, ...prev]);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notificaciones', filter: `para_usuario_id=eq.${perfil.id}` },
        (payload) => {
          const n = payload.new as Notificacion;
          setNotis((prev) => prev.map((x) => (x.id === n.id ? { ...x, leida: n.leida } : x)));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [perfil?.id, supabase]);

  // Al volver el internet o la pestaña se trae lo que faltó, sin recargar la página.
  useEffect(() => {
    const alVolverConexion = () => cargar();
    const alVolverAVer = () => {
      if (document.visibilityState === 'visible') cargar();
    };
    window.addEventListener('online', alVolverConexion);
    document.addEventListener('visibilitychange', alVolverAVer);
    return () => {
      window.removeEventListener('online', alVolverConexion);
      document.removeEventListener('visibilitychange', alVolverAVer);
    };
  }, [cargar]);

  const destinoDe = (n: Notificacion): string | null => {
    if (n.ruta) return n.ruta;
    if (n.chat_id) return `/chat/${n.chat_id}`;
    return null;
  };

  async function abrirNotificacion(n: Notificacion) {
    if (!n.leida) {
      await supabase.from('notificaciones').update({ leida: true }).eq('id', n.id);
      setNotis((prev) => prev.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
    }
    const destino = destinoDe(n);
    if (destino) router.push(destino);
  }

  async function marcarTodasLeidas() {
    if (!perfil?.id) return;
    await supabase
      .from('notificaciones')
      .update({ leida: true })
      .eq('para_usuario_id', perfil.id)
      .eq('leida', false);
    setNotis((prev) => prev.map((n) => ({ ...n, leida: true })));
  }

  const filtradas = notis.filter((n) => {
    if (filtro === 'no_leidas') return !n.leida;
    if (filtro === 'leidas') return n.leida;
    return true;
  });

  const sinLeerTotal = notis.filter((n) => !n.leida).length;

  return (
    <main className="flex-1 px-6 py-6 max-w-md mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[28px] leading-tight font-bold text-vela-text">Notificaciones</h1>
        {sinLeerTotal > 0 && (
          <button onClick={marcarTodasLeidas} className="min-h-11 text-sm font-semibold text-vela-public">
            Marcar todas leídas
          </button>
        )}
      </div>

      <div className="flex gap-1 bg-vela-surface-2 rounded-2xl p-1 mb-4">
        <button
          onClick={() => setFiltro('no_leidas')}
          className={`flex-1 h-11 rounded-xl text-sm font-semibold ${filtro === 'no_leidas' ? 'bg-vela-public text-white' : 'text-vela-text-faint'}`}
        >
          No leídas{sinLeerTotal > 0 ? ` (${sinLeerTotal})` : ''}
        </button>
        <button
          onClick={() => setFiltro('leidas')}
          className={`flex-1 h-11 rounded-xl text-sm font-semibold ${filtro === 'leidas' ? 'bg-vela-public text-white' : 'text-vela-text-faint'}`}
        >
          Leídas
        </button>
        <button
          onClick={() => setFiltro('todas')}
          className={`flex-1 h-11 rounded-xl text-sm font-semibold ${filtro === 'todas' ? 'bg-vela-public text-white' : 'text-vela-text-faint'}`}
        >
          Todas
        </button>
      </div>

      {cargando ? (
        <p className="text-sm text-vela-text-faint text-center py-8">Cargando...</p>
      ) : filtradas.length === 0 ? (
        <p className="text-base text-vela-text-faint text-center py-8">
          {filtro === 'no_leidas' ? 'No tienes notificaciones sin leer.' : filtro === 'leidas' ? 'No tienes notificaciones leídas.' : 'No tienes notificaciones todavía.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtradas.map((n) => (
            <button
              key={n.id}
              onClick={() => abrirNotificacion(n)}
              className={`text-left rounded-2xl border p-4 transition-colors ${
                n.leida ? 'bg-vela-surface border-vela-line' : 'bg-vela-public-soft border-vela-public/40'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {!n.leida && <span className="mt-1.5 w-2.5 h-2.5 rounded-full bg-vela-public flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={`text-base ${n.leida ? 'text-vela-text-dim' : 'text-vela-text font-semibold'}`}>{n.mensaje}</p>
                  <p className="text-xs text-vela-text-faint mt-1">
                    {new Date(n.creado_en).toLocaleString('es-SV', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}