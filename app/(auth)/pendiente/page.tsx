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

export default function Pendiente() {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  async function irAlLogin() {
    if (saliendo) return;
    setSaliendo(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-5">
      <div className="w-20 h-20 rounded-full bg-vela-amber-soft border border-vela-amber flex items-center justify-center text-3xl">⏳</div>
      <h1 className="text-[28px] leading-tight font-bold text-vela-text">Tu cuenta está en revisión</h1>
      <p className="text-base text-vela-text-faint max-w-xs">
        Un administrador está revisando tu identidad. Te avisaremos por correo en cuanto esté lista — normalmente toma poco tiempo.
      </p>
      <button
        onClick={irAlLogin}
        disabled={saliendo}
        className="mt-2 w-full max-w-xs h-14 flex items-center justify-center gap-2 rounded-full bg-vela-public text-white text-base font-bold disabled:opacity-60"
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