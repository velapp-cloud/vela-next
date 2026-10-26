'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { CAPACIDADES, type Plan } from '@/lib/planes/capacidades';
import PlanBadge, { ESTILO_PLAN } from '@/components/PlanBadge';

/**
 * app/(app)/planes/page.tsx
 * NOTA: el cambio de plan aqui solo actualiza la base de datos
 * directamente (sin pasarela de pago todavia) — cuando integres
 * pagos reales, este boton debe redirigir al checkout en vez de
 * actualizar el plan de una vez. Mientras tanto se guarda
 * plan_vence_en (+30 dias) para simular el "plan activo".
 */
const ORDEN_PLANES: Plan[] = ['basico', 'premium', 'gold', 'vip'];
const DIAS_PLAN = 30;

export default function Planes() {
  const { perfil, refrescar } = useSession();
  const [cambiando, setCambiando] = useState<Plan | null>(null);

  async function cambiarPlan(plan: Plan) {
    if (!perfil || cambiando) return;
    setCambiando(plan);
    const supabase = createClient();
    const vence = new Date(Date.now() + DIAS_PLAN * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('perfiles')
      .update({ plan, plan_vence_en: vence })
      .eq('id', perfil.id);
    setCambiando(null);
    if (error) {
      console.error('Error cambiando de plan:', error);
      return;
    }
    refrescar();
  }

  return (
    <main className="flex-1 px-6 py-8 max-w-md mx-auto w-full">
      <h1 className="text-[28px] leading-tight font-bold text-vela-text mb-1">Planes</h1>
      <p className="text-base text-vela-text-faint mb-6">Elige el plan que mejor se ajuste a lo que buscas.</p>

      <div className="flex flex-col gap-4">
        {ORDEN_PLANES.map((planKey) => {
          const cap = CAPACIDADES[planKey];
          const estilo = ESTILO_PLAN[planKey];
          const esActual = perfil?.plan === planKey;
          return (
            <div
              key={planKey}
              className={`rounded-3xl border p-6 ${estilo.tarjeta} ${esActual ? 'ring-2 ring-offset-0 ring-white/30' : ''}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex flex-col gap-1.5">
                  <h2 className="text-xl font-extrabold text-vela-text">{cap.label}</h2>
                  <PlanBadge plan={planKey} className="self-start" />
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-extrabold ${estilo.acento}`}>
                    ${cap.precioMes}
                    <span className="text-sm text-vela-text-faint">/mes</span>
                  </p>
                  <p className="text-xs text-vela-text-faint">${cap.precioSemana}/semana</p>
                </div>
              </div>

              <ul className="flex flex-col gap-2 mb-5">
                <Beneficio texto={`${cap.perfilesDia === 99 ? 'Perfiles ilimitados' : `${cap.perfilesDia} perfiles al día`}`} />
                <Beneficio texto={`Hasta ${cap.maxFotos} fotos de perfil`} />
                <Beneficio texto="Ver reseñas de otros perfiles" activo={cap.verComentarios} />
                <Beneficio texto="Guardar favoritos" activo={cap.guardarFavoritos} />
                <Beneficio texto="Compartir perfil" activo={cap.compartirPerfil} />
                <Beneficio texto="Filtros avanzados" activo={cap.filtrosAvanzados} />
                <Beneficio texto={`${cap.citasSimultaneas} cita${cap.citasSimultaneas > 1 ? 's' : ''} simultánea${cap.citasSimultaneas > 1 ? 's' : ''}`} />
                <Beneficio texto="Insignia destacada" activo={cap.insigniaDestacada} />
                {planKey === 'vip' && <Beneficio texto="Insignia VIP visible en tu perfil" />}
                <Beneficio texto={`Soporte ${cap.soporte.toLowerCase()}`} />
              </ul>

              {esActual ? (
                <div className="w-full h-14 rounded-full bg-vela-surface-2 text-vela-text-faint text-base font-semibold flex items-center justify-center">
                  Tu plan actual
                </div>
              ) : (
                <button
                  onClick={() => cambiarPlan(planKey)}
                  disabled={cambiando !== null}
                  className={`w-full h-14 rounded-full text-base font-bold flex items-center justify-center gap-2 disabled:opacity-50 ${estilo.boton}`}
                >
                  {cambiando === planKey ? 'Cambiando...' : (
                    <>
                      Elegir este plan
                      <IconoFlecha />
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}

function Beneficio({ texto, activo = true }: { texto: string; activo?: boolean }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <span className={activo ? 'text-vela-verified' : 'text-vela-text-faint'}>{activo ? '✓' : '✕'}</span>
      <span className={activo ? 'text-vela-text-dim' : 'text-vela-text-faint line-through'}>{texto}</span>
    </li>
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