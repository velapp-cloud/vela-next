'use client';

import CitaResumenChat from '@/components/CitaResumenChat';
import { aplicarEdicionFicha } from '@/lib/citas/confirmarEncuentro';
import { ESTADO_CANCELADA, ESTADO_FINALIZADA } from '@/lib/citas/estados';
import { formatoHora12 } from '@/lib/citas/formatoHora';
import { useCallback, useEffect, useRef, useState, use as usePromise, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { obtenerPerfilesRicos, type PerfilRico } from '@/lib/perfiles/datosRicos';
import { marcarChatLeido } from '@/lib/chats/marcarLeido';
import { setChatAbierto } from '@/lib/chats/chatAbierto';
import { EstadoConexion } from '@/components/PresenciaProvider';
import { IconoEncuentros, IconoHora, IconoDuracion, IconoLugar, IconoUbicacion } from '@/components/iconos';

const DURACIONES = ['30 minutos', '1 hora', '1 hora 30 min', '2 horas', '3 horas', '4 horas'];
const MAX_REAGENDAMIENTOS = 3;

// Texto fijo que genera pedirCambiosCita() en el mensaje de sistema.
const MARCA_PEDIDO_CAMBIOS = 'pidió estos cambios en la cita';
// Textos fijos de los avisos de cancelación / eliminación de perfil.
const MARCAS_CIERRE = ['canceló la cita', 'eliminó este perfil'];

type ChatRow = {
  id: string;
  cliente_id: string;
  proveedora_id: string;
  ficha_fecha: string;
  ficha_hora: string;
  ficha_duracion: string;
  ficha_lugar: string;
  ficha_tipo: string;
  ficha_mensaje: string;
  intentos_reagendado: number;
  bloqueado: boolean;
  bloqueado_hasta: string | null;
  requiere_nueva_solicitud: boolean;
};

type Mensaje = {
  id: string;
  chat_id: string;
  remitente_id: string | null;
  texto: string;
  tipo: 'normal' | 'sistema' | 'solicitud' | 'info';
  creado_en: string;
};

export default function ChatDetalle({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<main className="flex-1 flex items-center justify-center"><p className="text-sm text-vela-text-faint">Cargando...</p></main>}>
      <ChatDetalleContenido params={params} />
    </Suspense>
  );
}

