'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Persona = { id: string; alias: string; correo: string; telefono: string };
type Solicitud = {
  id: string;
  usuario_id: string;
  alias: string;
  motivo: string;
  estado: 'pendiente' | 'atendida' | 'rechazada';
  correo_enviado: boolean;
  creado_en: string;
};
type Bloqueo = {
  cita_id: string;
  lugar: string;
  automatica: boolean;
  desde: string | null;
  restante_segundos: number | null;
  iniciada_por: Persona | null;
  bloqueados: Persona[];
  solicitudes: Solicitud[];
};

function reloj(seg: number | null): string {
  if (seg == null) return '—';
  return `${Math.floor(seg / 3600)}h ${Math.floor((seg % 3600) / 60)}m ${seg % 60}s`;
}

function fecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-SV', {
    day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export default function Bloqueadas() {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([]);
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const llamar = useCallback(async (metodo: 'GET' | 'POST', cuerpo?: object) => {
    const { data } = await createClient().auth.getSession();
    const token = data.session?.access_token;
    const resp = await fetch('/api/admin/bloqueadas', {
      method: metodo,
      headers: { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json?.error ?? 'Error del servidor');
    return json;
  }, []);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const j = await llamar('GET');
      setBloqueos(j.bloqueos ?? []);
      setError('');
    } catch (e: any) {
      setError(`No se pudo cargar: ${e?.message ?? 'error desconocido'}`);
    }
    setCargando(false);
  }, [llamar]);

  useEffect(() => {
    cargar();
    // Se actualiza solo cada 20 segundos mientras la pestaña está visible.
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') cargar(true);
    }, 20_000);
    return () => clearInterval(t);
  }, [cargar]);

  async function desbloquear(b: Bloqueo) {
    const nombres = b.bloqueados.map((p) => p.alias).join(' y ');
    if (!window.confirm(`¿Desbloquear a ${nombres}? Esto desactiva la alerta de esta cita.`)) return;
    setTrabajando(b.cita_id);
    try {
      await llamar('POST', { accion: 'desbloquear', cita_id: b.cita_id });
      await cargar(true);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo desbloquear');
    }
    setTrabajando(null);
  }

  async function descartar(s: Solicitud) {
    setTrabajando(s.id);
    try {
      await llamar('POST', { accion: 'descartar', solicitud_id: s.id });
      await cargar(true);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo descartar');
    }
    setTrabajando(null);
  }

  return (
    <main className="flex-1 px-6 py-6 max-w-5xl mx-auto w-full">
      <div className="flex items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-[28px] leading-tight font-bold text-vela-text">Cuentas bloqueadas</h1>
          <p className="text-sm text-vela-text-faint mt-1">
            Personas bloqueadas por una alerta de emergencia activa y los mensajes que enviaron a Vela.
          </p>
        </div>
        <button
          onClick={() => cargar()}
          className="h-11 px-5 rounded-full bg-vela-surface-2 border border-vela-line text-sm font-bold text-vela-text flex items-center justify-center"
        >
          Actualizar
        </button>
      </div>

      {error !== '' && (
        <div className="mb-4 rounded-2xl border border-vela-safety/40 bg-vela-safety-soft p-4 text-sm text-vela-safety">{error}</div>
      )}

      {cargando ? (
        <p className="text-sm text-vela-text-faint text-center py-12">Cargando...</p>
      ) : bloqueos.length === 0 ? (
        <p className="text-sm text-vela-text-faint text-center py-12">No hay cuentas bloqueadas en este momento.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {bloqueos.map((b) => {
            const pendientes = b.solicitudes.filter((s) => s.estado === 'pendiente').length;
            return (
              <section key={b.cita_id} className="rounded-3xl border border-red-500/50 bg-vela-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-red-500/20 px-3 py-1 text-[11px] font-extrabold uppercase text-red-400">
                    Bloqueada
                  </span>
                  {pendientes > 0 && (
                    <span className="rounded-full bg-amber-500/20 px-3 py-1 text-[11px] font-extrabold uppercase text-amber-400">
                      {pendientes} {pendientes === 1 ? 'mensaje por revisar' : 'mensajes por revisar'}
                    </span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {b.bloqueados.map((p) => (
                    <div key={p.id} className="rounded-2xl border border-vela-line bg-vela-surface-2 p-4">
                      <p className="text-[11px] font-bold tracking-wide text-vela-text-faint">CUENTA BLOQUEADA</p>
                      <p className="text-lg font-extrabold text-vela-text">{p.alias}</p>
                      <p className="text-sm text-vela-text-dim break-all">{p.correo || 'Sin correo'}</p>
                      <p className="text-sm text-vela-text-dim">{p.telefono || 'Sin teléfono'}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-vela-text-dim">
                  <span>
                    Origen:{' '}
                    {b.automatica
                      ? 'alerta automática de Vela'
                      : b.iniciada_por
                        ? `la activó ${b.iniciada_por.alias}`
                        : 'alerta antigua'}
                  </span>
                  <span>Activada: {fecha(b.desde)}</span>
                  <span>Tiempo que quedaba: {reloj(b.restante_segundos)}</span>
                  <span className="truncate">Lugar: {b.lugar}</span>
                </div>

                {b.solicitudes.length > 0 && (
                  <div className="mt-4 flex flex-col gap-2">
                    <p className="text-xs font-bold tracking-wide text-vela-text-faint">MENSAJES PARA VELA</p>
                    {b.solicitudes.map((s) => (
                      <div key={s.id} className="rounded-2xl border border-vela-line bg-vela-surface-2 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-bold text-vela-text">
                            {s.alias} · <span className="font-normal text-vela-text-faint">{fecha(s.creado_en)}</span>
                          </p>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                              s.estado === 'pendiente'
                                ? 'bg-amber-500/20 text-amber-400'
                                : s.estado === 'atendida'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-white/10 text-vela-text-dim'
                            }`}
                          >
                            {s.estado}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-vela-text">{s.motivo}</p>
                        {!s.correo_enviado && (
                          <p className="mt-1 text-xs text-vela-safety">El correo a Vela no salió; este mensaje solo está aquí.</p>
                        )}
                        {s.estado === 'pendiente' && (
                          <button
                            onClick={() => descartar(s)}
                            disabled={trabajando === s.id}
                            className="mt-3 min-h-11 px-4 rounded-full border border-vela-line text-xs font-bold text-vela-text-dim disabled:opacity-50"
                          >
                            Descartar mensaje (sigue bloqueada)
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => desbloquear(b)}
                  disabled={trabajando === b.cita_id}
                  className="mt-4 w-full h-14 rounded-full bg-vela-public text-base font-bold text-white disabled:opacity-50"
                >
                  {trabajando === b.cita_id
                    ? 'Desbloqueando...'
                    : b.bloqueados.length > 1
                      ? 'Desbloquear cuentas y quitar alerta'
                      : 'Desbloquear cuenta y quitar alerta'}
                </button>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}