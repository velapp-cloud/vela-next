'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { CAPACIDADES, type Plan } from '@/lib/planes/capacidades';
import PlanBadge, { ESTILO_PLAN } from '@/components/PlanBadge';

/**
 * app/(app)/planes/page.tsx
 * Elegir un plan lleva al pago con Wompi (30 días). El plan NO se cambia aquí:
 * lo activa el servidor cuando Wompi confirma el pago (webhook).
 */
const ORDEN_PLANES: Plan[] = ['basico', 'premium', 'gold', 'vip'];

export default function Planes() {
  const { perfil } = useSession();
  const [cambiando, setCambiando] = useState<Plan | null>(null);
  const [error, setError] = useState('');

  async function pagar(plan: Plan) {
    if (!perfil || cambiando) return;

    // Pagar un plan más bajo que el actual lo reemplaza desde hoy: se confirma antes.
    const idxActual = ORDEN_PLANES.indexOf(perfil.plan as Plan);
    const idxElegido = ORDEN_PLANES.indexOf(plan);
    if (idxActual > idxElegido) {
      const seguir = window.confirm(
        `Tu plan actual es ${CAPACIDADES[perfil.plan as Plan]?.label ?? perfil.plan}. ` +
        `Pagar ${CAPACIDADES[plan].label} lo reemplaza desde hoy. ¿Continuar?`,
      );
      if (!seguir) return;
    }

    setError('');
    setCambiando(plan);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError('Tu sesión expiró. Entra de nuevo.');
        setCambiando(null);
        return;
      }

      const resp = await fetch('/api/wompi/crear-enlace', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan }),
      });
      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok || !json.url) {
        setError(json.error ?? 'No se pudo iniciar el pago. Intenta de nuevo.');
        setCambiando(null);
        return;
      }
      // Se queda "Redirigiendo..." hasta que el navegador cambie de página.
      window.location.href = json.url as string;
    } catch (err) {
      console.error('Error iniciando el pago:', err);
      setError('No se pudo iniciar el pago. Revisa tu conexión e intenta de nuevo.');
      setCambiando(null);
    }
  }

  return (
    <main className="flex-1 px-6 py-8 max-w-md mx-auto w-full">
      <h1 className="text-[28px] leading-tight font-bold text-vela-text mb-1">Planes</h1>
      <p className="text-base text-vela-text-faint mb-6">Elige el plan que mejor se ajuste a lo que buscas.</p>

      {error && (
        <div className="bg-vela-safety-soft border border-vela-safety rounded-2xl p-4 mb-4">
          <p className="text-xs text-vela-safety">{error}</p>
        </div>
      )}

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

              {esActual && (
                <div className="w-full h-12 rounded-full bg-vela-surface-2 text-vela-text-faint text-base font-semibold flex items-center justify-center mb-3">
                  Tu plan actual
                </div>
              )}
              <button
                onClick={() => pagar(planKey)}
                disabled={cambiando !== null}
                className={`w-full h-14 rounded-full text-base font-bold flex items-center justify-center gap-2 disabled:opacity-50 ${estilo.boton}`}
              >
                {cambiando === planKey ? 'Redirigiendo al pago...' : (
                  <>
                    {esActual ? 'Renovar 30 días' : 'Elegir este plan'}
                    <IconoFlecha />
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-vela-text-faint text-center mt-6">
        Pago seguro con Wompi. Cada pago activa tu plan por 30 días.
      </p>
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