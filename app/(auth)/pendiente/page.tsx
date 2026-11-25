'use client';

/**
 * app/(auth)/pendiente/page.tsx
 * Pantalla de espera después del registro. Aquí también regresa Didit al terminar la verificación.
 * - Revisa cada 4 s si la cuenta ya salió de "pendiente" (aprobada o rechazada) y entra a la app;
 *   el layout de la app decide a qué pantalla mostrar según el estado.
 * - Si la verificación automática quedó incompleta (abandonada, expirada, rechazada por Didit o sin
 *   terminar), ofrece continuarla.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function IconoFlecha() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

// Estados de Didit en los que la persona puede (o debe) retomar la verificación.
const DIDIT_RETOMABLE = ['Not Started', 'In Progress', 'Awaiting User', 'Abandoned', 'Expired', 'Declined'];

export default function Pendiente() {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);
  const [diditEstado, setDiditEstado] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const [error, setError] = useState('');

  const revisar = useCallback(async () => {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;

    const { data: perfil } = await supabase
      .from('perfiles')
      .select('estado_verificacion')
      .eq('id', uid)
      .single();

    // Si ya no está pendiente, la app decide qué mostrar (aprobada, rechazada, etc.).
    if (perfil && perfil.estado_verificacion !== 'pendiente') {
      router.replace('/explorar');
      return;
    }

    const { data: verif } = await supabase
      .from('verificaciones_identidad')
      .select('proveedor, didit_estado')
      .eq('perfil_id', uid)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    setDiditEstado(verif?.proveedor === 'didit' ? verif.didit_estado ?? 'Not Started' : null);
  }, [router]);

  useEffect(() => {
    revisar();
    const t = setInterval(revisar, 4000);
    return () => clearInterval(t);
  }, [revisar]);

  async function irAlLogin() {
    if (saliendo) return;
    setSaliendo(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
  }

  async function continuarVerificacion() {
    if (iniciando) return;
    setIniciando(true);
    setError('');
    try {
      const supabase = createClient();
      const { data: sesionData } = await supabase.auth.getSession();
      const res = await fetch('/api/didit/crear-sesion', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sesionData.session?.access_token ?? ''}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) {
        setError(json?.error ?? 'No se pudo iniciar la verificación. Intenta de nuevo.');
        setIniciando(false);
        return;
      }
      window.location.href = json.url as string;
    } catch {
      setError('No se pudo iniciar la verificación. Intenta de nuevo.');
      setIniciando(false);
    }
  }

  const enRevisionDidit = diditEstado === 'In Review';
  const puedeContinuar = diditEstado !== null && DIDIT_RETOMABLE.includes(diditEstado);
  const esDeclinada = diditEstado === 'Declined';

  return (
    <main className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-5">
      <div className="w-20 h-20 rounded-full bg-vela-amber-soft border border-vela-amber flex items-center justify-center text-3xl">⏳</div>
      <h1 className="text-[28px] leading-tight font-bold text-vela-text">Tu cuenta está en revisión</h1>

      {puedeContinuar ? (
        <p className="text-base text-vela-text-faint max-w-xs">
          {esDeclinada
            ? 'No pudimos confirmar tu identidad automáticamente. Puedes intentarlo de nuevo con buena luz y tu documento a la vista.'
            : 'Tu verificación de identidad no está terminada. Continúa para que podamos aprobar tu cuenta.'}
        </p>
      ) : enRevisionDidit ? (
        <p className="text-base text-vela-text-faint max-w-xs">
          Tu verificación necesita una revisión adicional del equipo de Vela. Te avisaremos por correo en cuanto esté lista.
        </p>
      ) : (
        <p className="text-base text-vela-text-faint max-w-xs">
          Estamos revisando tu identidad. Esta pantalla se actualiza sola y te avisaremos por correo en cuanto esté lista — normalmente toma poco tiempo.
        </p>
      )}

      {puedeContinuar && (
        <button
          onClick={continuarVerificacion}
          disabled={iniciando}
          className="w-full max-w-xs h-14 flex items-center justify-center gap-2 rounded-full bg-vela-public text-white text-base font-bold disabled:opacity-60"
        >
          {iniciando ? 'Preparando...' : 'Continuar verificación'}
          {!iniciando && <IconoFlecha />}
        </button>
      )}
      {error !== '' && <p className="text-sm text-vela-safety max-w-xs">{error}</p>}

      <button
        onClick={irAlLogin}
        disabled={saliendo}
        className="mt-2 w-full max-w-xs h-14 flex items-center justify-center gap-2 rounded-full bg-vela-surface-2 border border-vela-line text-vela-text text-base font-bold disabled:opacity-60"
      >
        {saliendo ? 'Saliendo...' : 'Volver al inicio de sesión'}
        {!saliendo && <IconoFlecha />}
      </button>
      <p className="text-xs text-vela-text-faint max-w-xs">
        Se cerrará tu sesión actual. Podrás volver a entrar cuando quieras.
      </p>
    </main>
  );
}