function ChatDetalleContenido({ params }: { params: Promise<{ id: string }> }) {
  const { id: chatId } = usePromise(params);
  const router = useRouter();
  const { perfil } = useSession();
  const supabase = createClient();

  const [chat, setChat] = useState<ChatRow | null>(null);
  const [otraPersona, setOtraPersona] = useState<PerfilRico | null>(null);
  const [otraEdad, setOtraEdad] = useState<number | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState('');
  const [citaEstado, setCitaEstado] = useState<string | null>(null);
  const [haySolicitudPendiente, setHaySolicitudPendiente] = useState(false);
  // Una de las dos personas eliminó a la otra: no se pueden enviar solicitudes nuevas.
  const [hayBloqueo, setHayBloqueo] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mensajesRef = useRef<HTMLDivElement>(null);
  const [mostrarSubir, setMostrarSubir] = useState(false);

  function onScrollMensajes(e: React.UIEvent<HTMLDivElement>) {
    setMostrarSubir(e.currentTarget.scrollTop > 160);
  }

  function irArriba() {
    mensajesRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const soyCliente = perfil?.rol === 'cliente';
  const citaFinalizada = citaEstado === ESTADO_FINALIZADA;
  const citaCancelada = citaEstado === ESTADO_CANCELADA;
  // El chat se cierra cuando la cita terminó, se canceló, o se eliminó el perfil.
  // Solo se vuelve a abrir cuando se acepta una solicitud nueva.
  const chatCerrado = citaFinalizada || citaCancelada || !!chat?.requiere_nueva_solicitud;

  // Las notificaciones de este chat se marcan leídas al instante (como WhatsApp).
  const marcarNotisChatLeidas = useCallback(async () => {
    if (!perfil?.id) return;
    await supabase
      .from('notificaciones')
      .update({ leida: true })
      .eq('para_usuario_id', perfil.id)
      .eq('chat_id', chatId)
      .eq('leida', false);
  }, [chatId, perfil?.id, supabase]);

  const cargarTodo = useCallback(async () => {
    if (!perfil?.id) return;
    setCargando(true);

    const { data: chatData, error: chatError } = await supabase
      .from('chats')
      .select('id, cliente_id, proveedora_id, ficha_fecha, ficha_hora, ficha_duracion, ficha_lugar, ficha_tipo, ficha_mensaje, intentos_reagendado, bloqueado, bloqueado_hasta, requiere_nueva_solicitud')
      .eq('id', chatId)
      .single();

    if (chatError || !chatData) {
      console.error('Error cargando el chat:', chatError?.message);
      setCargando(false);
      return;
    }
    setChat(chatData);

    const otraId = chatData.cliente_id === perfil.id ? chatData.proveedora_id : chatData.cliente_id;
    const ricos = await obtenerPerfilesRicos(supabase, [otraId]);
    setOtraPersona(ricos[otraId] ?? null);

    const { data: pub } = await supabase
      .from('perfiles_publicos')
      .select('edad')
      .eq('id', otraId)
      .maybeSingle();
    setOtraEdad(pub?.edad ?? null);

    const { data: msjs } = await supabase
      .from('mensajes')
      .select('id, chat_id, remitente_id, texto, tipo, creado_en')
      .eq('chat_id', chatId)
      .order('creado_en', { ascending: true });
    setMensajes(msjs ?? []);

    await marcarChatLeido(supabase, chatId, perfil.id, perfil.rol as 'cliente' | 'proveedora');
    await marcarNotisChatLeidas();
    setCargando(false);
  }, [chatId, perfil?.id, perfil?.rol, supabase, marcarNotisChatLeidas]);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  useEffect(() => {
    let activo = true;
    const cargarCita = async () => {
      const { data } = await supabase
        .from('citas')
        .select('estado_manual')
        .eq('chat_id', chatId)
        .order('hora_acordada', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (activo) setCitaEstado(data?.estado_manual ?? null);
    };
    cargarCita();

    const canal = supabase
      .channel(`cita-estado-chat-${chatId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'citas', filter: `chat_id=eq.${chatId}` },
        () => cargarCita(),
      )
      .subscribe();

    return () => {
      activo = false;
      supabase.removeChannel(canal);
    };
  }, [chatId, supabase]);

  // Si el chat se cierra o se reabre (o cambian los detalles), la otra persona
  // lo ve al instante, sin recargar.
  useEffect(() => {
    const canal = supabase
      .channel(`chat-fila-${chatId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chats', filter: `id=eq.${chatId}` },
        (payload) => {
          setChat((prev) => (prev ? { ...prev, ...(payload.new as Partial<ChatRow>) } : prev));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [chatId, supabase]);

  // Mientras el chat está cerrado, revisamos si ya existe una solicitud
  // pendiente entre este cliente y esta proveedora, para no decirle
  // "envía una nueva solicitud" cuando ya envió una y está esperando.
  useEffect(() => {
    if (!chat || !chatCerrado) {
      setHaySolicitudPendiente(false);
      return;
    }
    let activo = true;
    const revisarSolicitud = async () => {
      const { data, error } = await supabase
        .from('solicitudes')
        .select('id')
        .eq('cliente_id', chat.cliente_id)
        .eq('proveedora_id', chat.proveedora_id)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error('Error revisando solicitud pendiente:', error.message, error.details, error.hint, error.code);
      }
      if (activo) setHaySolicitudPendiente(!!data);
    };
    revisarSolicitud();

    const canal = supabase
      .channel(`solicitud-pendiente-chat-${chatId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'solicitudes', filter: `cliente_id=eq.${chat.cliente_id}` },
        () => revisarSolicitud(),
      )
      .subscribe();

    return () => {
      activo = false;
      supabase.removeChannel(canal);
    };
  }, [chat?.cliente_id, chat?.proveedora_id, chatCerrado, chatId, supabase]);

  // ¿Una de las dos personas eliminó a la otra? Entonces no hay "nueva solicitud".
  useEffect(() => {
    if (!chat || !chatCerrado) {
      setHayBloqueo(false);
      return;
    }
    let activo = true;
    (async () => {
      const { data } = await supabase
        .from('bloqueos')
        .select('id')
        .eq('proveedora_id', chat.proveedora_id)
        .eq('cliente_id', chat.cliente_id)
        .maybeSingle();
      if (activo) setHayBloqueo(!!data);
    })();
    return () => { activo = false; };
  }, [chat?.cliente_id, chat?.proveedora_id, chatCerrado, supabase]);

  useEffect(() => {
    setChatAbierto(chatId);
    return () => setChatAbierto(null);
  }, [chatId]);

  useEffect(() => {
    if (!perfil?.id) return;
    const canal = supabase
      .channel(`chat-${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `chat_id=eq.${chatId}` },
        async (payload) => {
          const m = payload.new as Mensaje;
          setMensajes((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.remitente_id && m.remitente_id !== perfil.id) {
            await marcarChatLeido(supabase, chatId, perfil.id, perfil.rol as 'cliente' | 'proveedora');
          }
          await marcarNotisChatLeidas();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [chatId, perfil?.id, perfil?.rol, supabase, marcarNotisChatLeidas]);

  // Si llega una notificación de este chat mientras lo tengo abierto, se marca leída al momento.
  useEffect(() => {
    if (!perfil?.id) return;
    const canal = supabase
      .channel(`chat-notis-${chatId}-${perfil.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `para_usuario_id=eq.${perfil.id}` },
        (payload) => {
          const n = payload.new as { chat_id: string | null };
          if (n.chat_id === chatId) marcarNotisChatLeidas();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [chatId, perfil?.id, supabase, marcarNotisChatLeidas]);

  // Si se pierde y vuelve la conexión (o se vuelve a esta pestaña), se
  // traen los mensajes que faltaron, en silencio y sin recargar la página.
  useEffect(() => {
    if (!perfil?.id) return;
    async function resincronizar() {
      const { data } = await supabase
        .from('mensajes')
        .select('id, chat_id, remitente_id, texto, tipo, creado_en')
        .eq('chat_id', chatId)
        .order('creado_en', { ascending: true });
      if (data) {
        setMensajes(data);
        await marcarChatLeido(supabase, chatId, perfil!.id, perfil!.rol as 'cliente' | 'proveedora');
        await marcarNotisChatLeidas();
      }
    }
    const alVolverConexion = () => { resincronizar(); };
    const alVolverAVer = () => {
      if (document.visibilityState === 'visible') resincronizar();
    };
    window.addEventListener('online', alVolverConexion);
    document.addEventListener('visibilitychange', alVolverAVer);
    return () => {
      window.removeEventListener('online', alVolverConexion);
      document.removeEventListener('visibilitychange', alVolverAVer);
    };
  }, [chatId, perfil?.id, perfil?.rol, supabase, marcarNotisChatLeidas]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes.length]);

  async function enviarMensaje() {
    if (!texto.trim() || !perfil?.id || enviando || chatCerrado) return;
    setEnviando(true);
    const { error } = await supabase.from('mensajes').insert({
      chat_id: chatId,
      remitente_id: perfil.id,
      texto: texto.trim(),
      tipo: 'normal',
      leido: false,
      leido_cliente: soyCliente,
      leido_proveedora: !soyCliente,
    });
    setEnviando(false);
    if (error) {
      console.error('Error enviando mensaje:', error.message);
      return;
    }
    setTexto('');
  }

  const bloqueadoVigente = chat?.bloqueado && chat.bloqueado_hasta && new Date(chat.bloqueado_hasta) > new Date();

  async function guardarEdicionFicha(cambios: Pick<ChatRow, 'ficha_fecha' | 'ficha_hora' | 'ficha_duracion' | 'ficha_lugar' | 'ficha_tipo' | 'ficha_mensaje'>) {
    if (!chat || !perfil) return;
    setErrorGuardado('');

    const nuevosIntentos = chat.intentos_reagendado + 1;
    const seBloquea = nuevosIntentos >= MAX_REAGENDAMIENTOS;

    const { error } = await supabase.from('chats').update({
      ...cambios,
      intentos_reagendado: nuevosIntentos,
      bloqueado: seBloquea,
      bloqueado_hasta: seBloquea ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : chat.bloqueado_hasta,
    }).eq('id', chat.id);

    if (error) {
      console.error('Error editando la ficha:', error.message);
      setErrorGuardado('No se pudo guardar el cambio. Intenta de nuevo.');
      return;
    }

    await aplicarEdicionFicha(supabase, {
      chatId: chat.id,
      clienteId: chat.cliente_id,
      proveedoraId: chat.proveedora_id,
      fichaFecha: cambios.ficha_fecha,
      fichaHora: cambios.ficha_hora,
      fichaDuracion: cambios.ficha_duracion,
      fichaLugar: cambios.ficha_lugar,
      fichaTipo: cambios.ficha_tipo,
      fichaMensaje: cambios.ficha_mensaje,
      otroId: soyCliente ? chat.proveedora_id : chat.cliente_id,
      miAlias: perfil.alias,
    });

    setChat({ ...chat, ...cambios, intentos_reagendado: nuevosIntentos, bloqueado: seBloquea });
    setEditando(false);
  }

  if (cargando || !chat) {
    return <main className="flex-1 flex items-center justify-center"><p className="text-sm text-vela-text-faint">Cargando...</p></main>;
  }

  const otraId = chat.cliente_id === perfil?.id ? chat.proveedora_id : chat.cliente_id;
  const nombreOtra = otraPersona?.alias ?? 'la otra persona';

  return (
    <main className="flex-1 flex flex-col max-w-md mx-auto w-full h-screen">
      <div className="flex items-center gap-3 border-b border-vela-line bg-vela-surface p-4">
        <button onClick={() => router.push('/chat')} className="w-11 h-11 -ml-2 flex items-center justify-center text-vela-text-faint text-xl">←</button>
        <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0" style={{ backgroundColor: otraPersona?.avatar_color ?? '#D91F3A' }}>
          {otraPersona?.foto_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={otraPersona.foto_url} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold italic text-vela-text truncate">
            {otraPersona?.alias ?? 'Perfil'}{otraEdad ? `, ${otraEdad}` : ''}
          </p>
          <EstadoConexion userId={otraId} />
          <p className="text-xs text-vela-text-faint truncate">
            {[otraPersona?.ciudad, otraPersona?.estatura, otraPersona?.idiomas].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      </div>
      {otraPersona && otraPersona.chips.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-vela-line bg-vela-surface px-4 pb-3">
          {otraPersona.chips.map((c) => (
            <span key={c} className="text-xs bg-vela-surface-2 border border-vela-line text-vela-text-faint rounded-full px-3 py-1.5">{c}</span>
          ))}
        </div>
      )}

      {/* Zona con scroll: arriba van los detalles/confirmación de la cita y
          debajo la conversación. Cuando la conversación es larga y bajas,
          aparece el botón flotante para volver arriba de un toque. */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={mensajesRef}
          onScroll={onScrollMensajes}
          className="h-full overflow-y-auto flex flex-col"
        >
          {!chatCerrado && (
            <div className="border-b border-vela-line bg-vela-surface-2 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-vela-text-faint tracking-wide">DETALLES ACORDADOS</p>
                {soyCliente && !editando && (
                  <button
                    onClick={() => setEditando(true)}
                    disabled={!!bloqueadoVigente}
                    className="min-h-11 px-2 text-sm font-semibold text-vela-public disabled:opacity-40"
                  >
                    {bloqueadoVigente ? 'Bloqueado' : 'Editar'}
                  </button>
                )}
              </div>

              {bloqueadoVigente && (
                <p className="mt-1 text-xs text-vela-safety">
                  Se alcanzó el máximo de reagendamientos. Podrás editar de nuevo el {new Date(chat.bloqueado_hasta!).toLocaleString('es-SV')}.
                </p>
              )}

              {!editando ? (
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-vela-text-dim">
                  <p className="flex items-center gap-2 min-w-0"><IconoEncuentros size={18} className="flex-shrink-0 text-vela-text-faint" /><span className="truncate">{chat.ficha_fecha}</span></p>
                  <p className="flex items-center gap-2 min-w-0"><IconoHora size={18} className="flex-shrink-0 text-vela-text-faint" /><span className="truncate">{formatoHora12(chat.ficha_hora)}</span></p>
                  <p className="flex items-center gap-2 min-w-0"><IconoDuracion size={18} className="flex-shrink-0 text-vela-text-faint" /><span className="truncate">{chat.ficha_duracion}</span></p>
                  <p className="flex items-center gap-2 min-w-0"><IconoLugar size={18} className="flex-shrink-0 text-vela-text-faint" /><span className="truncate">{chat.ficha_tipo}</span></p>
                  <p className="col-span-2 flex items-center gap-2 min-w-0"><IconoUbicacion size={18} className="flex-shrink-0 text-vela-text-faint" /><span>{chat.ficha_lugar}</span></p>
                </div>
              ) : (
                <FormularioEdicionFicha
                  chat={chat}
                  errorGuardado={errorGuardado}
                  onCancelar={() => setEditando(false)}
                  onGuardar={guardarEdicionFicha}
                />
              )}
            </div>
          )}

          {!chatCerrado && (
            <CitaResumenChat chatId={chatId} onPedirEditar={() => setEditando(true)} />
          )}

          <div className="p-4 flex flex-col gap-2.5">
            {mensajes.map((m) => {
              const esSistema = m.tipo === 'sistema' || m.tipo === 'info';
              const esMio = m.remitente_id === perfil?.id;
              if (esSistema) {
                // Pedido de cambios en la cita: aviso bien visible (rojo, letras blancas en negrita).
                if (m.texto.includes(MARCA_PEDIDO_CAMBIOS)) {
                  return (
                    <div key={m.id} className="my-2 rounded-2xl border-2 border-vela-safety bg-vela-safety px-4 py-3 text-center shadow-lg">
                      <p className="text-[11px] font-extrabold tracking-wide text-white/90">⚠️ PIDIÓ CAMBIOS EN LA CITA</p>
                      <p className="mt-1 text-base font-extrabold leading-snug text-white">{m.texto}</p>
                    </div>
                  );
                }
                // Cancelación de la cita o perfil eliminado: también bien visible.
                if (MARCAS_CIERRE.some((marca) => m.texto.includes(marca))) {
                  return (
                    <div key={m.id} className="my-2 rounded-2xl border-2 border-vela-safety bg-vela-safety-soft px-4 py-3 text-center">
                      <p className="text-[11px] font-extrabold tracking-wide text-vela-safety">🚫 CONVERSACIÓN CERRADA</p>
                      <p className="mt-1 text-base font-bold leading-snug text-vela-text">{m.texto}</p>
                    </div>
                  );
                }
                return (
                  <p key={m.id} className="text-center text-xs text-vela-text-faint my-1">{m.texto}</p>
                );
              }
              return (
                <div key={m.id} className={`max-w-[80%] rounded-3xl px-4 py-3 text-[15px] leading-snug ${esMio ? 'self-end bg-vela-public text-white' : 'self-start bg-vela-surface-2 text-vela-text'}`}>
                  {m.texto}
                </div>
              );
            })}
            <div ref={scrollRef} />
          </div>
        </div>

        {mostrarSubir && (
          <button
            onClick={irArriba}
            className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-vela-public px-4 h-10 text-xs font-bold text-white shadow-lg"
          >
            ↑ {chatCerrado ? 'Ir al inicio' : 'Ir a la confirmación'}
          </button>
        )}
      </div>

      {chatCerrado ? (
        <div className="border-t border-vela-line bg-vela-surface p-5 text-center">
          {hayBloqueo ? (
            <p className="text-sm text-vela-text-faint leading-relaxed">
              Esta conversación se cerró de forma definitiva. Ya no es posible enviar nuevas solicitudes entre ustedes.
            </p>
          ) : haySolicitudPendiente ? (
            <p className="text-sm text-vela-text-faint leading-relaxed">
              {soyCliente
                ? 'Ya enviaste una nueva solicitud. Estamos esperando a que la aprueben para volver a coordinar.'
                : `${nombreOtra} ya envió una nueva solicitud. Revísala en Explorar para aceptarla o rechazarla.`}
            </p>
          ) : (
            <p className="text-sm text-vela-text-faint leading-relaxed">
              {soyCliente
                ? `${citaFinalizada ? 'Esta cita ya finalizó.' : 'Esta conversación está cerrada.'} Envía una nueva solicitud para volver a coordinar.`
                : `${citaFinalizada ? 'Esta cita ya finalizó.' : 'Esta conversación está cerrada.'} Esperando a que ${nombreOtra} envíe una nueva solicitud para volver a hablar.`}
            </p>
          )}
          {soyCliente && !haySolicitudPendiente && !hayBloqueo && (
            <Link
              href={`/perfil-detalle/${otraId}?solicitud=1`}
              className="mt-3 inline-flex items-center justify-center h-12 px-6 rounded-full bg-vela-public text-white text-sm font-bold"
            >
              Enviar nueva solicitud
            </Link>
          )}
          {!soyCliente && haySolicitudPendiente && !hayBloqueo && (
            <Link
              href="/explorar"
              className="mt-3 inline-flex items-center justify-center h-12 px-6 rounded-full bg-vela-public text-white text-sm font-bold"
            >
              Ver solicitud
            </Link>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t border-vela-line bg-vela-surface p-3">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') enviarMensaje(); }}
            placeholder="Escribe un mensaje..."
            className="flex-1 min-w-0 bg-vela-surface-2 border border-vela-line rounded-full px-5 h-12 text-base text-vela-text outline-none focus:border-vela-public/60"
          />
          <button
            onClick={enviarMensaje}
            disabled={!texto.trim() || enviando}
            className="w-12 h-12 rounded-full bg-vela-public text-white flex items-center justify-center disabled:opacity-50"
          >
            ➤
          </button>
        </div>
      )}
    </main>
  );
}

/** Separa una hora guardada ("19:00", "19:00:00" o "7:00 PM") en hora 1-12, minutos y AM/PM. */
function partesHora(valor: string | null | undefined) {
  const texto = (valor ?? '').trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(texto);
  let h24 = m ? parseInt(m[1], 10) : 19;
  const min = m ? parseInt(m[2], 10) : 0;
  if (/pm/i.test(texto) && h24 < 12) h24 += 12;
  if (/am/i.test(texto) && h24 === 12) h24 = 0;
  return {
    h12: h24 % 12 === 0 ? 12 : h24 % 12,
    min,
    periodo: (h24 >= 12 ? 'PM' : 'AM') as 'AM' | 'PM',
  };
}

function FormularioEdicionFicha({ chat, errorGuardado, onCancelar, onGuardar }: {
  chat: ChatRow;
  errorGuardado: string;
  onCancelar: () => void;
  onGuardar: (cambios: Pick<ChatRow, 'ficha_fecha' | 'ficha_hora' | 'ficha_duracion' | 'ficha_lugar' | 'ficha_tipo' | 'ficha_mensaje'>) => void;
}) {
  const inicial = partesHora(chat.ficha_hora);
  const [fecha, setFecha] = useState(chat.ficha_fecha);
  const [horaH, setHoraH] = useState(inicial.h12);
  const [horaM, setHoraM] = useState(inicial.min);
  const [horaPeriodo, setHoraPeriodo] = useState<'AM' | 'PM'>(inicial.periodo);
  const [duracion, setDuracion] = useState(chat.ficha_duracion);
  const [lugar, setLugar] = useState(chat.ficha_lugar);
  const [tipo, setTipo] = useState(chat.ficha_tipo);
  const [mensaje, setMensaje] = useState(chat.ficha_mensaje);

  const minutosOpciones = Array.from(
    new Set([...Array.from({ length: 12 }, (_, i) => i * 5), inicial.min]),
  ).sort((a, b) => a - b);

  function horaEn24() {
    const h24 = horaPeriodo === 'PM' ? (horaH % 12) + 12 : horaH % 12;
    return `${String(h24).padStart(2, '0')}:${String(horaM).padStart(2, '0')}`;
  }

  return (
    <div className="mt-2 flex flex-col gap-3">
      <div>
        <label className="text-xs font-semibold text-vela-text-faint">Fecha</label>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full mt-1.5 bg-vela-surface border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none [color-scheme:dark]" />
      </div>
      <div>
        <label className="text-xs font-semibold text-vela-text-faint">Hora</label>
        <div className="flex gap-2 mt-1.5">
          <select
            value={horaH}
            onChange={(e) => setHoraH(Number(e.target.value))}
            className="flex-1 bg-vela-surface border border-vela-line rounded-2xl px-3 h-14 text-base text-vela-text outline-none [color-scheme:dark]"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          <select
            value={horaM}
            onChange={(e) => setHoraM(Number(e.target.value))}
            className="flex-1 bg-vela-surface border border-vela-line rounded-2xl px-3 h-14 text-base text-vela-text outline-none [color-scheme:dark]"
          >
            {minutosOpciones.map((m) => (
              <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
            ))}
          </select>
          <select
            value={horaPeriodo}
            onChange={(e) => setHoraPeriodo(e.target.value as 'AM' | 'PM')}
            className="flex-1 bg-vela-surface border border-vela-line rounded-2xl px-3 h-14 text-base text-vela-text outline-none [color-scheme:dark]"
          >
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-vela-text-faint">Duración</label>
        <div className="flex flex-wrap gap-2 mt-1.5">
          {DURACIONES.map((d) => (
            <button key={d} onClick={() => setDuracion(d)} className={`px-4 py-2.5 rounded-full text-sm font-medium border ${duracion === d ? 'bg-vela-public-soft border-vela-public text-vela-public' : 'bg-vela-surface border-vela-line text-vela-text-faint'}`}>{d}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-vela-text-faint">Tipo de lugar</label>
        <input value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full mt-1.5 bg-vela-surface border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none" />
      </div>
      <div>
        <label className="text-xs font-semibold text-vela-text-faint">Lugar</label>
        <input value={lugar} onChange={(e) => setLugar(e.target.value)} className="w-full mt-1.5 bg-vela-surface border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none" />
      </div>
      <div>
        <label className="text-xs font-semibold text-vela-text-faint">Mensaje</label>
        <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={2} className="w-full mt-1.5 bg-vela-surface border border-vela-line rounded-2xl px-4 py-3 text-base text-vela-text outline-none resize-none" />
      </div>

      {errorGuardado && <p className="text-xs text-vela-safety">{errorGuardado}</p>}

      <div className="flex gap-2 mt-1">
        <button onClick={onCancelar} className="flex-1 h-12 rounded-full bg-vela-surface border border-vela-line text-vela-text-faint text-sm font-bold">Cancelar</button>
        <button
          onClick={() => onGuardar({ ficha_fecha: fecha, ficha_hora: horaEn24(), ficha_duracion: duracion, ficha_lugar: lugar, ficha_tipo: tipo, ficha_mensaje: mensaje })}
          className="flex-1 h-12 rounded-full bg-vela-public text-white text-sm font-bold"
        >
          Guardar cambios
        </button>
      </div>
    </div>
  );
}