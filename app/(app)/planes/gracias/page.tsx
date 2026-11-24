'use client';

/**
 * app/(app)/planes/gracias/page.tsx
 * A donde Wompi devuelve al cliente después de pagar. Esta página NO activa el plan:
 * solo consulta si el servidor ya lo activó (cada 3 segundos, hasta 1 minuto).
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { CAPACIDADES, type Plan } from '@/lib/planes/capacidades';

type PagoFila = { estado: 'pendiente' | 'pagado' | 'fallido'; plan: string };

const INTERVALO_MS = 3000;
const MAX_INTENTOS = 20;

export default function PagoGracias() {
  const { perfil, refrescar } = useSession();
  const [pago, setPago] = useState<PagoFila | null>(null);
  const [intentos, setIntentos] = useState(0);
  const refrescado = useRef(false);
  const perfilId = perfil?.id;

  useEffect(() => {
    if (!perfilId) return;
    if (pago?.estado === 'pagado' || pago?.estado === 'fallido') return;
    if (intentos >= MAX_INTENTOS) return;

    const temporizador = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('pagos')
        .select('estado, plan')
        .eq('usuario_id', perfilId)
        .order('creado_en', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setPago(data as PagoFila);
      setIntentos((n) => n + 1);
    }, intentos === 0 ? 0 : INTERVALO_MS);

    return () => clearTimeout(temporizador);
  }, [perfilId, pago?.estado, intentos]);

  // Cuando el pago se confirma, se recarga el perfil para que la app vea el plan nuevo.
  useEffect(() => {
    if (pago?.estado === 'pagado' && !refrescado.current) {
      refrescado.current = true;
      refrescar();
    }
  }, [pago?.estado, refrescar]);

  const etiquetaPlan = pago ? (CAPACIDADES[pago.plan as Plan]?.label ?? pago.plan) : '';
  const agotado = intentos >= MAX_INTENTOS && pago?.estado !== 'pagado' && pago?.estado !== 'fallido';

  return (
    <main className="flex-1 px-6 py-12 max-w-md mx-auto w-full flex flex-col items-center text-center gap-4">
      {pago?.estado === 'pagado' ? (
        <>
          <h1 className="text-[28px] leading-tight font-bold text-vela-text">¡Pago confirmado!</h1>
          <p className="text-base text-vela-text-faint">
            Tu plan {etiquetaPlan} ya está activo por 30 días.
          </p>
          <Link
            href="/explorar"
            className="mt-2 w-full h-14 rounded-full bg-vela-public text-white text-base font-bold flex items-center justify-center"
          >
            Ir a Vela
          </Link>
        </>
      ) : pago?.estado === 'fallido' ? (
        <>
          <h1 className="text-[28px] leading-tight font-bold text-vela-text">No se pudo completar el pago</h1>
          <p className="text-base text-vela-text-faint">No se hizo ningún cobro. Puedes intentarlo de nuevo.</p>
          <Link
            href="/planes"
            className="mt-2 w-full h-14 rounded-full bg-vela-public text-white text-base font-bold flex items-center justify-center"
          >
            Volver a los planes
          </Link>
        </>
      ) : agotado ? (
        <>
          <h1 className="text-[28px] leading-tight font-bold text-vela-text">Seguimos confirmando tu pago</h1>
          <p className="text-base text-vela-text-faint">
            Si ya pagaste, tu plan se activará solo en unos minutos. No necesitas pagar otra vez.
          </p>
          <Link
            href="/explorar"
            className="mt-2 w-full h-14 rounded-full bg-vela-surface-2 border border-vela-line text-vela-text text-base font-bold flex items-center justify-center"
          >
            Volver a Vela
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-[28px] leading-tight font-bold text-vela-text">Confirmando tu pago…</h1>
          <p className="text-base text-vela-text-faint">Esto toma unos segundos. No cierres esta pantalla.</p>
        </>
      )}
    </main>
  );
}