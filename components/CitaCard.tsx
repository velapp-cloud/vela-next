'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ESTADO_ACTIVA, ESTADO_CANCELADA, ESTADO_FINALIZADA } from '@/lib/citas/estados';
import {
  registrarEmergencia,
  desactivarEmergencia,
  avisarContactosEmergencia,
  ETIQUETA_MOTIVO,
  type MotivoEmergencia,
} from '@/lib/emergencia/activarPanico';
import { solicitarExtension, cancelarExtension, responderExtension } from '@/lib/citas/extension';
import { finalizarEncuentro, enviarCalificacion, omitirCalificacion } from '@/lib/citas/finalizar';
import { CHIPS_POSITIVOS, CHIPS_NEGATIVOS } from '@/lib/calificaciones/chipsCalificacion';
import { reproducirAlerta } from '@/lib/utils/sonidoAlerta';
import { IconoEncuentros, IconoDuracion, IconoLugar, IconoUbicacion, IconoRuta } from '@/components/iconos';

export type Cita = {
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
  otraPersonaAlias: string;
};

type Props = {
  cita: Cita;
  miId: string;
  miRol: 'cliente' | 'proveedora';
  onConfirmarLlegada: (citaId: string) => void;
  onCancelar: (citaId: string, motivo: string) => void;
  onCambio: () => void;
  procesando?: boolean;
};

const ETIQUETAS_ESTRELLAS = ['', 'Muy malo', 'Malo', 'Bueno', 'Muy bueno', 'Excelente'];
const COLOR_ESTRELLAS = ['', 'text-red-400', 'text-orange-400', 'text-amber-400', 'text-lime-400', 'text-emerald-400'];

