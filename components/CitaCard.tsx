'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { ESTADO_ACTIVA, ESTADO_CANCELADA, ESTADO_FINALIZADA } from '@/lib/citas/estados';
import {
  registrarEmergencia,
  avisarContactosPorSms,
} from '@/lib/emergencia/activarPanico';
import { seguirConLaCita, cancelarPorEmergencia } from '@/lib/emergencia/resolverEmergencia';
import { solicitarExtension, cancelarExtension, responderExtension } from '@/lib/citas/extension';
import { finalizarEncuentro, enviarCalificacion, omitirCalificacion } from '@/lib/citas/finalizar';
import { reproducirAlerta } from '@/lib/utils/sonidoAlerta';
import { ahoraServidor, sincronizarHoraServidor } from '@/lib/utils/horaServidor';
import PanelCalificacion from '@/components/PanelCalificacion';
import ModalDesactivarEmergencia from '@/components/ModalDesactivarEmergencia';
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

/** Avisos rápidos que se pueden mandar a la otra persona cuando la cita está por empezar. */
const AVISOS_RAPIDOS: { tipo: 'tarde' | 'casi' | 'cancelar'; texto: string }[] = [
  { tipo: 'tarde', texto: 'Voy tarde, espérame' },
  { tipo: 'casi', texto: 'Ya casi llego' },
  { tipo: 'cancelar', texto: 'Cambio de planes: cancela la cita, luego te contacto' },
];

function formatMinutos(min: number): string {
  if (min % 60 === 0) {
    const horas = min / 60;
    return `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  }
  return `${min} minutos`;
}

function formatoRestante(totalSegundos: number): string {
  const total = Math.max(0, Math.floor(totalSegundos));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h ${m}m ${s}s`;
}

/**
 * Cuenta regresiva medida con la hora del SERVIDOR (las dos personas ven el mismo tiempo).
 * Con una alerta activa el conteo se detiene y muestra el tiempo que quedaba al activarla.
 */
function useCuentaRegresiva(objetivoISO: string | null, congelado: boolean, segundosCongelados: number | null) {
  const [restante, setRestante] = useState('');
  const [terminado, setTerminado] = useState(false);
  const sonoRef = useRef(false);

  useEffect(() => {
    sonoRef.current = false;
    setTerminado(false);

    if (congelado) {
      setRestante(segundosCongelados == null ? '' : formatoRestante(segundosCongelados));
      return;
    }
    if (!objetivoISO) return;

    const objetivo = new Date(objetivoISO).getTime();
    let activo = true;
    let intervalo: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      const ms = objetivo - ahoraServidor();
      if (ms <= 0) {
        setRestante('Tiempo cumplido');
        setTerminado(true);
        if (!sonoRef.current) {
          sonoRef.current = true;
          reproducirAlerta();
        }
        return;
      }
      setTerminado(false);
      setRestante(formatoRestante(ms / 1000));
    };

    sincronizarHoraServidor().finally(() => {
      if (!activo) return;
      tick();
      intervalo = setInterval(tick, 1000);
    });

    return () => {
      activo = false;
      if (intervalo) clearInterval(intervalo);
    };
  }, [objetivoISO, congelado, segundosCongelados]);

  return { restante, terminado };
}

