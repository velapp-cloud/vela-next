'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { ESTADO_CANCELADA, ESTADO_FINALIZADA } from '@/lib/citas/estados';
import { desactivarEmergencia, avisarContactosEmergencia } from '@/lib/emergencia/activarPanico';
import { iniciarAlarma } from '@/lib/emergencia/alarma';
import { VELA_WHATSAPP } from '@/lib/emergencia/contactoVela';
import { ahoraServidor, sincronizarHoraServidor } from '@/lib/utils/horaServidor';

/** Tiempo prudente (en minutos) para que la persona bloqueada escriba a Vela. */
const MINUTOS_PARA_CONTACTO = 10;
const SEGUNDOS_PARA_CONTACTO = MINUTOS_PARA_CONTACTO * 60;

type Alerta = {
  citaId: string;
  /** Alerta creada por Vela (la cita no se finalizó a tiempo): nadie la activó a mano. */
  auto: boolean;
  /** En una alerta automática, true si yo soy quien está protegido (plan Gold/VIP): suena la alarma. */
  protegido: boolean;
  /** Alerta vieja sin iniciador ni marca de automática: cualquiera de las dos personas puede resolverla. */
  heredada: boolean;
  alias: string;
  desde: number;
};

function mmss(totalSegundos: number): string {
  const t = Math.max(0, Math.floor(totalSegundos));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export default function BloqueoEmergencia() {
  const { perfil } = useSession();
  const supabase = createClient();
  const [alerta, setAlerta] = useState<Alerta | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [resolviendo, setResolviendo] = useState(false);
  const [despues, setDespues] = useState(false);
  const [citaDespues, setCitaDespues] = useState<string | null>(null);
  const [avisados, setAvisados] = useState<number | null>(null);

  // Mensaje a Vela
  const [modalAbierto, setModalAbierto] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState('');
  const [enviado, setEnviado] = useState(false);

  const vistoPrimeraVez = useRef<Record<string, number>>({});
  const alarmaRef = useRef<ReturnType<typeof iniciarAlarma> | null>(null);

  const revisar = useCallback(async () => {
    if (!perfil?.id) return;
    const { data } = await supabase
      .from('citas')
      .select(
        'id, cliente_id, proveedora_id, en_emergencia_por, emergencia_iniciada_en, estado_manual, emergencia_automatica, emergencia_auto_para',
      )
      .or(`cliente_id.eq.${perfil.id},proveedora_id.eq.${perfil.id}`)
      .eq('en_emergencia', true);

    // Se bloquea a quien NO activó la alerta (si la activó Vela, a las dos personas).
    // Ojo: se filtra aquí y no en la consulta, porque "distinto de mi id" descarta las filas con valor vacío.
    const abiertas = (data ?? []).filter(
      (c: any) =>
        c.estado_manual !== ESTADO_FINALIZADA &&
        c.estado_manual !== ESTADO_CANCELADA &&
        c.en_emergencia_por !== perfil.id,
    );
    const c: any = abiertas[0];
    if (!c) {
      setAlerta(null);
      return;
    }

    const auto = !!c.emergencia_automatica;
    const protegidos: string[] = Array.isArray(c.emergencia_auto_para) ? c.emergencia_auto_para : [];
    const protegido = auto && protegidos.includes(perfil.id);
    const heredada = !c.en_emergencia_por && !auto;

    const otroId = c.en_emergencia_por
      ? c.en_emergencia_por
      : c.cliente_id === perfil.id ? c.proveedora_id : c.cliente_id;
    const { data: otra } = await supabase
      .from('perfiles_publicos')
      .select('alias')
      .eq('id', otroId)
      .maybeSingle();

    if (!vistoPrimeraVez.current[c.id]) vistoPrimeraVez.current[c.id] = Date.now();
    const desde = c.emergencia_iniciada_en
      ? new Date(c.emergencia_iniciada_en).getTime()
      : vistoPrimeraVez.current[c.id];

    setAlerta({ citaId: c.id, auto, protegido, heredada, alias: otra?.alias ?? 'La otra persona', desde });
  }, [perfil?.id, supabase]);

  useEffect(() => {
    revisar();
  }, [revisar]);

  // Solo las citas donde participo (antes se escuchaban las citas de todos).
  useEffect(() => {
    if (!perfil?.id) return;
    const canal = supabase
      .channel(`bloqueo-emergencia-${perfil.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas', filter: `cliente_id=eq.${perfil.id}` }, () => revisar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas', filter: `proveedora_id=eq.${perfil.id}` }, () => revisar())
      .subscribe();

    const alVolver = () => { revisar(); };
    const alVer = () => { if (document.visibilityState === 'visible') revisar(); };
    window.addEventListener('online', alVolver);
    document.addEventListener('visibilitychange', alVer);
    // Respaldo por si el tiempo real no avisa (por ejemplo, si se borra una cita).
    const respaldo = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) revisar();
    }, 30_000);

    return () => {
      supabase.removeChannel(canal);
      window.removeEventListener('online', alVolver);
      document.removeEventListener('visibilitychange', alVer);
      clearInterval(respaldo);
    };
  }, [perfil?.id, supabase, revisar]);

  // Cronómetro del tiempo para contactar a Vela (hora del servidor, avanza cada segundo).
  useEffect(() => {
    if (!alerta) return;
    let activo = true;
    sincronizarHoraServidor().finally(() => { if (activo) setAhora(ahoraServidor()); });
    const t = setInterval(() => setAhora(ahoraServidor()), 1000);
    return () => {
      activo = false;
      clearInterval(t);
    };
  }, [alerta]);

  // Al desaparecer la alerta se limpia el mensaje.
  useEffect(() => {
    if (!alerta) {
      setModalAbierto(false);
      setMensaje('');
      setErrorEnvio('');
      setEnviado(false);
    }
  }, [alerta]);

  // Alarma en bucle solo para la persona protegida (Gold/VIP) en una alerta automática.
  const suenaAlarma = !!alerta && alerta.auto && alerta.protegido;
  useEffect(() => {
    if (!suenaAlarma) return;
    const a = iniciarAlarma();
    alarmaRef.current = a;
    return () => {
      a.detener();
      alarmaRef.current = null;
    };
  }, [suenaAlarma]);

  async function resolverAlerta() {
    if (!alerta || resolviendo) return;
    if (!window.confirm('¿Ya estás a salvo? Esto desactiva la alerta.')) return;
    setResolviendo(true);
    const eraAutoProtegida = alerta.auto && alerta.protegido;
    await desactivarEmergencia(supabase, alerta.citaId);
    setResolviendo(false);
    if (eraAutoProtegida) {
      setAvisados(null);
      setCitaDespues(alerta.citaId);
      setDespues(true);
    }
    revisar();
  }

  async function avisarQueEstoyBien() {
    if (!perfil?.id || !citaDespues) return;
    // 1) SMS automático desde el servidor (si la alerta ya había avisado a los contactos por SMS).
    try {
      const { data: sesion } = await supabase.auth.getSession();
      const token = sesion.session?.access_token;
      if (token) {
        const resp = await fetch('/api/emergencia/sms-ok', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ cita_id: citaDespues }),
        });
        if (resp.ok) {
          const r = await resp.json();
          if (r.enviados > 0) {
            setAvisados(r.enviados);
            return;
          }
        }
      }
    } catch {
      // si falla el servidor, se usa el respaldo por WhatsApp
    }
    // 2) Respaldo: abre WhatsApp para cada contacto.
    const n = await avisarContactosEmergencia(
      supabase,
      perfil.id,
      '✅ Vela: la alerta de emergencia que recibiste fue un descuido. Estoy bien, disculpa el susto.',
    );
    setAvisados(n);
  }

  async function enviarMensajeAVela() {
    if (!alerta || enviando) return;
    const texto = mensaje.trim();
    if (texto.length < 10) {
      setErrorEnvio('Cuéntanos un poco más (mínimo 10 caracteres).');
      return;
    }
    setEnviando(true);
    setErrorEnvio('');
    try {
      const { data: sesion } = await supabase.auth.getSession();
      const token = sesion.session?.access_token;
      const resp = await fetch('/api/emergencia/contactar-vela', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ cita_id: alerta.citaId, motivo: texto }),
      });
      const r = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setErrorEnvio(r?.error ?? 'No se pudo enviar tu mensaje. Intenta de nuevo.');
      } else {
        setEnviado(true);
        setMensaje('');
      }
    } catch {
      setErrorEnvio('Sin conexión. Revisa tu internet e intenta de nuevo.');
    }
    setEnviando(false);
  }

  if (!alerta) {
    if (!despues) return null;
    return (
      <div className="fixed inset-0 z-[999] bg-black/95 flex flex-col items-center justify-center px-6 text-center" role="dialog" aria-modal="true">
        <p className="text-6xl mb-4">✅</p>
        <h2 className="text-2xl font-extrabold text-white mb-2">Alerta desactivada</h2>
        <p className="text-base text-white/80 mb-6 max-w-xs leading-relaxed">
          Si tus contactos de emergencia recibieron un aviso, puedes decirles ahora que fue un descuido y que estás bien.
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={avisarQueEstoyBien}
            disabled={avisados !== null}
            className="h-14 px-6 rounded-full bg-white text-black font-bold text-base disabled:opacity-60"
          >
            Avisar a mis contactos que estoy bien
          </button>
          {avisados !== null && (
            <p className="text-sm text-white/70">
              {avisados > 0
                ? `Listo: se avisó a ${avisados} ${avisados === 1 ? 'contacto' : 'contactos'}. Si se abrió WhatsApp, envía el mensaje en cada ventana.`
                : 'No tienes contactos de emergencia configurados.'}
            </p>
          )}
          <button
            onClick={() => setDespues(false)}
            className="h-14 px-6 rounded-full border border-white/30 text-white font-bold text-base"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const transcurrido = Math.max(0, Math.floor((ahora - alerta.desde) / 1000));
  const restanteContacto = SEGUNDOS_PARA_CONTACTO - transcurrido;
  const tiempoAgotado = restanteContacto <= 0;
  const textoContacto = encodeURIComponent('Hola Vela, hay una alerta de emergencia activa en mi cuenta y necesito ayuda.');
  const puedeResolver = (alerta.auto && alerta.protegido) || alerta.heredada;

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/95 flex flex-col items-center justify-center px-6 text-center overflow-y-auto py-8"
      role="alertdialog"
      aria-modal="true"
      onPointerDown={() => alarmaRef.current?.desbloquear()}
    >
      <p className="text-6xl mb-4">🚨</p>
      <h2 className="text-2xl font-extrabold text-white mb-2">Alerta de emergencia activa</h2>

      {alerta.auto && alerta.protegido ? (
        <p className="text-base text-white/80 mb-6 max-w-xs leading-relaxed">
          Tu cita con {alerta.alias} superó su hora de fin hace más de {MINUTOS_PARA_CONTACTO} minutos y no se
          finalizó. Vela activó esta alerta por tu seguridad. Si estás bien, desactívala.
        </p>
      ) : alerta.auto ? (
        <p className="text-base text-white/80 mb-6 max-w-xs leading-relaxed">
          Vela activó una alerta de seguridad porque la cita con {alerta.alias} no se finalizó a tiempo. Estás
          esperando a que {alerta.alias} la resuelva. Mientras tanto no puedes seguir usando la app.
        </p>
      ) : alerta.heredada ? (
        <p className="text-base text-white/80 mb-6 max-w-xs leading-relaxed">
          Hay una alerta de emergencia activa en tu cita con {alerta.alias}. Mientras no se resuelva, no puedes seguir
          usando la app.
        </p>
      ) : (
        <p className="text-base text-white/80 mb-6 max-w-xs leading-relaxed">
          <strong className="text-white">{alerta.alias}</strong> inició esta alerta de emergencia durante la cita.
          Estás esperando a que la quite, la cancele y la dé por resuelta. Mientras tanto no puedes seguir usando la
          app.
        </p>
      )}

      {puedeResolver && (
        <button
          onClick={resolverAlerta}
          disabled={resolviendo}
          className="mb-3 h-14 px-8 rounded-full bg-white text-black font-bold text-base disabled:opacity-60"
        >
          {resolviendo ? '...' : 'Estoy bien, desactivar alerta'}
        </button>
      )}

      {/* Cronómetro para comunicarse con Vela */}
      <div className="flex flex-col items-center gap-3 w-full max-w-xs rounded-3xl border border-white/15 bg-white/5 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-white/60">
          {tiempoAgotado ? 'El tiempo sugerido terminó' : 'Tiempo para comunicarte con Vela'}
        </p>
        <p className={`text-5xl font-extrabold tabular-nums ${tiempoAgotado ? 'text-amber-400' : 'text-white'}`}>
          {mmss(Math.max(0, restanteContacto))}
        </p>
        <p className="text-sm text-white/70 leading-relaxed">
          {tiempoAgotado
            ? 'Aún puedes escribirnos. Cuéntanos qué pasó para que Vela revise tu cuenta.'
            : 'Explícale a Vela por qué tu cuenta quedó bloqueada. Revisaremos tu caso.'}
        </p>
        <button
          onClick={() => { setEnviado(false); setErrorEnvio(''); setModalAbierto(true); }}
          className="h-14 w-full rounded-full bg-red-600 text-white font-bold text-base"
        >
          Escribir a Vela
        </button>
        {VELA_WHATSAPP && tiempoAgotado && (
          <a
            href={`https://wa.me/${VELA_WHATSAPP}?text=${textoContacto}`}
            target="_blank"
            rel="noreferrer"
            className="h-12 w-full rounded-full border border-red-500 text-red-400 font-bold text-sm flex items-center justify-center"
          >
            También por WhatsApp
          </a>
        )}
      </div>

      {/* Ventana para escribir el mensaje */}
      {modalAbierto && (
        <div
          className="fixed inset-0 z-[1000] bg-black/80 flex items-end sm:items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Escribir a Vela"
        >
          <div className="w-full max-w-md rounded-3xl bg-vela-surface border border-vela-line p-5 text-left">
            {enviado ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <p className="text-5xl">📨</p>
                <h3 className="text-xl font-extrabold text-vela-text">Mensaje enviado</h3>
                <p className="text-sm text-vela-text-dim leading-relaxed">
                  Vela recibió tu mensaje y revisará tu caso. Esta pantalla se cerrará sola cuando tu cuenta sea
                  desbloqueada.
                </p>
                <button
                  onClick={() => setModalAbierto(false)}
                  className="mt-2 h-14 w-full rounded-full bg-vela-public text-white font-bold text-base"
                >
                  Entendido
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-xl font-extrabold text-vela-text">Escribir a Vela</h3>
                <p className="mt-1 text-sm text-vela-text-dim">
                  Cuéntanos qué pasó y por qué crees que tu cuenta debe desbloquearse.
                </p>
                <textarea
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  maxLength={1000}
                  rows={6}
                  placeholder="Escribe aquí tu mensaje..."
                  className="mt-3 w-full resize-none rounded-2xl border border-vela-line bg-vela-bg p-4 text-base text-vela-text outline-none"
                />
                <p className="mt-1 text-right text-xs text-vela-text-faint">{mensaje.length}/1000</p>
                {errorEnvio && <p className="mt-1 text-sm text-red-400">{errorEnvio}</p>}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setModalAbierto(false)}
                    disabled={enviando}
                    className="flex-1 h-14 rounded-full border border-vela-line text-base font-bold text-vela-text-dim disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={enviarMensajeAVela}
                    disabled={enviando || mensaje.trim().length < 10}
                    className="flex-1 h-14 rounded-full bg-vela-public text-base font-bold text-white disabled:opacity-50"
                  >
                    {enviando ? 'Enviando...' : 'Enviar a Vela'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}