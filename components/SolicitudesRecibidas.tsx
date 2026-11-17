'use client';

/**
 * components/SolicitudesRecibidas.tsx
 * Vista de la proveedora en Explorar: las solicitudes de encuentro que ha recibido
 * (con el plan de quien las envía). Aceptar abre el chat; rechazar pide un motivo.
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { CAPACIDADES } from '@/lib/planes/capacidades';
import { aceptarSolicitud } from '@/lib/citas/aceptarSolicitud';
import { formatoHora12 } from '@/lib/citas/formatoHora';
import { resolverFotoUrl } from '@/lib/perfiles/resolverFoto';
import { cerrarChatPorEliminacion } from '@/lib/perfiles/descartarPerfil';
import {
  IconoUbicacion,
  IconoEncuentros,
  IconoHora,
  IconoDuracion,
} from '@/components/iconos';

// Motivos de rechazo de solicitud. Los marcados como "bloquea" cierran
// permanentemente la posibilidad de que ese cliente vuelva a aparecer
// en el Explorar de la proveedora o le vuelva a enviar solicitudes.
const MOTIVOS_RECHAZO_SOLICITUD: { texto: string; bloquea: boolean }[] = [
  { texto: 'Está ocupada', bloquea: false },
  { texto: 'Quiere cambiar de horario', bloquea: false },
  { texto: 'Quiere cambiar de lugar', bloquea: false },
  { texto: 'No me interesa', bloquea: true },
];

type Solicitud = {
  id: string;
  cliente_id: string;
  alias: string;
  plan: string | null;
  avatar_color: string;
  foto_url: string | null;
  fecha: string;
  hora: string;
  duracion: string;
  lugar: string;
  tipo: string;
  mensaje: string;
};

/** Nombre bonito del plan de quien envía la solicitud: Básico, Premium, Gold o VIP. */
function etiquetaPlan(plan: string | null): string | null {
  if (!plan) return null;
  return (CAPACIDADES as Record<string, { label: string }>)[plan]?.label ?? plan;
}