function formatMinutos(min: number): string {
  if (min % 60 === 0) {
    const horas = min / 60;
    return `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  }
  return `${min} minutos`;
}

function useCuentaRegresiva(objetivoISO: string | null) {
  const [restante, setRestante] = useState('');
  const [terminado, setTerminado] = useState(false);
  const sonoRef = useRef(false);

  useEffect(() => {
    sonoRef.current = false;
    setTerminado(false);
    if (!objetivoISO) return;

    const interval = setInterval(() => {
      const ms = new Date(objetivoISO).getTime() - Date.now();
      if (ms <= 0) {
        setRestante('Tiempo cumplido');
        setTerminado(true);
        if (!sonoRef.current) {
          sonoRef.current = true;
          reproducirAlerta();
        }
        return;
      }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setRestante(`${h}h ${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [objetivoISO]);

  return { restante, terminado };
}

export default function CitaCard({ cita, miId, miRol, onConfirmarLlegada, onCancelar, onCambio, procesando }: Props) {
  const esCliente = miRol === 'cliente';
  const yaConfirme = esCliente ? cita.cliente_inicio : cita.proveedora_inicio;
  const otroYaConfirmo = esCliente ? cita.proveedora_inicio : cita.cliente_inicio;
  const activa = cita.estado_manual === ESTADO_ACTIVA;
  const cancelada = cita.estado_manual === ESTADO_CANCELADA;
  const finalizada = cita.estado_manual === ESTADO_FINALIZADA;
  const yaCalifique = esCliente ? cita.cliente_califico : cita.proveedora_califico;
  const contraparteId = miId === cita.cliente_id ? cita.proveedora_id : cita.cliente_id;

  const [vistaPanico, setVistaPanico] = useState(false);
  const [vistaOtroExtension, setVistaOtroExtension] = useState(false);
  const [horasManual, setHorasManual] = useState('');
  const [procesandoAccion, setProcesandoAccion] = useState(false);
  const [estrellas, setEstrellas] = useState(0);
  const [chipsSeleccionados, setChipsSeleccionados] = useState<string[]>([]);

  const hayPositivos = chipsSeleccionados.some((c) => (CHIPS_POSITIVOS as readonly string[]).includes(c));
  const hayNegativos = chipsSeleccionados.some((c) => (CHIPS_NEGATIVOS as readonly string[]).includes(c));

  const finEstimado =
    activa && cita.iniciada_en
      ? new Date(new Date(cita.iniciada_en).getTime() + (cita.duracion_horas * 60 + cita.extension_minutos_acumulados) * 60_000).toISOString()
      : null;
  const { restante, terminado } = useCuentaRegresiva(finEstimado);

  const fechaBonita = new Date(cita.hora_acordada).toLocaleString('es-SV', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  async function confirmarPanico(motivo: MotivoEmergencia) {
    setProcesandoAccion(true);
    const supabase = createClient();
    await registrarEmergencia(supabase, { citaId: cita.id, reportadoPor: miId, contraparteId, motivo });

    const mensaje = `🚨 Emergencia Vela: necesito ayuda ahora. Estoy en una cita con ${cita.otraPersonaAlias} en ${cita.lugar}${cita.direccion ? ` (${cita.direccion})` : ''}, del ${fechaBonita}. Por favor contáctame o busca ayuda ya.`;
    await avisarContactosEmergencia(supabase, miId, mensaje);

    setProcesandoAccion(false);
    setVistaPanico(false);
    onCambio();
  }

  async function onDesactivarPanico() {
    if (!window.confirm('¿Ya estás a salvo? Esto desactiva la alerta y desbloquea la app para la otra persona.')) return;
    setProcesandoAccion(true);
    await desactivarEmergencia(createClient(), cita.id);
    setProcesandoAccion(false);
    onCambio();
  }

  async function onSolicitarExtension(minutos: number) {
    setProcesandoAccion(true);
    await solicitarExtension(createClient(), cita.id, minutos);
    setProcesandoAccion(false);
    onCambio();
  }

  function onPedirOtro() {
    const horas = parseFloat(horasManual.replace(',', '.'));
    if (!horas || horas <= 0) return;
    onSolicitarExtension(Math.round(horas * 60));
    setVistaOtroExtension(false);
    setHorasManual('');
  }

  async function onCancelarExtension() {
    setProcesandoAccion(true);
    await cancelarExtension(createClient(), cita.id);
    setProcesandoAccion(false);
    onCambio();
  }

  async function onResponderExtension(aceptar: boolean) {
    setProcesandoAccion(true);
    await responderExtension(createClient(), {
      citaId: cita.id,
      aceptar,
      minutosPendientes: cita.extension_minutos_pendiente ?? 0,
      acumuladosActuales: cita.extension_minutos_acumulados,
    });
    setProcesandoAccion(false);
    onCambio();
  }

  async function onFinalizar() {
    if (!window.confirm('¿Finalizar este encuentro?')) return;
    setProcesandoAccion(true);
    await finalizarEncuentro(createClient(), cita.id);
    setProcesandoAccion(false);
    onCambio();
  }

  // Exclusividad: si ya hay chips de un grupo seleccionados, el grupo contrario queda bloqueado.
  function toggleChip(chip: string, esPositivo: boolean) {
    if (esPositivo && hayNegativos) return;
    if (!esPositivo && hayPositivos) return;
    setChipsSeleccionados((prev) => (prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]));
  }

  async function onEnviarCalificacion() {
    setProcesandoAccion(true);
    await enviarCalificacion(createClient(), {
      citaId: cita.id,
      calificadoPor: miId,
      calificadoA: contraparteId,
      estrellas,
      chips: chipsSeleccionados,
      soyCliente: esCliente,
    });
    setProcesandoAccion(false);
    onCambio();
  }

  async function onOmitirCalificacion() {
    setProcesandoAccion(true);
    await omitirCalificacion(createClient(), cita.id, esCliente);
    setProcesandoAccion(false);
    onCambio();
  }

  return (
    <div className={`rounded-3xl border p-5 ${cita.en_emergencia ? 'border-red-500 bg-red-500/5' : 'border-vela-line bg-vela-surface'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-extrabold italic text-vela-text">Con {cita.otraPersonaAlias}</span>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-extrabold uppercase ${
            cancelada
              ? 'bg-red-500/20 text-red-400'
              : finalizada
                ? 'bg-white/10 text-vela-text-dim'
                : activa
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-amber-500/20 text-amber-400'
          }`}
        >
          {cancelada ? 'Cancelada' : finalizada ? 'Finalizada' : activa ? 'En curso' : 'Pendiente'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-vela-text-dim">
        <span className="col-span-2 flex items-center gap-2 min-w-0">
          <IconoEncuentros size={18} className="flex-shrink-0 text-vela-text-faint" />
          <span>{fechaBonita}</span>
        </span>
        <span className="flex items-center gap-2 min-w-0">
          <IconoDuracion size={18} className="flex-shrink-0 text-vela-text-faint" />
          <span>{cita.duracion_horas}h{cita.extension_minutos_acumulados > 0 ? ` (+${formatMinutos(cita.extension_minutos_acumulados)})` : ''}</span>
        </span>
        <span className="flex items-center gap-2 min-w-0">
          <IconoLugar size={18} className="flex-shrink-0 text-vela-text-faint" />
          <span className="truncate">{cita.tipo_encuentro}</span>
        </span>
        <span className="col-span-2 flex items-center gap-2 min-w-0">
          <IconoUbicacion size={18} className="flex-shrink-0 text-vela-text-faint" />
          <span>{cita.lugar}</span>
        </span>
      </div>
      {cita.direccion && (
        <p className="mt-1 flex items-center gap-2 text-sm text-vela-text-dim">
          <IconoRuta size={18} className="flex-shrink-0 text-vela-text-faint" />
          <span>{cita.direccion}</span>
        </p>
      )}
      {cita.mensaje && <p className="mt-2 text-sm italic text-vela-text-dim">&ldquo;{cita.mensaje}&rdquo;</p>}

      {cancelada && cita.motivo_cancelacion && (
        <p className="mt-3 rounded-xl bg-vela-surface-2 p-3 text-sm text-vela-text-dim">
          Motivo: {cita.motivo_cancelacion}
        </p>
      )}

      {activa && (
        <>
          <p className={`mt-3 rounded-2xl p-3 text-center text-base font-bold ${terminado ? 'bg-amber-500/15 text-amber-500' : 'bg-blue-500/10 text-vela-text'}`}>
            {terminado ? 'El tiempo acordado se cumplió' : `Tiempo restante: ${restante || 'calculando...'}`}
          </p>

          {terminado && (
            <div className="mt-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 flex flex-col gap-3">
              {cita.extension_pendiente ? (
                esCliente ? (
                  <>
                    <p className="text-sm text-vela-text-dim text-center">
                      Esperando que {cita.otraPersonaAlias} responda tu solicitud de {formatMinutos(cita.extension_minutos_pendiente ?? 0)} más...
                    </p>
                    <button onClick={onCancelarExtension} disabled={procesandoAccion} className="w-full h-12 rounded-full border border-vela-line text-sm font-bold text-vela-text-dim disabled:opacity-50">
                      Cancelar petición
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-vela-text text-center font-semibold">
                      {cita.otraPersonaAlias} pide {formatMinutos(cita.extension_minutos_pendiente ?? 0)} más. ¿Aceptas?
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => onResponderExtension(false)} disabled={procesandoAccion} className="flex-1 h-12 rounded-full border border-vela-line text-sm font-bold text-vela-text-dim disabled:opacity-50">
                        Rechazar
                      </button>
                      <button onClick={() => onResponderExtension(true)} disabled={procesandoAccion} className="flex-1 h-12 rounded-full bg-vela-public text-sm font-bold text-white disabled:opacity-50">
                        Aceptar
                      </button>
                    </div>
                  </>
                )
              ) : esCliente ? (
                !vistaOtroExtension ? (
                  <>
                    <p className="text-sm text-vela-text-dim text-center">¿Necesitan más tiempo?</p>
                    <div className="flex gap-2">
                      <button onClick={() => onSolicitarExtension(30)} disabled={procesandoAccion} className="flex-1 h-12 rounded-full border border-vela-line text-sm font-bold text-vela-text disabled:opacity-50">
                        +30 min
                      </button>
                      <button onClick={() => onSolicitarExtension(60)} disabled={procesandoAccion} className="flex-1 h-12 rounded-full border border-vela-line text-sm font-bold text-vela-text disabled:opacity-50">
                        +1 hora
                      </button>
                      <button onClick={() => setVistaOtroExtension(true)} disabled={procesandoAccion} className="flex-1 h-12 rounded-full border border-vela-line text-sm font-bold text-vela-text disabled:opacity-50">
                        Otro
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={horasManual}
                        onChange={(e) => setHorasManual(e.target.value)}
                        placeholder="Ej. 2"
                        className="flex-1 min-w-0 bg-vela-surface border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none"
                      />
                      <span className="text-sm text-vela-text-dim">horas más</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setVistaOtroExtension(false); setHorasManual(''); }} className="flex-1 h-12 rounded-full border border-vela-line text-sm font-bold text-vela-text-dim">
                        Volver
                      </button>
                      <button
                        onClick={onPedirOtro}
                        disabled={procesandoAccion || !horasManual}
                        className="flex-1 h-12 rounded-full bg-vela-public text-sm font-bold text-white disabled:opacity-50"
                      >
                        Pedir
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <p className="text-sm text-vela-text-dim text-center">
                  Esperando que {cita.otraPersonaAlias} decida si necesitan más tiempo o finalizan.
                </p>
              )}
            </div>
          )}

          {!vistaPanico ? (
            <button
              onClick={() => setVistaPanico(true)}
              disabled={cita.en_emergencia}
              className="mt-3 w-full h-14 rounded-full bg-red-600 text-base font-extrabold text-white disabled:opacity-60"
            >
              {cita.en_emergencia ? '🚨 Alerta ya enviada' : '🚨 Botón de pánico'}
            </button>
          ) : (
            <div className="mt-3 rounded-2xl border border-red-500 bg-red-500/5 p-4">
              <p className="text-sm font-bold text-red-400 mb-3 text-center">
                ¿Qué está pasando? Toca una opción para avisar a tus contactos ya mismo:
              </p>
              <div className="grid grid-cols-1 gap-2">
                {(['fui_agredido', 'me_faltaron_respeto', 'cita_no_como_planeado', 'otro'] as MotivoEmergencia[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => confirmarPanico(m)}
                    disabled={procesandoAccion}
                    className="w-full h-12 rounded-full bg-red-600 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {ETIQUETA_MOTIVO[m]}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setVistaPanico(false)}
                disabled={procesandoAccion}
                className="mt-2 w-full min-h-11 text-sm text-vela-text-dim underline"
              >
                Cancelar
              </button>
            </div>
          )}

          {cita.en_emergencia && cita.en_emergencia_por === miId && (
            <button
              onClick={onDesactivarPanico}
              disabled={procesandoAccion}
              className="mt-2 w-full h-12 rounded-full border border-red-500 text-sm font-bold text-red-500 disabled:opacity-50"
            >
              Desactivar alerta de emergencia
            </button>
          )}

          <button
            onClick={onFinalizar}
            disabled={procesandoAccion}
            className="mt-3 w-full h-12 rounded-full border border-vela-line text-sm font-bold text-vela-text-dim disabled:opacity-50"
          >
            Detener / Finalizar encuentro
          </button>
        </>
      )}

      {finalizada && !yaCalifique && (
        <div className="mt-4 overflow-hidden rounded-3xl border border-vela-line bg-vela-surface-2">
          {/* Encabezado */}
          <div className="flex flex-col items-center gap-2 border-b border-vela-line bg-gradient-to-b from-amber-500/10 to-transparent px-4 pb-4 pt-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-vela-public text-xl font-extrabold text-white shadow-lg">
              {cita.otraPersonaAlias.charAt(0).toUpperCase()}
            </div>
            <p className="text-center text-base font-extrabold text-vela-text">
              ¿Cómo te fue con {cita.otraPersonaAlias}?
            </p>
            <p className="text-center text-xs text-vela-text-dim">Tu opinión es anónima y ayuda a mantener Vela segura</p>

            <div className="mt-1 flex justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setEstrellas(n)}
                  aria-label={`${n} estrellas`}
                  className={`text-4xl leading-none transition-transform active:scale-90 ${
                    n <= estrellas ? `${COLOR_ESTRELLAS[estrellas]} scale-110 drop-shadow` : 'text-vela-line'
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
            <p className={`h-4 text-sm font-extrabold ${estrellas > 0 ? COLOR_ESTRELLAS[estrellas] : 'text-vela-text-dim'}`}>
              {estrellas > 0 ? ETIQUETAS_ESTRELLAS[estrellas] : 'Toca una estrella'}
            </p>
          </div>

          <div className="flex flex-col gap-3 p-4">
            {/* Lo bueno */}
            <div
              className={`rounded-2xl border p-4 transition-opacity ${
                hayNegativos ? 'border-vela-line opacity-40' : 'border-emerald-500/30 bg-emerald-500/5'
              }`}
            >
              <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-emerald-500">
                <span>👍</span> Lo bueno
              </p>
              <div className="flex flex-wrap gap-2">
                {CHIPS_POSITIVOS.map((chip) => {
                  const sel = chipsSeleccionados.includes(chip);
                  return (
                    <button
                      key={chip}
                      onClick={() => toggleChip(chip, true)}
                      disabled={hayNegativos}
                      className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition-all ${
                        sel
                          ? 'border-emerald-500 bg-emerald-500 text-white shadow'
                          : 'border-emerald-500/40 text-emerald-500 active:scale-95'
                      } disabled:cursor-not-allowed`}
                    >
                      {sel && '✓ '}
                      {chip}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lo malo */}
            <div
              className={`rounded-2xl border p-4 transition-opacity ${
                hayPositivos ? 'border-vela-line opacity-40' : 'border-red-500/30 bg-red-500/5'
              }`}
            >
              <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-red-500">
                <span>👎</span> Lo malo
              </p>
              <div className="flex flex-wrap gap-2">
                {CHIPS_NEGATIVOS.map((chip) => {
                  const sel = chipsSeleccionados.includes(chip);
                  return (
                    <button
                      key={chip}
                      onClick={() => toggleChip(chip, false)}
                      disabled={hayPositivos}
                      className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition-all ${
                        sel
                          ? 'border-red-500 bg-red-500 text-white shadow'
                          : 'border-red-500/40 text-red-400 active:scale-95'
                      } disabled:cursor-not-allowed`}
                    >
                      {sel && '✓ '}
                      {chip}
                    </button>
                  );
                })}
              </div>
            </div>

            {(hayPositivos || hayNegativos) && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-vela-surface px-4 py-2.5">
                <p className="text-xs text-vela-text-dim">
                  {hayPositivos
                    ? 'Elegiste lo bueno, así que lo malo queda bloqueado.'
                    : 'Elegiste lo malo, así que lo bueno queda bloqueado.'}
                </p>
                <button
                  onClick={() => setChipsSeleccionados([])}
                  className="shrink-0 min-h-11 px-2 text-xs font-bold text-vela-public underline"
                >
                  Limpiar
                </button>
              </div>
            )}

            <button
              onClick={onEnviarCalificacion}
              disabled={procesandoAccion || estrellas === 0}
              className="w-full h-14 rounded-full bg-vela-public text-base font-extrabold text-white shadow-lg transition-opacity disabled:opacity-40"
            >
              {procesandoAccion ? 'Enviando...' : 'Enviar calificación'}
            </button>
            <button
              onClick={onOmitirCalificacion}
              disabled={procesandoAccion}
              className="w-full min-h-11 text-center text-sm font-semibold text-vela-text-dim underline disabled:opacity-50"
            >
              Solo finalizar sin calificar
            </button>
          </div>
        </div>
      )}

      {!cancelada && !finalizada && !activa && (
        <div className="mt-4 flex flex-col gap-3">
          {!yaConfirme && otroYaConfirmo && (
            <p className="rounded-xl bg-blue-500/10 p-3 text-center text-sm font-semibold text-blue-400">
              {cita.otraPersonaAlias} ya confirmó su llegada. Confirma tú para iniciar el encuentro.
            </p>
          )}
          <div className="flex gap-2">
            <button
              disabled={procesando || yaConfirme}
              onClick={() => onConfirmarLlegada(cita.id)}
              className="flex-1 h-14 rounded-full bg-vela-public text-base font-bold text-white disabled:opacity-50"
            >
              {yaConfirme
                ? otroYaConfirmo
                  ? 'Confirmado ✓'
                  : `Esperando a ${cita.otraPersonaAlias}...`
                : otroYaConfirmo
                  ? 'Confirmar y empezar'
                  : 'Confirmar mi llegada'}
            </button>
            <button
              disabled={procesando}
              onClick={() => {
                const motivo = window.prompt('¿Por qué quieres cancelar esta cita?');
                if (motivo) onCancelar(cita.id, motivo);
              }}
              className="h-14 rounded-full border border-vela-line px-5 text-base font-bold text-vela-text-dim disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}