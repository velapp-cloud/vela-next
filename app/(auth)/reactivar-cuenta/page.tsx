'use client';

import { useState } from 'react';
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

export default function ReactivarCuenta() {
  const router = useRouter();
  const [procesando, setProcesando] = useState(false);

  async function reactivar() {
    setProcesando(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) { setProcesando(false); return; }

    await supabase
      .from('perfiles')
      .update({ cuenta_eliminada: false, cuenta_eliminada_en: null, perfil_activo: true })
      .eq('id', userId);

    router.replace('/explorar');
  }

  async function noReactivar() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/welcome');
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-5">
      <h1 className="text-[28px] leading-tight font-bold text-vela-text">¿Quieres reactivar tu cuenta?</h1>
      <p className="text-base text-vela-text-faint max-w-xs">
        Tu cuenta fue eliminada anteriormente, pero tus datos siguen intactos. Puedes reactivarla ahora sin llenar nada de nuevo.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs mt-2">
        <button
          onClick={reactivar}
          disabled={procesando}
          className="h-14 flex items-center justify-center gap-2 bg-vela-public text-white text-base font-bold rounded-full disabled:opacity-60"
        >
          {procesando ? 'Reactivando...' : 'Sí, reactivar mi cuenta'}
          {!procesando && <IconoFlecha />}
        </button>
        <button onClick={noReactivar} className="min-h-11 text-vela-text-faint text-base font-semibold py-2">
          No, cerrar sesión
        </button>
      </div>
    </main>
  );
}