import type { Plan } from '@/lib/planes/capacidades';

/**
 * components/PlanBadge.tsx
 * Colores por plan:
 *  - básico  -> azul
 *  - premium -> plateado
 *  - gold    -> dorado
 *  - vip     -> SIN color de plan: insignia "VIP" neutra, visible para todos.
 */

export const ESTILO_PLAN: Record<
  Plan,
  { badge: string; tarjeta: string; acento: string; boton: string }
> = {
  basico: {
    badge: 'bg-blue-500/15 border-blue-500 text-blue-400',
    tarjeta: 'border-blue-500/50 bg-gradient-to-br from-blue-500/10 to-transparent',
    acento: 'text-blue-400',
    boton: 'bg-blue-500 text-white',
  },
  premium: {
    badge: 'bg-gradient-to-r from-slate-200 to-slate-400 border-slate-300 text-slate-800',
    tarjeta: 'border-slate-300/60 bg-gradient-to-br from-slate-300/15 to-transparent',
    acento: 'text-slate-300',
    boton: 'bg-gradient-to-r from-slate-200 to-slate-400 text-slate-900',
  },
  gold: {
    badge: 'bg-gradient-to-r from-yellow-300 to-amber-500 border-yellow-400 text-amber-950',
    tarjeta: 'border-yellow-400/60 bg-gradient-to-br from-yellow-400/15 to-transparent',
    acento: 'text-yellow-400',
    boton: 'bg-gradient-to-r from-yellow-300 to-amber-500 text-amber-950',
  },
  vip: {
    // VIP no se colorea: queda neutro, lo que lo distingue es la insignia.
    badge: 'bg-vela-surface-2 border-vela-text text-vela-text',
    tarjeta: 'border-vela-line bg-vela-surface',
    acento: 'text-vela-text',
    boton: 'bg-vela-public text-white',
  },
};

const NOMBRE: Record<Plan, string> = {
  basico: 'BÁSICO',
  premium: 'PREMIUM',
  gold: 'GOLD',
  vip: 'VIP',
};

export default function PlanBadge({ plan, className = '' }: { plan: Plan; className?: string }) {
  const key: Plan = plan in ESTILO_PLAN ? plan : 'basico';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-extrabold tracking-wide ${ESTILO_PLAN[key].badge} ${className}`}
    >
      {key === 'vip' && <span>👑</span>}
      {NOMBRE[key]}
    </span>
  );
}

/** Insignia pública para mostrar en cualquier perfil ajeno: solo aparece si es VIP. */
export function InsigniaVip({ plan, className = '' }: { plan: string; className?: string }) {
  if (plan !== 'vip') return null;
  return <PlanBadge plan="vip" className={className} />;
}