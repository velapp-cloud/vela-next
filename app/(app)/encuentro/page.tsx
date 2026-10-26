'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { ESTADO_ACTIVA, ESTADO_CANCELADA, ESTADO_FINALIZADA } from '@/lib/citas/estados';
import CitaCard, { type Cita } from '@/components/CitaCard';
import EncuentroEnCurso from '@/components/EncuentroEnCurso';

type CitaFila = {
  id: string;
  cliente_id: string;
  proveedora_id: string;
  lugar: string;
  direccion: string | null;
  hora_acordada: string;
  duracion_horas: number;
  tipo_encuentro: string;
  mensaje: string | null;
  estado_manual: string;
  iniciada_en: string | null;
  cliente_inicio: boolean;
  proveedora_inicio: boolean;
  motivo_cancelacion: string | null;
  en_emergencia: boolean;
  en_emergencia_por: string | null;
  extension_pendiente: boolean;
  extension_minutos_pendiente: number | null;
  extension_minutos_acumulados: number;
  cliente_califico: boolean;
  proveedora_califico: boolean;
};

export default function EncuentroPage() {
  const supabase = createClient();
  const { perfil } = useSession();
  const [citas, setCitas] = useState<Cita[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [abiertas, setAbiertas] = useState<string[]>([]);
  const yaCargoUnaVez = useRef(false);
  const recargaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargar = useCallback(async () => {
    if (!perfil?.id) return;
    if (!yaCargoUnaVez.current) setCargando(true);

    const { data: filas, error } = await supabase
      .from('citas')
      .select(
        'id, cliente_id, proveedora_id, lugar, direccion, hora_acordada, duracion_horas, tipo_encuentro, mensaje, estado_manual, iniciada_en, cliente_inicio, proveedora_inicio, motivo_cancelacion, en_emergencia, en_emergencia_por, extension_pendiente, extension_minutos_pendiente, extension_minutos_acumulados, cliente_califico, proveedora_califico',
      )
      .or(`cliente_id.eq.${perfil.id},proveedora_id.eq.${perfil.id}`)
      .eq('cliente_confirmo', true)
      .eq('proveedora_confirmo', true)
      .order('hora_acordada', { ascending: true });

    if (error) {
      console.error('Error cargando citas:', error.message);
      setCitas([]);
      yaCargoUnaVez.current = true;
      setCargando(false);
      return;
    }

    const filasOk = (filas ?? []) as CitaFila[];
    const otraPersonaIds = filasOk.map((f) => (f.cliente_id === perfil.id ? f.proveedora_id : f.cliente_id));

    const { data: perfiles } = await supabase
      .from('perfiles_publicos')
      .select('id, alias')
      .in('id', otraPersonaIds.length > 0 ? otraPersonaIds : ['00000000-0000-0000-0000-000000000000']);

    const aliasPorId = Object.fromEntries((perfiles ?? []).map((p) => [p.id, p.alias]));

    setCitas(
      filasOk.map((f) => ({
        ...f,
        otraPersonaAlias: aliasPorId[f.cliente_id === perfil.id ? f.proveedora_id : f.cliente_id] ?? '—',
      })),
    );
    yaCargoUnaVez.current = true;
    setCargando(false);
  }, [perfil?.id, supabase]);

  // Si llegan varios cambios seguidos, se recarga una sola vez.
  const programarRecarga = useCallback(() => {
    if (recargaTimer.current) clearTimeout(recargaTimer.current);
    recargaTimer.current = setTimeout(() => { cargar(); }, 300);
  }, [cargar]);

  useEffect(() => {
    return () => {
      if (recargaTimer.current) clearTimeout(recargaTimer.current);
    };
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Solo se escuchan las citas donde participo (no las de toda la app).
  useEffect(() => {
    if (!perfil?.id) return;
    const canal = supabase
      .channel(`citas-${perfil.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'citas', filter: `cliente_id=eq.${perfil.id}` },
        programarRecarga,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'citas', filter: `proveedora_id=eq.${perfil.id}` },
        programarRecarga,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [perfil?.id, supabase, programarRecarga]);

  const confirmarLlegada = async (citaId: string) => {
    if (!perfil?.id) return;
    const cita = citas.find((c) => c.id === citaId);
    if (!cita) return;

    setProcesandoId(citaId);
    try {
      const esCliente = perfil.rol === 'cliente';
      const campo = esCliente ? 'cliente_inicio' : 'proveedora_inicio';
      const otroCampoYaListo = esCliente ? cita.proveedora_inicio : cita.cliente_inicio;

      const cambios: Record<string, unknown> = { [campo]: true };
      if (otroCampoYaListo) {
        cambios.estado_manual = ESTADO_ACTIVA;
        cambios.iniciada_en = new Date().toISOString();
      }

      await supabase.from('citas').update(cambios).eq('id', citaId);
      await cargar();
    } finally {
      setProcesandoId(null);
    }
  };

  const cancelar = async (citaId: string, motivo: string) => {
    if (!perfil?.id) return;
    setProcesandoId(citaId);
    try {
      await supabase
        .from('citas')
        .update({
          estado_manual: ESTADO_CANCELADA,
          motivo_cancelacion: motivo,
          cancelado_por: perfil.id,
        })
        .eq('id', citaId);
      await cargar();
    } finally {
      setProcesandoId(null);
    }
  };

  function alternar(id: string) {
    setAbiertas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  if (cargando) {
    return <p className="py-10 text-center text-sm text-vela-text-faint">Cargando tus citas...</p>;
  }

  // Con un encuentro en curso solo se muestra ese: las citas anteriores
  // quedan guardadas pero no estorban mientras dura la cita.
  const citaActiva = citas.find((c) => c.estado_manual === ESTADO_ACTIVA);

  if (citaActiva) {
    return (
      <div className="px-6 py-6 max-w-md mx-auto w-full">
        <EncuentroEnCurso
          key={citaActiva.id}
          cita={citaActiva}
          miId={perfil!.id}
          miRol={perfil!.rol as 'cliente' | 'proveedora'}
          onCambio={cargar}
        />
      </div>
    );
  }

  if (citas.length === 0) {
    return (
      <p className="py-10 px-6 text-center text-base text-vela-text-faint leading-relaxed">
        Todavia no tienes citas confirmadas. En cuanto confirmes el encuentro en el chat, aparecera aqui.
      </p>
    );
  }

  const esCliente = perfil!.rol === 'cliente';

  return (
    <div className="flex flex-col gap-3 px-6 py-6 max-w-md mx-auto w-full">
      {citas.map((c) => {
        const abierta = abiertas.includes(c.id);
        const cancelada = c.estado_manual === ESTADO_CANCELADA;
        const finalizada = c.estado_manual === ESTADO_FINALIZADA;
        const yaConfirme = esCliente ? c.cliente_inicio : c.proveedora_inicio;
        const otroYaConfirmo = esCliente ? c.proveedora_inicio : c.cliente_inicio;
        const yaCalifique = esCliente ? c.cliente_califico : c.proveedora_califico;

        // Cosas que necesitan que la persona haga algo.
        const requiereAccion =
          (finalizada && !yaCalifique) ||
          (!cancelada && !finalizada && !yaConfirme);

        const fechaCorta = new Date(c.hora_acordada).toLocaleString('es-SV', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        return (
          <div key={c.id} className={`overflow-hidden rounded-2xl border ${c.en_emergencia ? 'border-red-500 bg-red-500/5' : 'border-vela-line bg-vela-surface'}`}>
            <button
              type="button"
              onClick={() => alternar(c.id)}
              aria-expanded={abierta}
              className="flex w-full items-center gap-3 p-4 text-left min-h-[76px]"
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-vela-public text-lg font-extrabold text-white">
                {c.otraPersonaAlias.charAt(0).toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold italic text-vela-text">Con {c.otraPersonaAlias}</p>
                <p className="truncate text-sm text-vela-text-dim">{fechaCorta}</p>
                <p className="truncate text-sm text-vela-text-faint">📍 {c.lugar}</p>
              </div>

              <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-extrabold uppercase ${
                    cancelada
                      ? 'bg-red-500/20 text-red-400'
                      : finalizada
                        ? 'bg-white/10 text-vela-text-dim'
                        : 'bg-amber-500/20 text-amber-400'
                  }`}
                >
                  {cancelada ? 'Cancelada' : finalizada ? 'Finalizada' : 'Pendiente'}
                </span>
                {requiereAccion && (
                  <span className="rounded-full bg-vela-public px-2.5 py-0.5 text-[10px] font-extrabold text-white">
                    {!cancelada && !finalizada && !yaConfirme && otroYaConfirmo ? 'Te esperan' : 'Acción'}
                  </span>
                )}
              </div>

              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={`flex-shrink-0 text-vela-text-faint transition-transform ${abierta ? 'rotate-180' : ''}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {abierta && (
              <div className="border-t border-vela-line p-3">
                <CitaCard
                  cita={c}
                  miId={perfil!.id}
                  miRol={perfil!.rol as 'cliente' | 'proveedora'}
                  onConfirmarLlegada={confirmarLlegada}
                  onCancelar={cancelar}
                  onCambio={cargar}
                  procesando={procesandoId === c.id}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}