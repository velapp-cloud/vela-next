'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { ESTADO_CANCELADA, ESTADO_FINALIZADA } from '@/lib/citas/estados';
import { confirmarCita } from '@/lib/citas/confirmar';
import {
  confirmarMiParte,
  cancelarParaReagendar,
  pedirCambiosCita,
} from '@/lib/citas/confirmarEncuentro';
import { cancelarCitaConMotivo } from '@/lib/citas/cancelarConMotivo';

// Pasado este margen desde la hora acordada, ya no se puede confirmar la cita.
const MARGEN_MINUTOS = 20;

const MOTIVO_OTRO = 'Otro';

const MOTIVOS_CANCELAR_CLIENTE = [
  'Surgió un imprevisto',
  'No coincidimos en horario',
  'No hubo acuerdo en el lugar',
  'Cambié de opinión',
  MOTIVO_OTRO,
];

const MOTIVOS_CANCELAR_PROVEEDORA = [
  'Surgió un imprevisto',
  'No coincidimos en horario',
  'No me siento cómoda con el lugar',
  'Me faltó el respeto',
  'Ya no me interesa',
  MOTIVO_OTRO,
];

type Cita = {
  id: string;
  chat_id: string;
  cliente_id: string;
  proveedora_id: string;
  lugar: string | null;
  hora_acordada: string | null;
  duracion_horas: number | null;
  tipo_encuentro: string | null;
  estado_manual: string | null;
  cliente_confirmo: boolean;
  proveedora_confirmo: boolean;
};

