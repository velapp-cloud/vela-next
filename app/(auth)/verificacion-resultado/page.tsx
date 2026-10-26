'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function IconoFlecha() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export default function VerificacionResultado() {
  return (
    <Suspense fallback={null}>
      <VerificacionResultadoContenido />
    </Suspense>
  );
}

function VerificacionResultadoContenido() {
  const params = useSearchParams();
  const router = useRouter();
  const resultado = params.get('resultado'); // 'aprobada' | 'rechazada'
  const [marcando, setMarcando] = useState(true);
  const [motivo, setMotivo] = useState<string | null>(null);

  const aprobada = resultado === 'aprobada';

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (userId) {
        await supabase.from('perfiles').update({ verificacion_notificada: true }).eq('id', userId);

        if (!aprobada) {
          const { data } = await supabase
            .from('verificaciones_identidad')
            .select('motivo_rechazo')
            .eq('perfil_id', userId)
            .not('motivo_rechazo', 'is', null)
            .order('creado_en', { ascending: false })
            .limit(1);
          setMotivo(data?.[0]?.motivo_rechazo ?? null);
        }
      }
      setMarcando(false);
    })();
  }, [aprobada]);

  async function cerrarSesion() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-5">
      <div
        className={`w-20 h-20 rounded-full border flex items-center justify-center text-3xl ${
          aprobada ? 'bg-vela-verified-soft border-vela-verified' : 'bg-vela-safety-soft border-vela-safety'
        }`}
      >
        {aprobada ? '✓' : '✕'}
      </div>
      <h1 className="text-[28px] leading-tight font-bold text-vela-text">
        {aprobada ? '¡Tu cuenta fue aprobada!' : 'Tu verificación no fue aprobada'}
      </h1>

      {aprobada ? (
        <p className="text-base text-vela-text-faint max-w-xs">Ya puedes empezar a usar Vela con normalidad.</p>
      ) : (
        <>
          <p className="text-base text-vela-text-faint max-w-xs">
            No pudimos confirmar tu identidad con los documentos que enviaste.
          </p>
          {motivo && (
            <div className="max-w-sm w-full text-left rounded-2xl border border-vela-safety/40 bg-vela-safety-soft p-4">
              <p className="text-xs font-bold tracking-wide text-vela-safety mb-1.5">COMENTARIO DEL EQUIPO DE VELA</p>
              <p className="text-base text-vela-text-dim whitespace-pre-wrap">{motivo}</p>
            </div>
          )}
        </>
      )}

      {aprobada ? (
        <button
          onClick={() => router.replace('/explorar')}
          disabled={marcando}
          className="mt-2 w-full max-w-xs h-14 flex items-center justify-center gap-2 bg-vela-public text-white text-base font-bold rounded-full disabled:opacity-60"
        >
          Ir a Explorar
          <IconoFlecha />
        </button>
      ) : (
        <div className="mt-2 flex flex-col gap-2 w-full max-w-xs">
          <button
            onClick={() => router.replace('/reenviar-verificacion')}
            disabled={marcando}
            className="h-14 flex items-center justify-center gap-2 bg-vela-public text-white text-base font-bold rounded-full disabled:opacity-60"
          >
            Volver a enviar mis documentos
            <IconoFlecha />
          </button>
          <button
            onClick={cerrarSesion}
            className="min-h-11 text-base text-vela-text-faint font-semibold py-2"
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </main>
  );
}