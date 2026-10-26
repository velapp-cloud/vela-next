'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { obtenerPerfilesRicos, type PerfilRico } from '@/lib/perfiles/datosRicos';
import { useEnLinea } from '@/components/PresenciaProvider';

type ChatFila = {
  id: string;
  cliente_id: string;
  proveedora_id: string;
  requiere_nueva_solicitud: boolean | null;
  oculto_cliente: boolean | null;
  oculto_proveedora: boolean | null;
};

type UltimoMensaje = {
  chat_id: string;
  texto: string;
  tipo: string;
  creado_en: string;
};

type ChatListado = {
  id: string;
  otraId: string;
  otraPersona: PerfilRico | null;
  edad: number | null;
  ultimoTexto: string | null;
  ultimaFecha: string | null;
  sinLeer: number;
  sinIniciar: boolean;
  cerrado: boolean;
};

// El filtro "in" de Supabase Realtime admite como máximo 100 valores.
const MAX_CHATS_ESCUCHADOS = 100;

function PuntoConexion({ userId }: { userId: string }) {
  const enLinea = useEnLinea(userId);
  return (
    <span
      title={enLinea ? 'Activo' : 'Sin conexión'}
      className={`absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-vela-bg ${
        enLinea ? 'bg-vela-verified' : 'bg-vela-text-faint'
      }`}
    />
  );
}