export default function CitaResumenChat({
  chatId,
  onPedirEditar,
}: {
  chatId: string;
  onPedirEditar?: () => void;
}) {
  const router = useRouter();
  const { perfil } = useSession();
  const supabase = createClient();

  const [cita, setCita] = useState<Cita | null>(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [vistaCancelar, setVistaCancelar] = useState(false);
  const [vistaPedirCambios, setVistaPedirCambios] = useState(false);
  const [textoCambios, setTextoCambios] = useState('');
  const [errorConfirmar, setErrorConfirmar] = useState('');
  const [version, setVersion] = useState(0);

  // Ventana de cancelación con motivo
  const [modalCancelar, setModalCancelar] = useState(false);
  const [motivoCancel, setMotivoCancel] = useState<string | null>(null);
  const [notaCancel, setNotaCancel] = useState('');
  const [errorCancel, setErrorCancel] = useState('');

  useEffect(() => {
    let activo = true;

    async function cargar() {
      const { data } = await supabase
        .from('citas')
        .select('id, chat_id, cliente_id, proveedora_id, lugar, hora_acordada, duracion_horas, tipo_encuentro, estado_manual, cliente_confirmo, proveedora_confirmo')
        .eq('chat_id', chatId)
        .order('hora_acordada', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (activo) {
        setCita(data ?? null);
        setCargando(false);
      }
    }
    cargar();

    const canal = supabase
      .channel(`cita-chat-${chatId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'citas', filter: `chat_id=eq.${chatId}` },
        () => cargar(),
      )
      .subscribe();

    return () => {
      activo = false;
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, version]);

  // Si el chat existe pero la cita no se alcanzó a crear, se puede preparar desde aquí.
  async function prepararCita() {
    setProcesando(true);
    setErrorConfirmar('');
    try {
      const { data: ch, error } = await supabase
        .from('chats')
        .select('cliente_id, proveedora_id, ficha_fecha, ficha_hora, ficha_duracion, ficha_lugar, ficha_tipo, ficha_mensaje')
        .eq('id', chatId)
        .single();
      if (error || !ch) throw error ?? new Error('Chat no encontrado');
      await confirmarCita(supabase, {
        chatId,
        clienteId: ch.cliente_id,
        proveedoraId: ch.proveedora_id,
        fichaFecha: ch.ficha_fecha,
        fichaHora: ch.ficha_hora,
        fichaDuracion: ch.ficha_duracion,
        fichaLugar: ch.ficha_lugar,
        fichaTipo: ch.ficha_tipo,
        fichaMensaje: ch.ficha_mensaje,
      });
      setVersion((v) => v + 1);
    } catch (e: any) {
      console.error('Error preparando la cita:', e?.message ?? e);
      setErrorConfirmar('No se pudo preparar la cita. Intenta de nuevo.');
    }
    setProcesando(false);
  }

  if (cargando || !perfil) return null;

  if (!cita) {
    return (
      <div className="mx-4 mt-4 mb-1 rounded-3xl border border-vela-line bg-vela-surface p-5">
        <p className="text-xs font-bold text-vela-text-faint uppercase tracking-wide mb-2">Cita acordada</p>
        <p className="text-sm text-vela-text-faint mb-4">
          La solicitud fue aceptada pero la cita todavía no está lista para confirmar.
        </p>
        {errorConfirmar && <p className="text-xs text-vela-safety mb-2">{errorConfirmar}</p>}
        <button
          onClick={prepararCita}
          disabled={procesando}
          className="w-full h-12 rounded-full bg-vela-public text-white text-sm font-bold disabled:opacity-50"
        >
          {procesando ? '...' : 'Preparar cita para confirmar'}
        </button>
      </div>
    );
  }

  if (cita.estado_manual === ESTADO_FINALIZADA) return null;

  const soyCliente = perfil.rol === 'cliente';
  const otroId = soyCliente ? cita.proveedora_id : cita.cliente_id;
  const yoConfirme = soyCliente ? cita.cliente_confirmo : cita.proveedora_confirmo;
  const otroConfirmo = soyCliente ? cita.proveedora_confirmo : cita.cliente_confirmo;
  const citaConfirmada = cita.cliente_confirmo && cita.proveedora_confirmo;
  const finalizada = cita.estado_manual === ESTADO_FINALIZADA;
  const cancelada = cita.estado_manual === ESTADO_CANCELADA;
  const motivosCancelar = soyCliente ? MOTIVOS_CANCELAR_CLIENTE : MOTIVOS_CANCELAR_PROVEEDORA;

  const fechaTexto = cita.hora_acordada
    ? new Date(cita.hora_acordada).toLocaleString('es-SV', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : 'Sin definir';

  /**
   * Si la cita ya está fuera de hora (más de 20 minutos después de la hora
   * acordada) devuelve el aviso que se le muestra a la persona; si todavía
   * está a tiempo devuelve null.
   */
  function avisoFueraDeHora(): string | null {
    if (!cita!.hora_acordada) return null;
    const horaCita = new Date(cita!.hora_acordada);
    if (Date.now() - horaCita.getTime() <= MARGEN_MINUTOS * 60_000) return null;

    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);
    const diaCita = new Date(horaCita);
    diaCita.setHours(0, 0, 0, 0);

    const quien = soyCliente
      ? 'Toca "Editar" en los detalles acordados para cambiarlo.'
      : 'Pídele al cliente que lo cambie con "Cancelar → Pedir cambios en la cita".';

    if (diaCita.getTime() < inicioHoy.getTime()) {
      return `No se puede confirmar: la fecha de esta cita (${fechaTexto}) ya pasó. Debes cambiar el día y la hora. ${quien}`;
    }
    const horaTexto = horaCita.toLocaleTimeString('es-SV', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `No se puede confirmar: ya pasaron más de ${MARGEN_MINUTOS} minutos de la hora acordada (${horaTexto}). Debes cambiar la hora. ${quien}`;
  }

  function cerrarSubmenus() {
    setVistaCancelar(false);
    setVistaPedirCambios(false);
    setTextoCambios('');
  }

  function cerrarModalCancelar() {
    setModalCancelar(false);
    setMotivoCancel(null);
    setNotaCancel('');
    setErrorCancel('');
  }

  async function onConfirmar() {
    setErrorConfirmar('');

    const fuera = avisoFueraDeHora();
    if (fuera) {
      setErrorConfirmar(fuera);
      window.alert(fuera);
      return;
    }

    setProcesando(true);
    const r = await confirmarMiParte(supabase, cita!.id, soyCliente);
    setProcesando(false);
    if (r.choque) {
      const msg = r.choque === 'yo'
        ? 'Ya tienes un evento reservado a esa hora. No se pudo confirmar este encuentro.'
        : 'El otro perfil ya tiene un evento reservado a esa hora. No se pudo confirmar este encuentro.';
      setErrorConfirmar(msg);
      window.alert(msg);
    } else if (r.error) {
      setErrorConfirmar('No se pudo confirmar. Intenta de nuevo.');
    }
  }

  async function onReagendar() {
    setProcesando(true);
    await cancelarParaReagendar(supabase, cita!.id, chatId, otroId);
    setProcesando(false);
    cerrarSubmenus();
    onPedirEditar?.();
  }

  async function onEnviarPedidoCambios() {
    if (!textoCambios.trim()) return;
    setProcesando(true);
    await pedirCambiosCita(supabase, {
      citaId: cita!.id,
      chatId,
      otroId,
      miAlias: perfil!.alias,
      mensaje: textoCambios.trim(),
    });
    setProcesando(false);
    cerrarSubmenus();
  }

  async function onConfirmarCancelacion() {
    if (!motivoCancel || procesando) return;
    if (motivoCancel === MOTIVO_OTRO && !notaCancel.trim()) {
      setErrorCancel('Escribe el motivo.');
      return;
    }
    setProcesando(true);
    setErrorCancel('');
    const motivo = motivoCancel === MOTIVO_OTRO ? `Otro: ${notaCancel.trim()}` : motivoCancel;
    const r = await cancelarCitaConMotivo(supabase, {
      citaId: cita!.id,
      chatId,
      miId: perfil!.id,
      otroId,
      miAlias: perfil!.alias,
      motivo,
    });
    setProcesando(false);
    if (!r.ok) {
      setErrorCancel(r.error);
      return;
    }
    cerrarModalCancelar();
    cerrarSubmenus();
  }

  return (
    <>
      <div className="mx-4 mt-4 mb-1 rounded-3xl border border-vela-line bg-vela-surface p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-vela-text-faint uppercase tracking-wide">Cita acordada</p>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-vela-public/15 text-vela-public">
            {cancelada ? 'Cancelada' : finalizada ? 'Finalizada' : citaConfirmada ? 'Confirmada' : 'Pendiente de confirmar'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm text-vela-text-dim mb-4">
          <p className="col-span-2">📅 {fechaTexto}</p>
          <p>⏱️ {cita.duracion_horas ? `${cita.duracion_horas} h` : '—'}</p>
          <p>🎯 {cita.tipo_encuentro ?? '—'}</p>
          <p className="col-span-2">📍 {cita.lugar ?? '—'}</p>
        </div>

        {cancelada && (
          <p className="text-xs text-vela-safety text-center">Esta cita fue cancelada.</p>
        )}

        {!cancelada && citaConfirmada && (
          <button
            onClick={() => router.push('/encuentro')}
            className="w-full h-12 rounded-full bg-vela-public text-white text-sm font-bold"
          >
            Ver en Encuentro →
          </button>
        )}

        {!cancelada && !citaConfirmada && !vistaCancelar && !vistaPedirCambios && (
          <div className="flex flex-col gap-3">
            {yoConfirme ? (
              <p className="text-xs text-vela-text-faint text-center">
                Ya confirmaste. Esperando que el otro perfil confirme también...
              </p>
            ) : otroConfirmo ? (
              <p className="text-xs text-vela-public text-center font-semibold">
                El otro perfil ya confirmó. ¡Confirma tú para activar la cita!
              </p>
            ) : null}

            {errorConfirmar && (
              <p className="rounded-xl border border-vela-safety bg-vela-safety-soft p-3 text-center text-xs font-semibold text-vela-safety">
                {errorConfirmar}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setVistaCancelar(true)}
                disabled={procesando}
                className="flex-1 h-12 rounded-full bg-vela-surface-2 border border-vela-line text-vela-text-faint text-sm font-bold disabled:opacity-50"
              >
                Cancelar
              </button>
              {!yoConfirme && (
                <button
                  onClick={onConfirmar}
                  disabled={procesando}
                  className="flex-1 h-12 rounded-full bg-vela-public text-white text-sm font-bold disabled:opacity-50"
                >
                  {procesando ? '...' : 'Confirmar encuentro'}
                </button>
              )}
            </div>
          </div>
        )}

        {!cancelada && !citaConfirmada && vistaCancelar && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-vela-text-faint text-center">
              ¿Qué quieres hacer?
            </p>
            {soyCliente ? (
              <button
                onClick={onReagendar}
                disabled={procesando}
                className="w-full h-12 rounded-full bg-vela-surface-2 border border-vela-line text-vela-text text-sm font-bold disabled:opacity-50"
              >
                Reagendar (cambiar fecha/hora/lugar)
              </button>
            ) : (
              <button
                onClick={() => { setVistaCancelar(false); setVistaPedirCambios(true); }}
                disabled={procesando}
                className="w-full h-12 rounded-full bg-vela-surface-2 border border-vela-line text-vela-text text-sm font-bold disabled:opacity-50"
              >
                Pedir cambios en la cita
              </button>
            )}
            <button
              onClick={() => setModalCancelar(true)}
              disabled={procesando}
              className="w-full h-12 rounded-full bg-vela-safety-soft border border-vela-safety text-vela-safety text-sm font-bold disabled:opacity-50"
            >
              Cancelar y terminar la conversación
            </button>
            <button
              onClick={cerrarSubmenus}
              className="min-h-11 text-xs text-vela-text-faint underline self-center"
            >
              Volver
            </button>
          </div>
        )}

        {!cancelada && !citaConfirmada && vistaPedirCambios && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-vela-text-faint">
              Escribe qué te gustaría cambiar (fecha, hora, lugar, etc.). Se lo mandamos al cliente para que lo actualice.
            </p>
            <textarea
              value={textoCambios}
              onChange={(e) => setTextoCambios(e.target.value)}
              rows={3}
              placeholder="Ej. ¿Podemos cambiar la hora a las 6pm y el lugar a...?"
              className="w-full bg-vela-surface-2 border border-vela-line rounded-2xl px-4 py-3 text-base text-vela-text outline-none resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={cerrarSubmenus}
                className="flex-1 h-12 rounded-full bg-vela-surface-2 border border-vela-line text-vela-text-faint text-sm font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={onEnviarPedidoCambios}
                disabled={procesando || !textoCambios.trim()}
                className="flex-1 h-12 rounded-full bg-vela-public text-white text-sm font-bold disabled:opacity-50"
              >
                {procesando ? '...' : 'Enviar pedido'}
              </button>
            </div>
          </div>
        )}
      </div>

      {modalCancelar && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50">
          <div className="bg-vela-bg border border-vela-line rounded-t-[28px] sm:rounded-[28px] max-w-md w-full max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-bold text-vela-text">¿Seguro que quieres cancelar la cita?</h2>
              <p className="mt-2 text-sm text-vela-text-faint">
                El chat se cerrará. Para volver a hablar, el cliente tendrá que enviar una solicitud nueva. La otra persona verá el motivo.
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-vela-text-faint mb-2">¿Por qué cancelas?</p>
              <div className="flex flex-wrap gap-2">
                {motivosCancelar.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setMotivoCancel(m); setErrorCancel(''); }}
                    className={`px-4 py-2.5 rounded-full text-sm font-medium border ${
                      motivoCancel === m ? 'bg-vela-public-soft border-vela-public text-vela-public' : 'bg-vela-surface-2 border-vela-line text-vela-text-faint'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {motivoCancel === MOTIVO_OTRO && (
              <textarea
                value={notaCancel}
                onChange={(e) => setNotaCancel(e.target.value)}
                rows={3}
                placeholder="Cuéntanos el motivo"
                className="w-full bg-vela-surface-2 border border-vela-line rounded-2xl px-4 py-3 text-base text-vela-text outline-none resize-none"
              />
            )}

            {errorCancel && <p className="text-sm text-vela-safety">{errorCancel}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={cerrarModalCancelar}
                disabled={procesando}
                className="flex-1 h-14 rounded-full bg-vela-surface-2 border border-vela-line text-vela-text font-bold text-base disabled:opacity-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={onConfirmarCancelacion}
                disabled={!motivoCancel || procesando}
                className="flex-1 h-14 rounded-full bg-vela-safety text-white font-bold text-base disabled:opacity-50"
              >
                {procesando ? 'Cancelando...' : 'Sí, cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}