export default function CitaCard({ cita, miId, miRol, onConfirmarLlegada, onCancelar, onCambio, procesando }: Props) {
  const { perfil } = useSession();
  const esCliente = miRol === 'cliente';
  const yaConfirme = esCliente ? cita.cliente_inicio : cita.proveedora_inicio;
  const otroYaConfirmo = esCliente ? cita.proveedora_inicio : cita.cliente_inicio;
  const activa = cita.estado_manual === ESTADO_ACTIVA;
  const cancelada = cita.estado_manual === ESTADO_CANCELADA;
  const finalizada = cita.estado_manual === ESTADO_FINALIZADA;
  const pendiente = !activa && !cancelada && !finalizada;
  const yaCalifique = esCliente ? cita.cliente_califico : cita.proveedora_califico;
  const contraparteId = miId === cita.cliente_id ? cita.proveedora_id : cita.cliente_id;

  const [confirmandoPanico, setConfirmandoPanico] = useState(false);
  const [vistaOtroExtension, setVistaOtroExtension] = useState(false);
  const [horasManual, setHorasManual] = useState('');
  const [procesandoAccion, setProcesandoAccion] = useState(false);
  const [avisoSms, setAvisoSms] = useState('');
  const [segundosCongelados, setSegundosCongelados] = useState<number | null>(null);
  const [desactivando, setDesactivando] = useState(false);
  const [errorDesactivar, setErrorDesactivar] = useState('');

  // Aviso de "tu cita está por empezar" + avisos rápidos
  const [ahoraMs, setAhoraMs] = useState(() => Date.now());
  const [enviandoAviso, setEnviandoAviso] = useState<string | null>(null);
  const [avisosEnviados, setAvisosEnviados] = useState<string[]>([]);
  const [errorAviso, setErrorAviso] = useState('');

  const finEstimado =
    activa && cita.iniciada_en
      ? new Date(new Date(cita.iniciada_en).getTime() + (cita.duracion_horas * 60 + cita.extension_minutos_acumulados) * 60_000).toISOString()
      : null;
  const congelado = activa && !!cita.en_emergencia;
  const { restante, terminado } = useCuentaRegresiva(finEstimado, congelado, segundosCongelados);

  // Reloj (hora del servidor) mientras la cita está pendiente de iniciar.
  useEffect(() => {
    if (!pendiente) return;
    let activo = true;
    sincronizarHoraServidor().finally(() => { if (activo) setAhoraMs(ahoraServidor()); });
    const t = setInterval(() => setAhoraMs(ahoraServidor()), 15_000);
    return () => {
      activo = false;
      clearInterval(t);
    };
  }, [pendiente]);

  const minutosFaltan = Math.ceil((new Date(cita.hora_acordada).getTime() - ahoraMs) / 60_000);
  // Desde 15 minutos antes y hasta 30 minutos después de la hora acordada.
  const mostrarAvisoInicio = pendiente && minutosFaltan <= 15 && minutosFaltan >= -30;

  // Con alerta activa: tiempo que quedaba cuando se activó (lo guardó el servidor).
  useEffect(() => {
    if (!cita.en_emergencia) {
      setSegundosCongelados(null);
      return;
    }
    let activo = true;
    (async () => {
      const { data } = await createClient()
        .from('citas')
        .select('emergencia_restante_segundos, emergencia_iniciada_en')
        .eq('id', cita.id)
        .maybeSingle();
      if (!activo || !data) return;
      if (data.emergencia_restante_segundos != null) {
        setSegundosCongelados(data.emergencia_restante_segundos);
        return;
      }
      if (data.emergencia_iniciada_en && finEstimado) {
        const ms = new Date(finEstimado).getTime() - new Date(data.emergencia_iniciada_en).getTime();
        setSegundosCongelados(Math.max(0, Math.floor(ms / 1000)));
      }
    })();
    return () => {
      activo = false;
    };
  }, [cita.en_emergencia, cita.id, finEstimado]);

  const fechaBonita = new Date(cita.hora_acordada).toLocaleString('es-SV', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  async function enviarAviso(tipo: 'tarde' | 'casi' | 'cancelar') {
    if (enviandoAviso) return;
    setEnviandoAviso(tipo);
    setErrorAviso('');
    const { data, error } = await createClient().rpc('avisar_cita', { p_cita_id: cita.id, p_tipo: tipo });
    if (error || !data?.ok) {
      setErrorAviso('No se pudo enviar el aviso. Intenta de nuevo.');
    } else {
      setAvisosEnviados((prev) => (prev.includes(tipo) ? prev : [...prev, tipo]));
    }
    setEnviandoAviso(null);
  }

  // Un solo clic en el botón + una confirmación: la alerta sale al instante, sin abrir ninguna otra app.
  async function enviarAlertaYa() {
    setProcesandoAccion(true);
    setAvisoSms('');
    const supabase = createClient();
    try {
      const { yaActiva } = await registrarEmergencia(supabase, {
        citaId: cita.id,
        reportadoPor: miId,
        contraparteId,
        motivo: 'otro',
      });

      if (!yaActiva) {
        const r = await avisarContactosPorSms(supabase, cita.id);
        if (r === null || (r.total > 0 && r.enviados === 0)) {
          setAvisoSms('No se pudo enviar el SMS a tus contactos. La alerta sí quedó activada.');
        } else if (r.total === 0) {
          setAvisoSms('No tienes contactos de emergencia configurados, por eso no se envió ningún SMS.');
        } else if (r.enviados === r.total) {
          setAvisoSms(`Se avisó por SMS a ${r.enviados} ${r.enviados === 1 ? 'contacto' : 'contactos'}.`);
        } else {
          setAvisoSms(`Se avisó por SMS a ${r.enviados} de ${r.total} contactos.`);
        }
      }
    } catch (err) {
      console.error('Error activando la alerta de pánico:', err);
      setAvisoSms('No se pudo activar la alerta. Intenta de nuevo.');
    }
    setProcesandoAccion(false);
    setConfirmandoPanico(false);
    onCambio();
  }

  // Desactivar: se elige seguir o cancelar la cita, y en los dos casos se da el motivo.
  async function resolverEmergencia(accion: 'seguir' | 'cancelar', motivo: string) {
    setProcesandoAccion(true);
    setErrorDesactivar('');
    const datos = { citaId: cita.id, miId, miAlias: perfil?.alias ?? 'Alguien', motivo };
    const supabase = createClient();
    const r = accion === 'seguir'
      ? await seguirConLaCita(supabase, datos)
      : await cancelarPorEmergencia(supabase, datos);
    setProcesandoAccion(false);
    if (!r.ok) {
      setErrorDesactivar(r.error);
      return;
    }
    setDesactivando(false);
    setAvisoSms('');
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

  // Botón "Detener / Finalizar": abre la ventana de calificación; la cita se finaliza al calificar u omitir.
  const [calificandoAlFinalizar, setCalificandoAlFinalizar] = useState(false);

  async function finalizarYCalificar(estrellas: number, chips: string[]) {
    setProcesandoAccion(true);
    const supabase = createClient();
    await finalizarEncuentro(supabase, cita.id);
    await enviarCalificacion(supabase, {
      citaId: cita.id,
      calificadoPor: miId,
      calificadoA: contraparteId,
      estrellas,
      chips,
      soyCliente: esCliente,
    });
    setProcesandoAccion(false);
    setCalificandoAlFinalizar(false);
    onCambio();
  }

  async function finalizarSinCalificar() {
    setProcesandoAccion(true);
    const supabase = createClient();
    await finalizarEncuentro(supabase, cita.id);
    await omitirCalificacion(supabase, cita.id, esCliente);
    setProcesandoAccion(false);
    setCalificandoAlFinalizar(false);
    onCambio();
  }

  // Cita ya finalizada por la otra persona: me toca calificar (o cerrar sin calificar).
  async function calificarDespues(estrellas: number, chips: string[]) {
    setProcesandoAccion(true);
    await enviarCalificacion(createClient(), {
      citaId: cita.id,
      calificadoPor: miId,
      calificadoA: contraparteId,
      estrellas,
      chips,
      soyCliente: esCliente,
    });
    setProcesandoAccion(false);
    onCambio();
  }

  async function omitirDespues() {
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
          <p
            className={`mt-3 rounded-2xl p-3 text-center text-base font-bold ${
              congelado
                ? 'bg-red-500/10 text-red-500'
                : terminado
                  ? 'bg-amber-500/15 text-amber-500'
                  : 'bg-blue-500/10 text-vela-text'
            }`}
          >
            {congelado
              ? `Alerta activada · tiempo detenido: ${restante || '...'}`
              : terminado
                ? 'El tiempo acordado se cumplió'
                : `Tiempo restante: ${restante || 'calculando...'}`}
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

          {!confirmandoPanico ? (
            <button
              onClick={() => setConfirmandoPanico(true)}
              disabled={cita.en_emergencia}
              className="mt-3 w-full h-14 rounded-full bg-red-600 text-base font-extrabold text-white disabled:opacity-60"
            >
              {cita.en_emergencia ? '🚨 Alerta ya enviada' : '🚨 Botón de pánico'}
            </button>
          ) : (
            <div className="mt-3 rounded-2xl border border-red-500 bg-red-500/5 p-4">
              <p className="mb-1 text-center text-base font-extrabold text-red-400">¿Enviar la alerta ahora?</p>
              <p className="mb-3 text-center text-sm text-vela-text-dim">
                Se avisará de inmediato a tus contactos de emergencia por SMS.
              </p>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={enviarAlertaYa}
                  disabled={procesandoAccion}
                  className="w-full h-14 rounded-full bg-red-600 text-base font-extrabold text-white disabled:opacity-60"
                >
                  {procesandoAccion ? 'Enviando alerta...' : 'Sí, enviar alerta'}
                </button>
                <button
                  onClick={() => setConfirmandoPanico(false)}
                  disabled={procesandoAccion}
                  className="w-full min-h-11 text-center text-sm text-vela-text-dim underline"
                >
                  No, cancelar
                </button>
              </div>
            </div>
          )}

          {avisoSms && <p className="mt-2 text-center text-sm text-vela-text-dim">{avisoSms}</p>}

          {cita.en_emergencia && cita.en_emergencia_por === miId && (
            <button
              onClick={() => { setErrorDesactivar(''); setDesactivando(true); }}
              disabled={procesandoAccion}
              className="mt-2 w-full h-12 rounded-full border border-red-500 text-sm font-bold text-red-500 disabled:opacity-50"
            >
              Desactivar alerta de emergencia
            </button>
          )}

          <button
            onClick={() => setCalificandoAlFinalizar(true)}
            disabled={procesandoAccion}
            className="mt-3 w-full h-12 rounded-full border border-vela-line text-sm font-bold text-vela-text-dim disabled:opacity-50"
          >
            Detener / Finalizar encuentro
          </button>

          {calificandoAlFinalizar && (
            <PanelCalificacion
              alias={cita.otraPersonaAlias}
              procesando={procesandoAccion}
              onEnviar={finalizarYCalificar}
              onOmitir={finalizarSinCalificar}
              onVolver={() => setCalificandoAlFinalizar(false)}
            />
          )}

          {desactivando && (
            <ModalDesactivarEmergencia
              aliasOtra={cita.otraPersonaAlias}
              procesando={procesandoAccion}
              error={errorDesactivar}
              onSeguir={(m) => resolverEmergencia('seguir', m)}
              onCancelarCita={(m) => resolverEmergencia('cancelar', m)}
              onVolver={() => { if (!procesandoAccion) setDesactivando(false); }}
            />
          )}
        </>
      )}

      {/* La otra persona ya finalizó: ventana para calificar (o cerrar sin calificar) */}
      {finalizada && !yaCalifique && (
        <PanelCalificacion
          alias={cita.otraPersonaAlias}
          procesando={procesandoAccion}
          onEnviar={calificarDespues}
          onOmitir={omitirDespues}
        />
      )}

      {pendiente && (
        <div className="mt-4 flex flex-col gap-3">
          {/* Falta poco para la cita: avisos rápidos para la otra persona */}
          {mostrarAvisoInicio && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
              <p className="text-center text-sm font-extrabold text-amber-500">
                {minutosFaltan > 0
                  ? `Tu cita con ${cita.otraPersonaAlias} empieza en ${minutosFaltan} min`
                  : `Tu cita con ${cita.otraPersonaAlias} ya debía empezar`}
              </p>
              <p className="mt-1 text-center text-xs text-vela-text-dim">
                ¿Vas con retraso o cambió algo? Avísale con un toque:
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {AVISOS_RAPIDOS.map((a) => {
                  const enviado = avisosEnviados.includes(a.tipo);
                  return (
                    <button
                      key={a.tipo}
                      onClick={() => enviarAviso(a.tipo)}
                      disabled={!!enviandoAviso || enviado}
                      className={`min-h-12 rounded-2xl border px-4 py-2 text-sm font-semibold ${
                        enviado
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-500'
                          : 'border-vela-line bg-vela-surface text-vela-text'
                      } disabled:opacity-70`}
                    >
                      {enviado ? '✓ Avisado: ' : enviandoAviso === a.tipo ? 'Enviando... ' : ''}
                      {a.texto}
                    </button>
                  );
                })}
              </div>
              {errorAviso && <p className="mt-2 text-center text-xs text-red-400">{errorAviso}</p>}
            </div>
          )}

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