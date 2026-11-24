'use client';

/**
 * app/(app)/planes/gracias/page.tsx
 * A donde Wompi devuelve al cliente después de pagar. Esta página NO activa el plan por sí sola:
 * le pide al servidor que confirme el pago con Wompi (con el idTransaccion que Wompi agrega a la
 * dirección) y muestra el avance. Al confirmarse, lleva al cliente a Vela.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { CAPACIDADES, type Plan } from '@/lib/planes/capacidades';

type Fase = 'verificando' | 'pagado' | 'no_aprobada' | 'problema' | 'agotado';

const LIMITE_SEGUNDOS = 60;
const CADA_MS = 3000;

export default function PagoGracias() {
  const router = useRouter();
  const { perfil, refrescar } = useSession();
  const perfilId = perfil?.id;

  const [fase, setFase] = useState<Fase>('verificando');
  const [segundos, setSegundos] = useState(0);
  const [etiquetaPlan, setEtiquetaPlan] = useState('');

  const refrescarRef = useRef(refrescar);
  refrescarRef.current = refrescar;

  // Cronómetro visible mientras se confirma el pago.
  useEffect(() => {
    if (fase !== 'verificando') return;
    const intervalo = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(intervalo);
  }, [fase]);

  useEffect(() => {
    if (fase === 'verificando' && segundos >= LIMITE_SEGUNDOS) setFase('agotado');
  }, [fase, segundos]);

  // Pregunta al servidor cada pocos segundos hasta tener una respuesta final.
  useEffect(() => {
    if (!perfilId || fase !== 'verificando') return;
    let cancelado = false;

    const consultas = new URLSearchParams(window.location.search);
    const referencia = consultas.get('identificadorEnlaceComercio');
    const idTransaccion = consultas.get('idTransaccion');

    function ponerPlan(plan: string | null | undefined) {
      if (plan) setEtiquetaPlan(CAPACIDADES[plan as Plan]?.label ?? plan);
    }

    async function consultarUnaVez(): Promise<Fase | 'seguir'> {
      const supabase = createClient();

      if (referencia && idTransaccion) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          try {
            const resp = await fetch('/api/wompi/verificar-pago', {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
              body: JSON.stringify({ referencia, idTransaccion }),
            });
            const json = await resp.json().catch(() => ({} as any));
            if (json.estado === 'pagado') {
              ponerPlan(json.plan);
              return 'pagado';
            }
            if (json.estado === 'no_aprobada') return 'no_aprobada';
            if (['monto_no_coincide', 'no_existe', 'no_autorizado'].includes(json.estado)) return 'problema';
          } catch {
            // sin conexión un momento: se vuelve a intentar
          }
        }
        return 'seguir';
      }

      // Entró a esta página sin los datos de Wompi: solo se mira si el pago ya quedó activo.
      const { data: fila } = await supabase
        .from('pagos')
        .select('estado, plan')
        .eq('usuario_id', perfilId)
        .order('creado_en', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fila?.estado === 'pagado') {
        ponerPlan(fila.plan);
        return 'pagado';
      }
      return 'seguir';
    }

    async function ciclo() {
      while (!cancelado) {
        const r = await consultarUnaVez();
        if (cancelado) return;
        if (r !== 'seguir') {
          setFase(r);
          return;
        }
        await new Promise((res) => setTimeout(res, CADA_MS));
      }
    }
    ciclo();

    return () => {
      cancelado = true;
    };
  }, [perfilId, fase]);

  // Al confirmarse: se recarga el perfil (plan nuevo) y se lleva al cliente a Vela.
  useEffect(() => {
    if (fase !== 'pagado') return;
    refrescarRef.current();
    const temporizador = setTimeout(() => router.push('/explorar'), 2500);
    return () => clearTimeout(temporizador);
  }, [fase, router]);

  const porcentaje = Math.min(100, Math.round((segundos / LIMITE_SEGUNDOS) * 100));

  return (
    <main className="flex-1 px-6 py-12 max-w-md mx-auto w-full flex flex-col items-center text-center gap-4">
      {fase === 'pagado' ? (
        <>
          <h1 className="text-[28px] leading-tight font-bold text-vela-text">¡Pago confirmado!</h1>
          <p className="text-base text-vela-text-faint">
            {etiquetaPlan ? `Tu plan ${etiquetaPlan} ya está activo.` : 'Tu plan ya está activo.'}
          </p>
          <p className="text-sm text-vela-text-faint">Te llevamos a Vela…</p>
          <Link
            href="/explorar"
            className="mt-2 w-full h-14 rounded-full bg-vela-public text-white text-base font-bold flex items-center justify-center"
          >
            Ir a Vela ahora
          </Link>
        </>
      ) : fase === 'no_aprobada' ? (
        <>
          <h1 className="text-[28px] leading-tight font-bold text-vela-text">Wompi no aprobó el pago</h1>
          <p className="text-base text-vela-text-faint">
            No se activó ningún plan. Si ves un cobro en tu tarjeta, guarda el comprobante de Wompi y escríbenos.
          </p>
          <Link
            href="/planes"
            className="mt-2 w-full h-14 rounded-full bg-vela-public text-white text-base font-bold flex items-center justify-center"
          >
            Volver a los planes
          </Link>
        </>
      ) : fase === 'problema' ? (
        <>
          <h1 className="text-[28px] leading-tight font-bold text-vela-text">Hubo un problema con tu pago</h1>
          <p className="text-base text-vela-text-faint">
            No pudimos ligar el pago a tu cuenta. Si te cobraron, guarda el comprobante de Wompi y escríbenos
            para activarlo manualmente.
          </p>
          <Link
            href="/explorar"
            className="mt-2 w-full h-14 rounded-full bg-vela-surface-2 border border-vela-line text-vela-text text-base font-bold flex items-center justify-center"
          >
            Volver a Vela
          </Link>
        </>
      ) : fase === 'agotado' ? (
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
          <p className="text-base text-vela-text-faint">
            Esto suele tardar menos de un minuto. No cierres esta pantalla.
          </p>
          <div className="w-full h-2 rounded-full bg-vela-surface-2 overflow-hidden mt-2" aria-hidden="true">
            <div
              className="h-full bg-vela-public transition-all duration-1000 ease-linear"
              style={{ width: `${porcentaje}%` }}
            />
          </div>
          <p className="text-sm text-vela-text-faint">{segundos} s</p>
        </>
      )}
    </main>
  );
}