export default function ChatListaPage() {
  const supabase = createClient();
  const { perfil } = useSession();
  const [chats, setChats] = useState<ChatListado[]>([]);
  const [cargando, setCargando] = useState(true);
  // Ids de los chats que se están escuchando (separados por coma).
  const [idsEscucha, setIdsEscucha] = useState('');
  // Solo la primera carga muestra "Cargando..."; las siguientes se hacen en silencio.
  const primeraCarga = useRef(true);
  const recargaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargar = useCallback(async () => {
    if (!perfil?.id) return;
    if (primeraCarga.current) setCargando(true);
    const soyCliente = perfil.rol === 'cliente';

    const { data: chatsData, error } = await supabase
      .from('chats')
      .select('id, cliente_id, proveedora_id, requiere_nueva_solicitud, oculto_cliente, oculto_proveedora')
      .or(`cliente_id.eq.${perfil.id},proveedora_id.eq.${perfil.id}`);

    // Si falla (por ejemplo sin internet) se conserva lo que ya se ve.
    if (error) {
      primeraCarga.current = false;
      setCargando(false);
      return;
    }

    // Los chats que yo eliminé no aparecen en mi lista.
    const filas = ((chatsData ?? []) as ChatFila[]).filter(
      (f) => !(soyCliente ? f.oculto_cliente : f.oculto_proveedora),
    );

    if (filas.length === 0) {
      setChats([]);
      setIdsEscucha('');
      primeraCarga.current = false;
      setCargando(false);
      return;
    }

    const chatIds = filas.map((f) => f.id);
    setIdsEscucha([...chatIds].sort().join(','));
    const otraIds = filas.map((f) => (f.cliente_id === perfil.id ? f.proveedora_id : f.cliente_id));

    const ricos = await obtenerPerfilesRicos(supabase, otraIds);

    const { data: edadesData } = await supabase
      .from('perfiles_publicos')
      .select('id, edad')
      .in('id', otraIds);
    const edadPorId: Record<string, number | null> = Object.fromEntries(
      (edadesData ?? []).map((e: any) => [e.id, e.edad ?? null]),
    );

    const { data: mensajesData } = await supabase
      .from('mensajes')
      .select('chat_id, texto, tipo, creado_en')
      .in('chat_id', chatIds)
      .order('creado_en', { ascending: false });

    const ultimoPorChat: Record<string, UltimoMensaje> = {};
    (mensajesData ?? []).forEach((m: any) => {
      if (!ultimoPorChat[m.chat_id]) ultimoPorChat[m.chat_id] = m;
    });

    const { data: noLeidosData } = await supabase
      .from('mensajes')
      .select('chat_id')
      .in('chat_id', chatIds)
      .eq(soyCliente ? 'leido_cliente' : 'leido_proveedora', false)
      .neq('remitente_id', perfil.id);

    const sinLeerPorChat: Record<string, number> = {};
    (noLeidosData ?? []).forEach((m: any) => {
      sinLeerPorChat[m.chat_id] = (sinLeerPorChat[m.chat_id] ?? 0) + 1;
    });

    const listado: ChatListado[] = filas.map((f) => {
      const otraId = f.cliente_id === perfil.id ? f.proveedora_id : f.cliente_id;
      const ultimo = ultimoPorChat[f.id];
      const cerrado = !!f.requiere_nueva_solicitud;
      return {
        id: f.id,
        otraId,
        otraPersona: ricos[otraId] ?? null,
        edad: edadPorId[otraId] ?? null,
        ultimoTexto: ultimo?.texto ?? null,
        ultimaFecha: ultimo?.creado_en ?? null,
        sinLeer: sinLeerPorChat[f.id] ?? 0,
        sinIniciar: !ultimo && !cerrado,
        cerrado,
      };
    });

    // Primero los chats abiertos; los cerrados van al final.
    listado.sort((a, b) => {
      if (a.cerrado !== b.cerrado) return a.cerrado ? 1 : -1;
      if (!a.ultimaFecha && !b.ultimaFecha) return 0;
      if (!a.ultimaFecha) return -1;
      if (!b.ultimaFecha) return 1;
      return new Date(b.ultimaFecha).getTime() - new Date(a.ultimaFecha).getTime();
    });

    setChats(listado);
    primeraCarga.current = false;
    setCargando(false);
  }, [perfil?.id, perfil?.rol, supabase]);

  // Si llegan muchos eventos seguidos, se recarga una sola vez.
  const programarRecarga = useCallback(() => {
    if (recargaTimer.current) clearTimeout(recargaTimer.current);
    recargaTimer.current = setTimeout(() => { cargar(); }, 400);
  }, [cargar]);

  useEffect(() => {
    return () => {
      if (recargaTimer.current) clearTimeout(recargaTimer.current);
    };
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Solo se escuchan mis chats y los mensajes de mis chats (no los de toda la app).
  useEffect(() => {
    if (!perfil?.id) return;
    const ids = idsEscucha ? idsEscucha.split(',').slice(0, MAX_CHATS_ESCUCHADOS) : [];

    let canal = supabase
      .channel(`chat-lista-${perfil.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chats', filter: `cliente_id=eq.${perfil.id}` },
        programarRecarga,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chats', filter: `proveedora_id=eq.${perfil.id}` },
        programarRecarga,
      );

    if (ids.length > 0) {
      canal = canal.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mensajes', filter: `chat_id=in.(${ids.join(',')})` },
        programarRecarga,
      );
    }

    canal.subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [perfil?.id, idsEscucha, supabase, programarRecarga]);

  // Al volver la conexión a internet o al volver a esta pestaña, se
  // actualiza sola (sin recargar la página).
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

  if (cargando) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-vela-text-faint">Cargando...</p>
      </main>
    );
  }

  if (chats.length === 0) {
    return (
      <main className="flex-1 flex items-center justify-center px-6">
        <p className="text-base text-vela-text-faint text-center leading-relaxed">
          Todavía no tienes conversaciones. En cuanto acepten o te acepten una solicitud, aparecerá aquí.
        </p>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col max-w-md mx-auto w-full">
      <div className="px-5 pt-6 pb-3">
        <h1 className="text-[28px] leading-tight font-bold text-vela-text">Chats</h1>
      </div>
      <div className="flex flex-col">
        {chats.map((c) => (
          <Link
            key={c.id}
            href={`/chat/${c.id}`}
            className={`flex items-center gap-4 px-5 py-4 border-b border-vela-line ${
              c.cerrado ? 'opacity-70' : c.sinIniciar || c.sinLeer > 0 ? 'bg-vela-public-soft' : ''
            }`}
          >
            <div className="relative flex-shrink-0">
              <div
                className="w-14 h-14 rounded-full overflow-hidden"
                style={{ backgroundColor: c.otraPersona?.avatar_color ?? '#D91F3A' }}
              >
                {c.otraPersona?.foto_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.otraPersona.foto_url} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <PuntoConexion userId={c.otraId} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-base font-bold italic text-vela-text truncate">
                  {c.otraPersona?.alias ?? 'Perfil'}{c.edad ? `, ${c.edad}` : ''}
                </p>
                {c.ultimaFecha && (
                  <span className="text-xs text-vela-text-faint flex-shrink-0">
                    {new Date(c.ultimaFecha).toLocaleDateString('es-SV', { day: '2-digit', month: 'short' })}
                  </span>
                )}
              </div>
              {c.sinIniciar ? (
                <p className="text-sm font-bold text-vela-public truncate">
                  ✨ Conversación nueva: escribe el primer mensaje
                </p>
              ) : (
                <p className={`text-sm truncate ${c.sinLeer > 0 && !c.cerrado ? 'font-semibold text-vela-text' : 'text-vela-text-faint'}`}>
                  {c.ultimoTexto ?? 'Conversación cerrada'}
                </p>
              )}
            </div>
            {c.cerrado && (
              <span className="flex h-6 items-center justify-center rounded-full border border-vela-line bg-vela-surface-2 px-3 text-[11px] font-bold text-vela-text-faint flex-shrink-0">
                Cerrado
              </span>
            )}
            {c.sinIniciar && (
              <span className="flex h-6 items-center justify-center rounded-full bg-vela-public px-3 text-[11px] font-bold text-white flex-shrink-0">
                Nuevo
              </span>
            )}
            {c.sinLeer > 0 && !c.cerrado && (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-vela-public px-2 text-[11px] font-bold text-white flex-shrink-0">
                {c.sinLeer > 9 ? '9+' : c.sinLeer}
              </span>
            )}
          </Link>
        ))}
      </div>
    </main>
  );
}