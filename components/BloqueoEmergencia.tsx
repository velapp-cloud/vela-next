'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { ESTADO_CANCELADA, ESTADO_FINALIZADA } from '@/lib/citas/estados';
import { desactivarEmergencia, avisarContactosEmergencia } from '@/lib/emergencia/activarPanico';
import { iniciarAlarma } from '@/lib/emergencia/alarma';
import { VELA_WHATSAPP, VELA_CORREO } from '@/lib/emergencia/contactoVela';

/** Minutos que debe durar la alerta sin resolverse para ofrecer contactar a Vela. */
const MINUTOS_PARA_CONTACTO = 10;

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

export default function BloqueoEmergencia() {
  const { perfil } = useSession();
  const supabase = createClient();
  const [alerta, setAlerta] = useState<Alerta | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [resolviendo, setResolviendo] = useState(false);
  const [despues, setDespues] = useState(false);
  const [citaDespues, setCitaDespues] = useState<string | null>(null);
  const [avisados, setAvisados] = useState<number | null>(null);
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

  useEffect(() => {
    if (!perfil?.id) return;
    const canal = supabase
      .channel(`bloqueo-emergencia-${perfil.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas' }, () => revisar())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [perfil?.id, supabase, revisar]);

  // Reloj para saber cuándo mostrar la opción de contactar a Vela.
  useEffect(() => {
    if (!alerta) return;
    const t = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(t);
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

  const minutos = Math.max(0, Math.floor((ahora - alerta.desde) / 60_000));
  const mostrarContacto = minutos >= MINUTOS_PARA_CONTACTO;
  const hayContacto = !!VELA_WHATSAPP || !!VELA_CORREO;
  const textoContacto = encodeURIComponent('Hola Vela, hay una alerta de emergencia activa en mi cuenta y necesito ayuda.');
  const puedeResolver = (alerta.auto && alerta.protegido) || alerta.heredada;

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/95 flex flex-col items-center justify-center px-6 text-center"
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

      {mostrarContacto ? (
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <p className="text-sm text-white/70 mb-1">
            La alerta lleva {minutos} minutos sin resolverse. Si necesitas ayuda, comunícate con Vela.
          </p>
          {VELA_WHATSAPP && (
            <a
              href={`https://wa.me/${VELA_WHATSAPP}?text=${textoContacto}`}
              target="_blank"
              rel="noreferrer"
              className="h-14 px-6 rounded-full bg-red-600 text-white font-bold text-base flex items-center justify-center"
            >
              Comunicarme con Vela por WhatsApp
            </a>
          )}
          {VELA_CORREO && (
            <a
              href={`mailto:${VELA_CORREO}?subject=${encodeURIComponent('Alerta de emergencia')}&body=${textoContacto}`}
              className="h-14 px-6 rounded-full border border-red-500 text-red-400 font-bold text-base flex items-center justify-center"
            >
              Comunicarme con Vela por correo
            </a>
          )}
          {!hayContacto && (
            <p className="text-xs text-white/60">Contacto de Vela sin configurar (lib/emergencia/contactoVela.ts).</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-white/50 max-w-xs">
          Si la alerta no se resuelve en unos minutos, aquí aparecerá la opción de comunicarte con Vela.
        </p>
      )}
    </div>
  );
}