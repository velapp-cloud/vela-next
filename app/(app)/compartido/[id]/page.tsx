'use client';

import { useEffect, useState, use as usePromise } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { tienePlanActivo } from '@/lib/planes/planActivo';

/**
 * app/compartido/[id]/page.tsx
 * Destino de los links que se comparten de un perfil.
 *  - Sin sesión: alerta para ingresar credenciales + nota de plan activo.
 *  - Con sesión y plan de paga activo: pasa directo al perfil completo.
 *  - Con sesión pero sin plan activo (modo gratuito): ve la información,
 *    pero NO las fotos, con la nota de plan activo.
 *    (Si ese mismo perfil le aparece luego en su búsqueda normal en
 *    Explorar, lo ve completo como cualquier otro.)
 */
type Estado = 'cargando' | 'sinSesion' | 'sinPlan' | 'ok';

type Vista = {
  alias: string;
  edad: number | null;
  ciudad: string | null;
  estatura: string | null;
  nota_publica: string | null;
  avatar_color: string;
};

export default function Compartido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>('cargando');
  const [vista, setVista] = useState<Vista | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      if (!userId) {
        setEstado('sinSesion');
        return;
      }

      const { data: yo, error } = await supabase
        .from('perfiles')
        .select('plan, plan_vence_en')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        // Si la columna plan_vence_en aún no existe, no dejamos a nadie afuera.
        console.error('Error revisando el plan:', error.message);
        router.replace(`/perfil-detalle/${id}`);
        return;
      }

      if (tienePlanActivo(yo?.plan, yo?.plan_vence_en)) {
        router.replace(`/perfil-detalle/${id}`);
        return;
      }

      const { data: pub } = await supabase
        .from('perfiles_publicos')
        .select('alias, edad, ciudad, estatura, nota_publica, avatar_color')
        .eq('id', id)
        .maybeSingle();
      setVista(pub ?? null);
      setEstado('sinPlan');
    })();
  }, [id, router]);

  if (estado === 'cargando' || estado === 'ok') {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-vela-text-faint">Cargando...</p>
      </main>
    );
  }

  if (estado === 'sinSesion') {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm rounded-2xl border border-vela-line bg-vela-surface p-6 text-center">
          <p className="mb-2 text-4xl">🔒</p>
          <h1 className="mb-2 text-lg font-extrabold text-vela-text">Ingresa para ver este perfil</h1>
          <p className="mb-4 text-sm text-vela-text-dim">
            Alguien compartió un perfil de Vela contigo. Ingresa tus credenciales para poder verlo.
          </p>
          <div className="mb-5 rounded-xl border border-vela-amber bg-vela-amber-soft p-3 text-left">
            <p className="text-xs text-vela-text-dim">
              <span className="font-bold text-vela-text">Nota:</span> necesitas tener un{' '}
              <span className="font-bold text-vela-text">plan de pago activo</span> para poder ver perfiles compartidos.
            </p>
          </div>
          <Link
            href={`/login?next=/compartido/${id}`}
            className="block w-full rounded-full bg-vela-public py-3.5 text-sm font-bold text-white"
          >
            Ingresar
          </Link>
          <Link href="/welcome" className="mt-3 block text-xs font-semibold text-vela-text-faint underline">
            Conocer Vela
          </Link>
        </div>
      </main>
    );
  }

  // sinPlan: información sí, fotos no.
  return (
    <main className="flex-1 flex flex-col max-w-md mx-auto w-full px-6 py-8 gap-4">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-vela-line bg-vela-surface md:aspect-[16/10]">
        <div className="absolute inset-0" style={{ backgroundColor: vista?.avatar_color ?? '#2A2A30' }} />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 backdrop-blur-xl">
          <span className="text-4xl">🔒</span>
          <p className="px-6 text-center text-sm font-semibold text-white">
            Las fotos están bloqueadas en modo gratuito
          </p>
        </div>
      </div>

      {vista ? (
        <div className="rounded-xl border border-vela-line bg-vela-surface p-4">
          <h1 className="text-xl font-extrabold italic text-vela-text">
            {vista.alias}{vista.edad ? `, ${vista.edad}` : ''}
          </h1>
          <p className="mt-1 text-sm text-vela-text-faint">
            📍 {vista.ciudad || 'Sin ciudad'} · 🏃 {vista.estatura || '—'}
          </p>
          {vista.nota_publica && (
            <p className="mt-3 text-sm leading-relaxed text-vela-text">{vista.nota_publica}</p>
          )}
        </div>
      ) : (
        <p className="text-center text-sm text-vela-text-faint">No pudimos cargar este perfil.</p>
      )}

      <div className="rounded-xl border border-vela-amber bg-vela-amber-soft p-3">
        <p className="text-xs text-vela-text-dim">
          <span className="font-bold text-vela-text">Nota:</span> necesitas un{' '}
          <span className="font-bold text-vela-text">plan de pago activo</span> para ver las fotos y el perfil completo
          de quien te compartieron.
        </p>
      </div>

      <Link href="/planes" className="block w-full rounded-full bg-vela-public py-3.5 text-center text-sm font-bold text-white">
        Ver planes
      </Link>
      <Link href="/explorar" className="text-center text-xs font-semibold text-vela-text-faint underline">
        Ir a Explorar
      </Link>
    </main>
  );
}