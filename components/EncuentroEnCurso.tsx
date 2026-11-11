'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { resolverFotoUrl } from '@/lib/perfiles/resolverFoto';
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
import type { Cita } from '@/components/CitaCard';

type Props = {
  cita: Cita;
  miId: string;
  miRol: 'cliente' | 'proveedora';
  onCambio: () => void;
};

type OtraPersona = {
  avatar_color: string;
  foto_url: string | null;
  verificado: boolean;
};

function formatMinutos(min: number): string {
  if (min % 60 === 0) {
    const horas = min / 60;
    return `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  }
  return `${min} minutos`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatoReloj(totalSegundos: number): string {
  const total = Math.max(0, Math.floor(totalSegundos));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Cuenta regresiva medida con la hora del SERVIDOR (así las dos personas ven el mismo tiempo,
 * aunque sus celulares tengan la hora distinta). Si hay una alerta activa, el conteo se detiene
 * y muestra el tiempo que quedaba en el momento de la alerta.
 */
function useCuentaRegresiva(objetivoISO: string | null, congelado: boolean, segundosCongelados: number | null) {
  const [restante, setRestante] = useState('--:--:--');
  const [terminado, setTerminado] = useState(false);
  const sonoRef = useRef(false);

  useEffect(() => {
    sonoRef.current = false;
    setTerminado(false);

    if (congelado) {
      setRestante(segundosCongelados == null ? '--:--:--' : formatoReloj(segundosCongelados));
      return;
    }
    if (!objetivoISO) return;

    const objetivo = new Date(objetivoISO).getTime();
    let activo = true;
    let intervalo: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      const ms = objetivo - ahoraServidor();
      if (ms <= 0) {
        setRestante('00:00:00');
        setTerminado(true);
        if (!sonoRef.current) {
          sonoRef.current = true;
          reproducirAlerta();
        }
        return;
      }
      setTerminado(false);
      setRestante(formatoReloj(ms / 1000));
    };

    // Primero se mide la diferencia con el servidor y después arranca el conteo.
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

export default function EncuentroEnCurso({ cita, miId, miRol, onCambio }: Props) {
  const { perfil } = useSession();
  const esCliente = miRol === 'cliente';
  const contraparteId = cita.cliente_id === miId ? cita.proveedora_id : cita.cliente_id;

  const [otra, setOtra] = useState<OtraPersona | null>(null);
  const [totalContactos, setTotalContactos] = useState<number | null>(null);
  const [confirmandoPanico, setConfirmandoPanico] = useState(false);
  const [calificando, setCalificando] = useState(false);
  const [vistaOtroExtension, setVistaOtroExtension] = useState(false);
  const [horasManual, setHorasManual] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [avisoSms, setAvisoSms] = useState('');
  const [segundosCongelados, setSegundosCongelados] = useState<number | null>(null);
  const [desactivando, setDesactivando] = useState(false);
  const [errorDesactivar, setErrorDesactivar] = useState('');

  const finEstimado = cita.iniciada_en
    ? new Date(
        new Date(cita.iniciada_en).getTime() +
          (cita.duracion_horas * 60 + cita.extension_minutos_acumulados) * 60_000,
      ).toISOString()
    : null;

  const congelado = !!cita.en_emergencia;
  const { restante, terminado } = useCuentaRegresiva(finEstimado, congelado, segundosCongelados);

  const fechaBonita = new Date(cita.hora_acordada).toLocaleString('es-SV', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  useEffect(() => {
    let activo = true;
    (async () => {
      const supabase = createClient();

      const { data: perfilOtra } = await supabase
        .from('perfiles_publicos')
        .select('avatar_color, fotos, verificado')
        .eq('id', contraparteId)
        .maybeSingle();

      const { count } = await supabase
        .from('contactos_emergencia')
        .select('*', { count: 'exact', head: true })
        .eq('usuario_id', miId);

      if (!activo) return;
      setOtra({
        avatar_color: perfilOtra?.avatar_color ?? '#D91F3A',
        foto_url:
          perfilOtra?.fotos && perfilOtra.fotos.length > 0
            ? resolverFotoUrl(supabase, perfilOtra.fotos[0])
            : null,
        verificado: !!perfilOtra?.verificado,
      });
      setTotalContactos(count ?? 0);
    })();
    return () => {
      activo = false;
    };
  }, [contraparteId, miId]);

  // Con una alerta activa, se lee el tiempo que quedaba cuando se activó (lo guardó el servidor).
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
      // Alertas anteriores a este cambio: se calcula con la hora de inicio de la alerta.
      if (data.emergencia_iniciada_en && finEstimado) {
        const ms = new Date(finEstimado).getTime() - new Date(data.emergencia_iniciada_en).getTime();
        setSegundosCongelados(Math.max(0, Math.floor(ms / 1000)));
      }
    })();
    return () => {
      activo = false;
    };
  }, [cita.en_emergencia, cita.id, finEstimado]);

  // Un solo clic en el botón + una confirmación: la alerta sale al instante, sin abrir ninguna otra app.
  async function enviarAlertaYa() {
    setProcesando(true);
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
    setProcesando(false);
    setConfirmandoPanico(false);
    onCambio();
  }

  // Desactivar: se elige seguir o cancelar la cita, y en los dos casos se da el motivo.
  async function resolverEmergencia(accion: 'seguir' | 'cancelar', motivo: string) {
    setProcesando(true);
    setErrorDesactivar('');
    const datos = { citaId: cita.id, miId, miAlias: perfil?.alias ?? 'Alguien', motivo };
    const supabase = createClient();
    const r = accion === 'seguir'
      ? await seguirConLaCita(supabase, datos)
      : await cancelarPorEmergencia(supabase, datos);
    setProcesando(false);
    if (!r.ok) {
      setErrorDesactivar(r.error);
      return;
    }
    setDesactivando(false);
    setAvisoSms('');
    onCambio();
  }

  // Finalizar: el encuentro NO se cierra hasta que la persona califique o decida cerrar sin calificar.
  async function finalizarYCalificar(estrellas: number, chips: string[]) {
    setProcesando(true);
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
    setProcesando(false);
    setCalificando(false);
    onCambio();
  }

  async function finalizarSinCalificar() {
    setProcesando(true);
    const supabase = createClient();
    await finalizarEncuentro(supabase, cita.id);
    await omitirCalificacion(supabase, cita.id, esCliente);
    setProcesando(false);
    setCalificando(false);
    onCambio();
  }

  async function onSolicitarExtension(minutos: number) {
    setProcesando(true);
    await solicitarExtension(createClient(), cita.id, minutos);
    setProcesando(false);
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
    setProcesando(true);
    await cancelarExtension(createClient(), cita.id);
    setProcesando(false);
    onCambio();
  }

  async function onResponderExtension(aceptar: boolean) {
    setProcesando(true);
    await responderExtension(createClient(), {
      citaId: cita.id,
      aceptar,
      minutosPendientes: cita.extension_minutos_pendiente ?? 0,
      acumuladosActuales: cita.extension_minutos_acumulados,
    });
    setProcesando(false);
    onCambio();
  }

  const identidadOk = otra?.verificado ?? true;
  const contactosOk = (totalContactos ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Perfil de con quién estás */}
      <div className={`rounded-3xl border p-5 ${cita.en_emergencia ? 'border-red-500 bg-red-500/5' : 'border-vela-line bg-vela-surface'}`}>
        <div className="flex items-center gap-4">
          <div
            className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-full"
            style={{ backgroundColor: otra?.avatar_color ?? '#D91F3A' }}
          >
            {otra?.foto_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={otra.foto_url} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-blue-400">Encuentro en curso</p>
            <p className="truncate text-xl font-extrabold italic text-vela-text">
              {cita.otraPersonaAlias} {otra?.verificado && <span className="text-vela-verified">✓</span>}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-vela-text-dim">
          <span>📍 {cita.lugar}{cita.direccion ? ` · ${cita.direccion}` : ''}</span>
          <span>🕐 {fechaBonita}</span>
          <span>🍽️ Tipo de servicio: {cita.tipo_encuentro}</span>
        </div>
      </div>

      {/* Tiempo restante */}
      <div
        className={`rounded-3xl border p-6 text-center ${
          congelado
            ? 'border-red-500/60 bg-red-500/10'
            : terminado
              ? 'border-amber-500/50 bg-amber-500/10'
              : 'border-vela-line bg-vela-surface'
        }`}
      >
        <p className="text-xs font-bold uppercase tracking-wide text-vela-text-faint">
          {congelado
            ? 'Alerta activada · tiempo detenido'
            : terminado
              ? 'El tiempo acordado se cumplió'
              : 'Tiempo restante'}
        </p>
        <p
          className={`mt-1 text-5xl font-extrabold tabular-nums ${
            congelado ? 'text-red-500' : terminado ? 'text-amber-500' : 'text-vela-text'
          }`}
        >
          {restante}
        </p>
        {congelado && (
          <p className="mt-1 text-xs text-vela-text-faint">
            Este es el tiempo que quedaba cuando se activó la alerta. Vela lo guarda como respaldo.
          </p>
        )}
        {cita.extension_minutos_acumulados > 0 && (
          <p className="mt-1 text-xs text-vela-text-faint">
            Incluye +{formatMinutos(cita.extension_minutos_acumulados)} de extensión
          </p>
        )}
      </div>

      {/* Extensión de tiempo (solo cuando el tiempo se cumplió) */}
      {terminado && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
          {cita.extension_pendiente ? (
            esCliente ? (
              <>
                <p className="text-center text-sm text-vela-text-dim">
                  Esperando que {cita.otraPersonaAlias} responda tu solicitud de {formatMinutos(cita.extension_minutos_pendiente ?? 0)} más...
                </p>
                <button
                  onClick={onCancelarExtension}
                  disabled={procesando}
                  className="w-full h-12 rounded-full border border-vela-line text-sm font-bold text-vela-text-dim disabled:opacity-50"
                >
                  Cancelar petición
                </button>
              </>
            ) : (
              <>
                <p className="text-center text-sm font-semibold text-vela-text">
                  {cita.otraPersonaAlias} pide {formatMinutos(cita.extension_minutos_pendiente ?? 0)} más. ¿Aceptas?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => onResponderExtension(false)}
                    disabled={procesando}
                    className="flex-1 h-12 rounded-full border border-vela-line text-sm font-bold text-vela-text-dim disabled:opacity-50"
                  >
                    Rechazar
                  </button>
                  <button
                    onClick={() => onResponderExtension(true)}
                    disabled={procesando}
                    className="flex-1 h-12 rounded-full bg-vela-public text-sm font-bold text-white disabled:opacity-50"
                  >
                    Aceptar
                  </button>
                </div>
              </>
            )
          ) : esCliente ? (
            !vistaOtroExtension ? (
              <>
                <p className="text-center text-sm text-vela-text-dim">¿Necesitan más tiempo?</p>
                <div className="flex gap-2">
                  <button onClick={() => onSolicitarExtension(30)} disabled={procesando} className="flex-1 h-12 rounded-full border border-vela-line text-sm font-bold text-vela-text disabled:opacity-50">
                    +30 min
                  </button>
                  <button onClick={() => onSolicitarExtension(60)} disabled={procesando} className="flex-1 h-12 rounded-full border border-vela-line text-sm font-bold text-vela-text disabled:opacity-50">
                    +1 hora
                  </button>
                  <button onClick={() => setVistaOtroExtension(true)} disabled={procesando} className="flex-1 h-12 rounded-full border border-vela-line text-sm font-bold text-vela-text disabled:opacity-50">
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
                    className="flex-1 min-w-0 rounded-2xl border border-vela-line bg-vela-surface px-4 h-14 text-base text-vela-text outline-none"
                  />
                  <span className="text-sm text-vela-text-dim">horas más</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setVistaOtroExtension(false); setHorasManual(''); }}
                    className="flex-1 h-12 rounded-full border border-vela-line text-sm font-bold text-vela-text-dim"
                  >
                    Volver
                  </button>
                  <button
                    onClick={onPedirOtro}
                    disabled={procesando || !horasManual}
                    className="flex-1 h-12 rounded-full bg-vela-public text-sm font-bold text-white disabled:opacity-50"
                  >
                    Pedir
                  </button>
                </div>
              </div>
            )
          ) : (
            <p className="text-center text-sm text-vela-text-dim">
              Esperando que {cita.otraPersonaAlias} decida si necesitan más tiempo o finalizan.
            </p>
          )}
        </div>
      )}

      {/* Botón de pánico: un clic + confirmación y la alerta sale al instante */}
      {!confirmandoPanico ? (
        <button
          onClick={() => setConfirmandoPanico(true)}
          disabled={cita.en_emergencia}
          className="w-full h-14 rounded-full bg-red-600 text-base font-extrabold text-white disabled:opacity-60"
        >
          {cita.en_emergencia ? '🚨 Alerta ya enviada' : '🚨 Botón de pánico'}
        </button>
      ) : (
        <div className="rounded-3xl border border-red-500 bg-red-500/5 p-4">
          <p className="mb-1 text-center text-base font-extrabold text-red-400">¿Enviar la alerta ahora?</p>
          <p className="mb-3 text-center text-sm text-vela-text-dim">
            Se avisará de inmediato a tus contactos de emergencia por SMS.
          </p>
          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={enviarAlertaYa}
              disabled={procesando}
              className="w-full h-14 rounded-full bg-red-600 text-base font-extrabold text-white disabled:opacity-60"
            >
              {procesando ? 'Enviando alerta...' : 'Sí, enviar alerta'}
            </button>
            <button
              onClick={() => setConfirmandoPanico(false)}
              disabled={procesando}
              className="w-full min-h-11 text-center text-sm text-vela-text-faint underline"
            >
              No, cancelar
            </button>
          </div>
        </div>
      )}

      {avisoSms && <p className="text-center text-sm text-vela-text-dim">{avisoSms}</p>}

      {cita.en_emergencia && cita.en_emergencia_por === miId && (
        <button
          onClick={() => { setErrorDesactivar(''); setDesactivando(true); }}
          disabled={procesando}
          className="w-full h-12 rounded-full border border-red-500 text-sm font-bold text-red-500 disabled:opacity-50"
        >
          Desactivar alerta de emergencia
        </button>
      )}

      {/* Marcar como finalizado → abre de una la ventana de calificación */}
      <button
        onClick={() => setCalificando(true)}
        disabled={procesando}
        className="w-full h-14 rounded-full border border-vela-line bg-vela-surface text-base font-bold text-vela-text disabled:opacity-50"
      >
        ✅ Marcar como finalizado
      </button>

      {/* Protecciones activas */}
      <div className="rounded-3xl border border-vela-line border-l-2 border-l-vela-public bg-vela-surface p-5">
        <p className="mb-3 text-xs font-bold tracking-wide text-vela-public">PROTECCIONES ACTIVAS</p>
        <ul className="flex flex-col gap-3 text-sm text-vela-text-dim">
          <li className="flex items-start gap-2">
            <span>{identidadOk ? '✅' : '⚠️'}</span>
            <span>
              {identidadOk
                ? `Identidad de ${cita.otraPersonaAlias} verificada`
                : `La identidad de ${cita.otraPersonaAlias} aún no está verificada`}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span>{contactosOk ? '✅' : '⚠️'}</span>
            <span>
              {totalContactos === null
                ? 'Revisando tus contactos de emergencia...'
                : contactosOk
                  ? `${totalContactos} ${totalContactos === 1 ? 'contacto de emergencia activo' : 'contactos de emergencia activos'}`
                  : 'No tienes contactos de emergencia configurados'}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span>✅</span>
            <span>Chat cifrado</span>
          </li>
          <li className="flex items-start gap-2">
            <span>✅</span>
            <span>Cronómetro con alerta automática</span>
          </li>
        </ul>
      </div>

      {calificando && (
        <PanelCalificacion
          alias={cita.otraPersonaAlias}
          procesando={procesando}
          onEnviar={finalizarYCalificar}
          onOmitir={finalizarSinCalificar}
          onVolver={() => setCalificando(false)}
        />
      )}

      {desactivando && (
        <ModalDesactivarEmergencia
          aliasOtra={cita.otraPersonaAlias}
          procesando={procesando}
          error={errorDesactivar}
          onSeguir={(m) => resolverEmergencia('seguir', m)}
          onCancelarCita={(m) => resolverEmergencia('cancelar', m)}
          onVolver={() => { if (!procesando) setDesactivando(false); }}
        />
      )}
    </div>
  );
}