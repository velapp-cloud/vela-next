'use client';

/**
 * components/SolicitudCard.tsx
 *
 * Tarjeta de "solicitud recibida" — usada en app/(app)/explorar/page.tsx
 * cuando el rol es proveedora. Muestra la foto real de quien envia la
 * solicitud, sus chips/intereses, que idioma habla (columna `idiomas`),
 * su estatura y su ciudad (no existe `departamento` en la base real),
 * y debajo todos los detalles de la cita propuesta.
 */

import { PLAN_RING } from './planRing';

export type SolicitudRecibida = {
  id: string;
  fecha: string;
  hora: string;
  duracion: string;
  lugar: string;
  tipo: string;
  mensaje: string;
  creado_en: string;
  cliente: {
    id: string;
    alias: string;
    avatar_color: string;
    foto_url: string | null;
    estatura: string | null;
    ciudad: string | null;
    idiomas: string | null;
    plan: 'basico' | 'premium' | 'gold' | 'vip' | null;
    chips: string[];
  };
};

type Props = {
  solicitud: SolicitudRecibida;
  onAceptar: (id: string) => void;
  onRechazar: (id: string) => void;
  procesando?: boolean;
};

export default function SolicitudCard({ solicitud, onAceptar, onRechazar, procesando }: Props) {
  const c = solicitud.cliente;
  const ring = c.plan ? PLAN_RING[c.plan] : PLAN_RING.basico;

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      {/* ── Encabezado: foto, alias, plan, idioma, estatura, ciudad, chips ── */}
      <div className="flex items-start gap-3">
        <div
          className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full border-[2.5px]"
          style={{ borderColor: ring.color, boxShadow: `0 0 8px ${ring.glow}` }}
        >
          <div
            className="flex h-[54px] w-[54px] items-center justify-center overflow-hidden rounded-full"
            style={{ backgroundColor: c.avatar_color }}
          >
            {c.foto_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.foto_url} alt={c.alias} className="h-full w-full object-cover" />
            ) : (
              <span className="text-xl font-extrabold italic text-black">{c.alias.charAt(0)}</span>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-extrabold italic text-text">{c.alias}</span>
            {c.plan && (
              <span
                className="rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold tracking-wide"
                style={{ borderColor: ring.color, color: ring.color, backgroundColor: `${ring.color}33` }}
              >
                {c.plan.toUpperCase()}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] font-semibold text-textDim">
            {c.ciudad && <span className="flex items-center gap-1">📍 {c.ciudad}</span>}
            {c.estatura && <span className="flex items-center gap-1">📏 {c.estatura}</span>}
            {c.idiomas && <span className="flex items-center gap-1">🗣️ {c.idiomas}</span>}
          </div>

          {c.chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-line bg-surface2 px-2.5 py-1 text-[11px] font-semibold text-textDim"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Detalles de la cita propuesta ── */}
      <div className="mt-4 rounded-xl bg-surface2 p-3 text-sm">
        <p className="font-bold text-text">Detalles de la cita</p>
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-textDim">
          <span>📅 {solicitud.fecha}</span>
          <span>🕐 {solicitud.hora}</span>
          <span>⏱️ {solicitud.duracion}</span>
          <span>🍽️ {solicitud.tipo}</span>
        </div>
        <p className="mt-1.5 text-textDim">📍 {solicitud.lugar}</p>
        {solicitud.mensaje && (
          <p className="mt-2 italic text-textDim">&ldquo;{solicitud.mensaje}&rdquo;</p>
        )}
      </div>

      {/* ── Acciones ── */}
      <div className="mt-4 flex gap-2">
        <button
          disabled={procesando}
          onClick={() => onAceptar(solicitud.id)}
          className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          Aceptar
        </button>
        <button
          disabled={procesando}
          onClick={() => onRechazar(solicitud.id)}
          className="flex-1 rounded-xl border border-line py-2.5 text-sm font-bold text-textDim disabled:opacity-50"
        >
          Rechazar
        </button>
      </div>
    </div>
  );
}