'use client';

import PlanBadge from '@/components/PlanBadge';
import { IconMail, IconPhone } from '@tabler/icons-react';

export type PerfilAdmin = {
  id: string;
  alias: string;
  nombre: string;
  correo: string;
  telefono: string;
  rol: string;
  esAdmin: boolean;
  plan: string;
  fecha: string | null;
  fechaEtiqueta: string;
  mostrarPlan?: boolean;
};

const COLOR_ROL = {
  descubierta: '#D91F3A', // rojo
  conocer: '#3B82F6', // azul
  admin: '#F59E0B', // amarillo
};

export function RolBadge({ esAdmin, rol }: { esAdmin: boolean; rol: string }) {
  const tipo = esAdmin ? 'admin' : rol === 'proveedor' ? 'descubierta' : 'conocer';
  const texto = tipo === 'admin' ? 'Admin' : tipo === 'descubierta' ? 'Quiero ser descubierta' : 'Quiero conocer';
  const color = COLOR_ROL[tipo];
  return (
    <span
      className="text-[11px] font-bold rounded-full px-3 py-1.5 border whitespace-nowrap"
      style={{ color, borderColor: color + '66', backgroundColor: color + '1F' }}
    >
      {texto}
    </span>
  );
}

export function TarjetaPerfilAdmin({ p }: { p: PerfilAdmin }) {
  const fecha = p.fecha
    ? new Date(p.fecha).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  return (
    <div className="bg-vela-surface border border-vela-line rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-extrabold italic text-vela-text truncate">{p.alias || 'Sin alias'}</p>
          {p.nombre && <p className="text-xs text-vela-text-faint truncate">{p.nombre}</p>}
        </div>
        <RolBadge esAdmin={p.esAdmin} rol={p.rol} />
      </div>

      {p.mostrarPlan && (
        <div>
          <PlanBadge plan={p.plan as 'basico' | 'premium' | 'gold' | 'vip'} />
        </div>
      )}

      <div className="text-sm text-vela-text-dim flex flex-col gap-1.5">
        <p className="flex items-center gap-2 min-w-0">
          <IconMail size={16} className="flex-shrink-0 text-vela-text-faint" />
          <span className="truncate">{p.correo || '—'}</span>
        </p>
        <p className="flex items-center gap-2 min-w-0">
          <IconPhone size={16} className="flex-shrink-0 text-vela-text-faint" />
          <span className="truncate">{p.telefono || '—'}</span>
        </p>
        <p className="text-xs text-vela-text-faint">
          {p.fechaEtiqueta}: {fecha}
        </p>
      </div>
    </div>
  );
}