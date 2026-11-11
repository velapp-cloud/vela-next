'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { ESTADO_ACTIVA } from '@/lib/citas/estados';
import {
  registrarEmergencia,
  avisarContactosEmergencia,
  ETIQUETA_MOTIVO,
  type MotivoEmergencia,
} from '@/lib/emergencia/activarPanico';
import { seguirConLaCita, cancelarPorEmergencia } from '@/lib/emergencia/resolverEmergencia';
import ModalDesactivarEmergencia from '@/components/ModalDesactivarEmergencia';

type CitaEnCurso = {
  id: string;
  cliente_id: string;
  proveedora_id: string;
  lugar: string;
  direccion: string | null;
  hora_acordada: string;
  en_emergencia: boolean;
  en_emergencia_por: string | null;
};

const MOTIVOS: MotivoEmergencia[] = ['fui_agredido', 'me_faltaron_respeto', 'cita_no_como_planeado', 'otro'];

export default function BloqueoEnCurso() {
  const { perfil } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const [cita, setCita] = useState<CitaEnCurso | null>(null);
  const [alias, setAlias] = useState('la otra persona');
  const [vistaPanico, setVistaPanico] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [desactivando, setDesactivando] = useState(false);
  const [procesandoDesactivar, setProcesandoDesactivar] = useState(false);
  const [errorDesactivar, setErrorDesactivar] = useState('');

  const revisar = useCallback(async () => {
    if (!perfil?.id) return;
    const { data } = await supabase
      .from('citas')
      .select('id, cliente_id, proveedora_id, lugar, direccion, hora_acordada, en_emergencia, en_emergencia_por')
      .or(`cliente_id.eq.${perfil.id},proveedora_id.eq.${perfil.id}`)
      .eq('estado_manual', ESTADO_ACTIVA)
      .order('hora_acordada', { ascending: false })
      .limit(1)
      .maybeSingle();

    setCita(data ?? null);

    if (data) {
      const otraId = data.cliente_id === perfil.id ? data.proveedora_id : data.cliente_id;
      const { data: otra } = await supabase
        .from('perfiles_publicos')
        .select('alias')
        .eq('id', otraId)
        .maybeSingle();
      setAlias(otra?.alias ?? 'la otra persona');
    } else {
      setVistaPanico(false);
      setDesactivando(false);
    }
  }, [perfil?.id, supabase]);

  useEffect(() => {
    revisar();
  }, [revisar]);

  useEffect(() => {
    if (!perfil?.id) return;
    const canal = supabase
      .channel(`bloqueo-en-curso-${perfil.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas' }, () => revisar())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [perfil?.id, supabase, revisar]);

  async function confirmarPanico(motivo: MotivoEmergencia) {
    if (!cita || !perfil?.id || enviando) return;
    setEnviando(true);
    const contraparteId = cita.cliente_id === perfil.id ? cita.proveedora_id : cita.cliente_id;

    try {
      await registrarEmergencia(supabase, {
        citaId: cita.id,
        reportadoPor: perfil.id,
        contraparteId,
        motivo,
      });

      const fechaBonita = new Date(cita.hora_acordada).toLocaleString('es-SV', {
        weekday: 'long',
        day: '2-digit',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      const mensaje = `🚨 Emergencia Vela: necesito ayuda ahora. Estoy en una cita con ${alias} en ${cita.lugar}${cita.direccion ? ` (${cita.direccion})` : ''}, del ${fechaBonita}. Por favor contáctame o busca ayuda ya.`;
      await avisarContactosEmergencia(supabase, perfil.id, mensaje);
    } catch (err) {
      console.error('Error activando la alerta de pánico:', err);
    }

    setEnviando(false);
    setVistaPanico(false);
    revisar();
  }

  async function resolver(accion: 'seguir' | 'cancelar', motivo: string) {
    if (!cita || !perfil?.id) return;
    setProcesandoDesactivar(true);
    setErrorDesactivar('');
    const datos = { citaId: cita.id, miId: perfil.id, miAlias: perfil.alias ?? 'Alguien', motivo };
    const r = accion === 'seguir'
      ? await seguirConLaCita(supabase, datos)
      : await cancelarPorEmergencia(supabase, datos);
    setProcesandoDesactivar(false);
    if (!r.ok) {
      setErrorDesactivar(r.error);
      return;
    }
    setDesactivando(false);
    revisar();
  }

  if (!cita || pathname === '/encuentro') return null;

  // Solo quien activó la alerta puede desactivarla desde aquí.
  const puedoDesactivar = cita.en_emergencia && cita.en_emergencia_por === perfil?.id;

  return (
    <div className="fixed inset-0 z-[998] flex items-center justify-center bg-black/80 px-5">
      <div className="w-full max-w-sm rounded-3xl border border-vela-line bg-vela-surface p-6 text-center shadow-2xl">
        <p className="mb-3 text-5xl">⏱️</p>
        <h2 className="mb-2 text-xl font-extrabold text-vela-text">
          Tienes un cronómetro activo con “{alias}”
        </h2>
        <p className="mb-6 text-sm text-vela-text-dim leading-relaxed">
          Mientras dure el encuentro, el resto de la app queda bloqueado por tu seguridad. Solo puedes
          usar el módulo de Encuentro para pedir ayuda o marcar la cita como finalizada.
        </p>

        {!vistaPanico ? (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setVistaPanico(true)}
              disabled={cita.en_emergencia}
              className="w-full h-14 rounded-full bg-red-600 text-base font-extrabold text-white disabled:opacity-60"
            >
              {cita.en_emergencia ? '🚨 Alerta ya enviada' : '🚨 Alerta de pánico'}
            </button>
            {puedoDesactivar && (
              <button
                onClick={() => { setErrorDesactivar(''); setDesactivando(true); }}
                className="w-full h-14 rounded-full border border-red-500 text-base font-bold text-red-500"
              >
                Desactivar alerta
              </button>
            )}
            <button
              onClick={() => router.push('/encuentro')}
              className="w-full h-14 rounded-full bg-vela-public text-base font-bold text-white flex items-center justify-center gap-2"
            >
              Ir al encuentro
              <IconoFlecha />
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-red-500 bg-red-500/5 p-4 text-left">
            <p className="mb-3 text-center text-sm font-bold text-red-400">
              ¿Qué está pasando? Toca una opción para avisar a tus contactos ya mismo:
            </p>
            <div className="grid grid-cols-1 gap-2">
              {MOTIVOS.map((m) => (
                <button
                  key={m}
                  onClick={() => confirmarPanico(m)}
                  disabled={enviando}
                  className="w-full h-12 rounded-full bg-red-600 text-sm font-bold text-white disabled:opacity-60"
                >
                  {ETIQUETA_MOTIVO[m]}
                </button>
              ))}
            </div>
            <button
              onClick={() => setVistaPanico(false)}
              disabled={enviando}
              className="mt-2 w-full min-h-11 text-center text-sm text-vela-text-faint underline"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {desactivando && (
        <ModalDesactivarEmergencia
          aliasOtra={alias}
          procesando={procesandoDesactivar}
          error={errorDesactivar}
          onSeguir={(m) => resolver('seguir', m)}
          onCancelarCita={(m) => resolver('cancelar', m)}
          onVolver={() => { if (!procesandoDesactivar) setDesactivando(false); }}
        />
      )}
    </div>
  );
}

/** Flecha de los botones principales (solo diseño). */
function IconoFlecha() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}