export default function SolicitudesRecibidas() {
  const { perfil } = useSession();
  const router = useRouter();
  const cap = perfil ? CAPACIDADES[perfil.plan] : CAPACIDADES.basico;

  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState('');
  const [rechazando, setRechazando] = useState<Solicitud | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState<string | null>(null);

  // Al ver las solicitudes, su notificación se marca leída al instante (como WhatsApp).
  const marcarNotisSolicitudLeidas = useCallback(async () => {
    if (!perfil?.id) return;
    const supabase = createClient();
    await supabase
      .from('notificaciones')
      .update({ leida: true })
      .eq('para_usuario_id', perfil.id)
      .eq('leida', false)
      .ilike('mensaje', '%solicitud%')
      .eq('ruta', '/explorar');
  }, [perfil?.id]);

  const cargar = useCallback(async () => {
    setCargando(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) { setCargando(false); return; }

    const { data } = await supabase
      .from('solicitudes')
      .select('*')
      .eq('proveedora_id', userId)
      .order('creado_en', { ascending: false });

    const clienteIds = (data ?? []).map((s: any) => s.cliente_id);
    let clientesMap: Record<string, any> = {};
    if (clienteIds.length > 0) {
      const { data: clientes } = await supabase.from('perfiles_publicos').select('id, alias, avatar_color, fotos, plan').in('id', clienteIds);
      clientesMap = Object.fromEntries((clientes ?? []).map((c: any) => [
        c.id,
        { ...c, foto_url: c.fotos && c.fotos.length > 0 ? resolverFotoUrl(supabase, c.fotos[0]) : null },
      ]));
    }

    setSolicitudes((data ?? []).map((s: any) => ({
      id: s.id,
      cliente_id: s.cliente_id,
      alias: clientesMap[s.cliente_id]?.alias ?? 'Perfil',
      plan: clientesMap[s.cliente_id]?.plan ?? null,
      avatar_color: clientesMap[s.cliente_id]?.avatar_color ?? '#D91F3A',
      foto_url: clientesMap[s.cliente_id]?.foto_url ?? null,
      fecha: s.fecha,
      hora: s.hora,
      duracion: s.duracion,
      lugar: s.lugar,
      tipo: s.tipo,
      mensaje: s.mensaje ?? '',
    })));

    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => { marcarNotisSolicitudLeidas(); }, [marcarNotisSolicitudLeidas]);

  useEffect(() => {
    if (!perfil?.id) return;
    const supabase = createClient();

    const canal = supabase
      .channel(`solicitudes-recibidas-${perfil.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'solicitudes', filter: `proveedora_id=eq.${perfil.id}` },
        async (payload) => {
          const fila = payload.new as any;
          const { data: cliente } = await supabase
            .from('perfiles_publicos')
            .select('id, alias, avatar_color, fotos, plan')
            .eq('id', fila.cliente_id)
            .maybeSingle();
          if (!cliente) return;

          setSolicitudes((prev) => [
            {
              id: fila.id,
              cliente_id: fila.cliente_id,
              alias: cliente.alias ?? 'Perfil',
              plan: cliente.plan ?? null,
              avatar_color: cliente.avatar_color ?? '#D91F3A',
              foto_url: cliente.fotos && cliente.fotos.length > 0 ? resolverFotoUrl(supabase, cliente.fotos[0]) : null,
              fecha: fila.fecha,
              hora: fila.hora,
              duracion: fila.duracion,
              lugar: fila.lugar,
              tipo: fila.tipo,
              mensaje: fila.mensaje ?? '',
            },
            ...prev,
          ]);

          // Ya está viendo la solicitud: la notificación (que llega un instante después) se marca leída.
          setTimeout(() => { marcarNotisSolicitudLeidas(); }, 800);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [perfil?.id, marcarNotisSolicitudLeidas]);

  async function aceptar(s: Solicitud) {
    setProcesando(s.id);
    setErrorAccion('');
    const supabase = createClient();

    try {
      const r = await aceptarSolicitud(supabase, s, perfil?.alias ?? 'Alguien');
      if (!r.ok) {
        setErrorAccion(r.error);
        setProcesando(null);
        if (r.choque) window.alert(r.error);
        return;
      }

      setProcesando(null);
      if (r.chatId) {
        router.push(`/chat/${r.chatId}`);
      } else {
        cargar();
      }
    } catch (err: any) {
      console.error('Error inesperado aceptando la solicitud:', err?.message ?? err);
      setErrorAccion('Algo falló aceptando la solicitud. Revisa la consola e intenta de nuevo.');
      setProcesando(null);
    }
  }

  function abrirRechazo(s: Solicitud) {
    setRechazando(s);
    setMotivoRechazo(null);
    setErrorAccion('');
  }

  async function confirmarRechazo() {
    if (!rechazando || !motivoRechazo || !perfil?.id) return;
    const s = rechazando;
    const motivo = MOTIVOS_RECHAZO_SOLICITUD.find((m) => m.texto === motivoRechazo);

    setProcesando(s.id);
    setErrorAccion('');
    const supabase = createClient();

    const { error } = await supabase.from('solicitudes').delete().eq('id', s.id);
    if (error) {
      console.error('Error rechazando la solicitud:', error.message, error.details, error.hint, error.code);
      setErrorAccion('No se pudo rechazar la solicitud. Intenta de nuevo.');
      setProcesando(null);
      return;
    }

    if (motivo?.bloquea) {
      const { error: bloqueoError } = await supabase.from('bloqueos').upsert(
        { proveedora_id: perfil.id, cliente_id: s.cliente_id, motivo: motivoRechazo },
        { onConflict: 'proveedora_id,cliente_id' }
      );
      if (bloqueoError) {
        console.error('Error bloqueando al cliente:', bloqueoError.message, bloqueoError.details, bloqueoError.hint, bloqueoError.code);
      } else {
        // Si ya había un chat entre las dos personas: se cierra y el cliente ve el motivo.
        // Para ti, ese chat desaparece de tu lista.
        await cerrarChatPorEliminacion(supabase, {
          clienteId: s.cliente_id,
          proveedoraId: perfil.id,
          quienElimina: 'proveedora',
          aliasQuienElimina: perfil.alias ?? 'Alguien',
          motivoVisible: motivoRechazo,
        });
      }
    } else {
      await supabase.from('notificaciones').insert({
        para_usuario_id: s.cliente_id,
        mensaje: `${perfil?.alias ?? 'Alguien'} no pudo aceptar tu solicitud de encuentro: ${motivoRechazo}.`,
        ruta: '/explorar',
      });
    }

    setProcesando(null);
    setRechazando(null);
    setMotivoRechazo(null);
    cargar();
  }

  return (
    <main className="flex-1 px-6 py-6 max-w-md mx-auto w-full">
      <h1 className="text-[28px] leading-tight font-bold text-vela-text mb-1">Solicitudes</h1>

      <div className="bg-vela-surface border border-vela-line rounded-2xl p-4 mb-5">
        <p className="text-xs text-vela-text-faint">
          Plan {cap.label} · alcance <span className="text-vela-public font-semibold">
            {perfil?.plan === 'vip' ? '100%' : perfil?.plan === 'gold' ? '75%' : perfil?.plan === 'premium' ? '50%' : '25%'}
          </span>
        </p>
      </div>

      {errorAccion && (
        <div className="bg-vela-safety-soft border border-vela-safety rounded-2xl p-4 mb-4">
          <p className="text-xs text-vela-safety">{errorAccion}</p>
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-vela-text-faint text-center py-8">Cargando...</p>
      ) : solicitudes.length === 0 ? (
        <p className="text-sm text-vela-text-faint text-center py-8">No tienes solicitudes pendientes por ahora.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {solicitudes.map((s) => (
            <div key={s.id} className="bg-vela-surface border border-vela-line rounded-3xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0" style={{ backgroundColor: s.avatar_color }}>
                  {s.foto_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.foto_url} alt="" className="w-full h-full object-cover object-top" />
                  ) : (
                    <span className="text-white font-bold text-sm">{s.alias.charAt(0)}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold text-vela-text italic truncate">{s.alias}</p>
                  {etiquetaPlan(s.plan) && (
                    <p className="text-xs font-bold tracking-wide text-vela-text-faint">
                      Plan {etiquetaPlan(s.plan)}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3 text-sm text-vela-text-dim">
                <p className="flex items-center gap-2 min-w-0"><IconoEncuentros size={18} className="flex-shrink-0 text-vela-text-faint" /><span className="truncate">{s.fecha}</span></p>
                <p className="flex items-center gap-2 min-w-0"><IconoHora size={18} className="flex-shrink-0 text-vela-text-faint" /><span className="truncate">{formatoHora12(s.hora)}</span></p>
                <p className="flex items-center gap-2 min-w-0"><IconoDuracion size={18} className="flex-shrink-0 text-vela-text-faint" /><span className="truncate">{s.duracion}</span></p>
                <p className="flex items-center gap-2 min-w-0"><IconoUbicacion size={18} className="flex-shrink-0 text-vela-text-faint" /><span className="truncate">{s.lugar}</span></p>
              </div>
              {s.mensaje && <p className="text-sm text-vela-text-faint italic mb-3">"{s.mensaje}"</p>}

              {rechazando?.id === s.id ? (
                <div className="flex flex-col gap-3 bg-vela-surface-2 rounded-2xl p-4 border border-vela-line">
                  <p className="text-xs font-bold text-vela-text-faint">¿Por qué rechazas esta solicitud?</p>
                  <div className="flex flex-wrap gap-2">
                    {MOTIVOS_RECHAZO_SOLICITUD.map((m) => (
                      <button
                        key={m.texto}
                        onClick={() => setMotivoRechazo(m.texto)}
                        className={`px-4 py-2.5 rounded-full text-sm font-medium border ${
                          motivoRechazo === m.texto ? 'bg-vela-public-soft border-vela-public text-vela-public' : 'bg-vela-surface border-vela-line text-vela-text-faint'
                        }`}
                      >
                        {m.texto}
                      </button>
                    ))}
                  </div>
                  {motivoRechazo && MOTIVOS_RECHAZO_SOLICITUD.find((m) => m.texto === motivoRechazo)?.bloquea && (
                    <p className="text-[11px] text-vela-safety">
                      Este perfil quedará bloqueado: no podrá ver tu perfil ni enviarte más solicitudes.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setRechazando(null); setMotivoRechazo(null); }}
                      className="flex-1 h-12 rounded-full bg-vela-surface border border-vela-line text-vela-text-faint text-sm font-bold"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={confirmarRechazo}
                      disabled={!motivoRechazo || procesando === s.id}
                      className="flex-1 h-12 rounded-full bg-vela-safety text-white text-sm font-bold disabled:opacity-50"
                    >
                      {procesando === s.id ? '...' : 'Confirmar'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => abrirRechazo(s)}
                    disabled={procesando === s.id}
                    className="flex-1 h-14 rounded-full border-[1.5px] border-vela-public bg-transparent text-vela-text text-base font-bold disabled:opacity-50"
                  >
                    Rechazar
                  </button>
                  <button
                    onClick={() => aceptar(s)}
                    disabled={procesando === s.id}
                    className="flex-1 h-14 rounded-full bg-vela-public text-white text-base font-bold flex items-center justify-center disabled:opacity-50"
                  >
                    {procesando === s.id ? '...' : 'Aceptar'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}