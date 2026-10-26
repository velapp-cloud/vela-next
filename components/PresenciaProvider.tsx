'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';

const PresenciaContext = createContext<Set<string>>(new Set());

// Cada contacto es un canal; Supabase admite 100 canales por conexión
// y la app usa algunos más para notificaciones y mensajes.
const MAX_CONTACTOS = 60;

/**
 * Presencia ("Activo" / "Sin conexión").
 *
 * Antes todas las personas compartían UN canal: cada entrada o salida se
 * avisaba a todo el mundo. Ahora cada persona tiene su propio canal donde
 * solo ella se anuncia, y únicamente la escuchan quienes tienen un chat con
 * ella. Así el tráfico crece con la cantidad de chats, no con el cuadrado de
 * las personas conectadas.
 */
export function PresenciaProvider({ children }: { children: React.ReactNode }) {
  const { perfil } = useSession();
  const [enLinea, setEnLinea] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!perfil?.id) {
      setEnLinea(new Set());
      return;
    }
    const miId = perfil.id;
    const supabase = createClient();
    let cerrado = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const escuchando = new Map<string, RealtimeChannel>();

    // 1) Mi propio canal: aquí solo yo me anuncio.
    const mio = supabase.channel(`presencia-${miId}`, {
      config: { presence: { key: miId } },
    });
    mio
      .on('presence', { event: 'sync' }, () => {})
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await mio.track({ desde: new Date().toISOString() });
        }
      });

    function marcar(id: string, conectado: boolean) {
      setEnLinea((prev) => {
        if (prev.has(id) === conectado) return prev;
        const nuevo = new Set(prev);
        if (conectado) nuevo.add(id);
        else nuevo.delete(id);
        return nuevo;
      });
    }

    // 2) Escucho el canal de cada persona con la que tengo un chat.
    function escuchar(otroId: string) {
      if (escuchando.has(otroId)) return;
      const canal = supabase.channel(`presencia-${otroId}`);
      canal
        .on('presence', { event: 'sync' }, () => {
          marcar(otroId, Object.keys(canal.presenceState()).length > 0);
        })
        .subscribe();
      escuchando.set(otroId, canal);
    }

    function dejarDeEscuchar(otroId: string) {
      const canal = escuchando.get(otroId);
      if (canal) supabase.removeChannel(canal);
      escuchando.delete(otroId);
      marcar(otroId, false);
    }

    async function sincronizarContactos() {
      const { data, error } = await supabase
        .from('chats')
        .select('cliente_id, proveedora_id')
        .or(`cliente_id.eq.${miId},proveedora_id.eq.${miId}`)
        .order('creado_en', { ascending: false })
        .limit(MAX_CONTACTOS);
      if (error || cerrado) return;

      const ids = new Set<string>(
        (data ?? []).map((c: any) => (c.cliente_id === miId ? c.proveedora_id : c.cliente_id)),
      );
      ids.forEach(escuchar);
      Array.from(escuchando.keys()).forEach((id) => {
        if (!ids.has(id)) dejarDeEscuchar(id);
      });
    }

    function programarSincronizacion() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { sincronizarContactos(); }, 500);
    }

    sincronizarContactos();

    // Un chat nuevo (o eliminado) cambia a quién debo escuchar.
    const canalChats = supabase
      .channel(`presencia-chats-${miId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chats', filter: `cliente_id=eq.${miId}` },
        programarSincronizacion,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chats', filter: `proveedora_id=eq.${miId}` },
        programarSincronizacion,
      )
      .subscribe();

    const alVolverConexion = () => { sincronizarContactos(); };
    window.addEventListener('online', alVolverConexion);

    return () => {
      cerrado = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('online', alVolverConexion);
      mio.untrack();
      supabase.removeChannel(mio);
      supabase.removeChannel(canalChats);
      escuchando.forEach((canal) => supabase.removeChannel(canal));
      escuchando.clear();
    };
  }, [perfil?.id]);

  return <PresenciaContext.Provider value={enLinea}>{children}</PresenciaContext.Provider>;
}

export function useEnLinea(userId?: string | null): boolean {
  const enLinea = useContext(PresenciaContext);
  return !!userId && enLinea.has(userId);
}

/** Punto verde "Activo" / gris "Sin conexión". Para el propio usuario siempre "Activo" (tiene sesión). */
export function EstadoConexion({ userId, className = '' }: { userId?: string | null; className?: string }) {
  const { perfil } = useSession();
  const enLinea = useEnLinea(userId);
  const activo = enLinea || (!!userId && perfil?.id === userId);

  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${activo ? 'text-vela-verified' : 'text-vela-text-faint'} ${className}`}>
      <span className={`h-2 w-2 rounded-full ${activo ? 'bg-vela-verified' : 'bg-vela-text-faint'}`} />
      {activo ? 'Activo' : 'Sin conexión'}
    </span>
  );
}