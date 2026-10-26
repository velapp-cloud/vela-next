'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { ESTADO_ACTIVA } from '@/lib/citas/estados';

/**
 * app/(app)/seguridad/page.tsx
 * Gestion de contactos de emergencia — se recomienda un minimo de 2,
 * con un aviso visual si hay menos (mismo criterio que en Expo).
 * + Vista previa de la alerta que reciben los contactos
 * + Consejos antes de un encuentro
 */
const CONTACTOS_RECOMENDADOS = 2;

type Contacto = { id: string; nombre: string; telefono: string; relacion: string };

type CitaActiva = {
  lugar: string;
  hora_acordada: string;
  conQuien: string;
};

const CONSEJOS = [
  { icono: '📍', texto: 'Comparte tu ubicación con al menos un contacto de confianza.' },
  { icono: '💬', texto: 'Coordina siempre dentro del chat de Vela, no en otras apps.' },
  { icono: '🏛️', texto: 'Elige lugares públicos o con recepción para los primeros encuentros.' },
  { icono: '🚨', texto: 'Si algo te incomoda, usa el botón de pánico sin dar explicaciones.' },
];

export default function Seguridad() {
  const { perfil } = useSession();

  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [relacion, setRelacion] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [miAlias, setMiAlias] = useState('');
  const [citaActiva, setCitaActiva] = useState<CitaActiva | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) { setCargando(false); return; }

    const { data } = await supabase
      .from('contactos_emergencia')
      .select('id, nombre, telefono, relacion')
      .eq('usuario_id', userId)
      .order('creado_en', { ascending: true });

    setContactos(data ?? []);

    // Mi alias (para la vista previa de la alerta)
    const { data: yo } = await supabase
      .from('perfiles_publicos')
      .select('alias')
      .eq('id', userId)
      .maybeSingle();
    setMiAlias(yo?.alias ?? '');

    // Cita activa (si existe) para mostrar datos reales en la vista previa
    const { data: cita } = await supabase
      .from('citas')
      .select('cliente_id, proveedora_id, lugar, hora_acordada')
      .or(`cliente_id.eq.${userId},proveedora_id.eq.${userId}`)
      .eq('estado_manual', ESTADO_ACTIVA)
      .order('hora_acordada', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cita) {
      const otraId = cita.cliente_id === userId ? cita.proveedora_id : cita.cliente_id;
      const { data: otra } = await supabase
        .from('perfiles_publicos')
        .select('alias')
        .eq('id', otraId)
        .maybeSingle();
      setCitaActiva({
        lugar: cita.lugar,
        hora_acordada: cita.hora_acordada,
        conQuien: otra?.alias ?? 'la otra persona',
      });
    } else {
      setCitaActiva(null);
    }

    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function agregarContacto() {
    if (!nombre.trim() || !telefono.trim() || guardando) return;
    setGuardando(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) { setGuardando(false); return; }

    const { error } = await supabase.from('contactos_emergencia').insert({
      usuario_id: userId,
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      relacion: relacion.trim() || null,
    });

    setGuardando(false);
    if (error) {
      console.error('Error agregando contacto:', error);
      return;
    }

    setNombre('');
    setTelefono('');
    setRelacion('');
    setMostrarForm(false);
    cargar();
  }

  async function eliminarContacto(id: string) {
    const supabase = createClient();
    await supabase.from('contactos_emergencia').delete().eq('id', id);
    setContactos((prev) => prev.filter((c) => c.id !== id));
  }

  const faltan = Math.max(0, CONTACTOS_RECOMENDADOS - contactos.length);
  const aliasMostrar = miAlias || 'Tu perfil';
  const horaCita = citaActiva
    ? new Date(citaActiva.hora_acordada).toLocaleString('es-SV', {
        weekday: 'long',
        day: '2-digit',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : null;

  return (
    <main className="flex-1 px-6 py-8 max-w-md mx-auto w-full">
      <h1 className="text-[28px] leading-tight font-bold text-vela-text mb-1">Seguridad</h1>
      <p className="text-base text-vela-text-faint mb-5 leading-relaxed">
        Estos contactos son quienes reciben la alerta si activas el botón de pánico durante un encuentro.
      </p>

      {faltan > 0 && !cargando && (
        <div className="bg-vela-amber-soft border border-vela-amber rounded-2xl p-4 mb-5 flex gap-3 items-start">
          <span>⚠️</span>
          <p className="text-sm text-vela-text-dim">
            Te recomendamos tener al menos {CONTACTOS_RECOMENDADOS} contactos de emergencia. Te falta{faltan === 1 ? '' : 'n'} {faltan}.
          </p>
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-vela-text-faint">Cargando...</p>
      ) : (
        <div className="flex flex-col gap-3 mb-5">
          {contactos.map((c) => (
            <div key={c.id} className="bg-vela-surface border border-vela-line rounded-2xl p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-bold text-vela-text truncate">{c.nombre}</p>
                <p className="text-sm text-vela-text-faint">{c.telefono}{c.relacion ? ` · ${c.relacion}` : ''}</p>
              </div>
              <button
                onClick={() => eliminarContacto(c.id)}
                className="text-vela-safety text-sm font-semibold min-h-11 px-3"
              >
                Eliminar
              </button>
            </div>
          ))}
          {contactos.length === 0 && (
            <p className="text-sm text-vela-text-faint text-center py-4">Aún no tienes contactos de emergencia.</p>
          )}
        </div>
      )}

      {mostrarForm ? (
        <div className="bg-vela-surface border border-vela-line rounded-3xl p-5 flex flex-col gap-3">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre completo"
            className="bg-vela-surface-2 border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none focus:border-vela-public/60"
          />
          <input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="Teléfono"
            className="bg-vela-surface-2 border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none focus:border-vela-public/60"
          />
          <input
            value={relacion}
            onChange={(e) => setRelacion(e.target.value)}
            placeholder="Relación (opcional, ej. Hermana)"
            className="bg-vela-surface-2 border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none focus:border-vela-public/60"
          />
          <div className="flex gap-3">
            <button
              onClick={() => setMostrarForm(false)}
              className="flex-1 h-14 rounded-full bg-vela-surface-2 text-vela-text-faint text-base font-semibold"
            >
              Cancelar
            </button>
            <button
              onClick={agregarContacto}
              disabled={!nombre.trim() || !telefono.trim() || guardando}
              className="flex-1 h-14 rounded-full bg-vela-public text-white text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : (
                <>
                  Guardar
                  <IconoFlecha />
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setMostrarForm(true)}
          className="w-full h-14 rounded-full border-2 border-dashed border-vela-line-strong text-vela-text-faint text-base font-semibold"
        >
          + Agregar contacto de emergencia
        </button>
      )}

      {/* ── TARJETA 1: así verán la alerta tus contactos ── */}
      <section className="mt-8">
        <p className="text-xs font-bold tracking-wide text-vela-text-faint mb-2">
          ASÍ VERÁN LA ALERTA TUS CONTACTOS
        </p>
        <div className="overflow-hidden rounded-3xl border border-red-500/50 bg-vela-surface">
          <div className="flex items-center gap-2 bg-red-600 px-5 py-3.5">
            <span className="text-lg">🚨</span>
            <p className="text-base font-extrabold text-white">Vela - alerta de seguridad</p>
          </div>

          <div className="flex flex-col gap-3 p-5">
            <p className="text-base text-vela-text">
              <span className="font-extrabold">{aliasMostrar}</span> activó una alerta de seguridad y necesita ayuda.
            </p>

            <div className="rounded-2xl bg-red-600 py-3.5 text-center text-base font-extrabold text-white shadow-lg">
              🚨 ALERTA ACTIVADA
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-vela-line bg-vela-surface-2 px-4 py-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
              <p className="text-sm text-vela-text-dim">📍 Ubicación en tiempo real</p>
            </div>

            <div className="rounded-2xl border border-vela-line bg-vela-surface-2 p-4">
              <p className="text-[11px] font-bold tracking-wide text-vela-text-faint mb-2">
                {citaActiva ? 'CITA EN CURSO' : 'SI TIENE UNA CITA ACTIVA SE INCLUYE'}
              </p>
              <div className="flex flex-col gap-2 text-sm text-vela-text-dim">
                <p>👤 Con: <span className="font-semibold text-vela-text">{citaActiva ? citaActiva.conQuien : 'Nombre del perfil'}</span></p>
                <p>📍 Lugar: <span className="font-semibold text-vela-text">{citaActiva ? citaActiva.lugar : 'Lugar acordado'}</span></p>
                <p>🕒 Hora acordada: <span className="font-semibold text-vela-text">{horaCita ?? 'Fecha y hora de la cita'}</span></p>
              </div>
            </div>

            <p className="rounded-xl bg-vela-amber-soft px-4 py-2.5 text-center text-xs font-semibold text-vela-text-dim">
              Si no responde, comunícate al <span className="font-extrabold text-vela-text">911</span> o con soporte de Vela.
            </p>
          </div>
        </div>
      </section>

      {/* ── TARJETA 2: consejos antes de un encuentro ── */}
      <section className="mt-6 mb-4">
        <div className="rounded-3xl border border-vela-line border-l-2 border-l-vela-public bg-vela-surface p-5">
          <p className="text-xs font-bold tracking-wide text-vela-public mb-3">CONSEJOS ANTES DE UN ENCUENTRO</p>
          <ul className="flex flex-col gap-3.5">
            {CONSEJOS.map((c) => (
              <li key={c.texto} className="flex items-start gap-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-vela-public-soft text-lg">
                  {c.icono}
                </span>
                <p className="text-sm text-vela-text-dim pt-2">{c.texto}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
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