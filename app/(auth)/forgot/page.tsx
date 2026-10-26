'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Paso = 'correo' | 'enviado' | 'nueva-contrasena';

function IconoFlecha() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export default function Forgot() {
  return (
    <Suspense fallback={null}>
      <ForgotContenido />
    </Suspense>
  );
}

function ForgotContenido() {
  const router = useRouter();
  const params = useSearchParams();
  const [paso, setPaso] = useState<Paso>('correo');
  const [correo, setCorreo] = useState('');
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (params.get('paso') === 'nueva-contrasena') setPaso('nueva-contrasena');
  }, [params]);

  const passwordValid =
    nuevaPassword.length >= 8 &&
    /[A-Z]/.test(nuevaPassword) &&
    /[a-z]/.test(nuevaPassword) &&
    /[0-9]/.test(nuevaPassword) &&
    /[!@#$%^&*(),.?":{}|<>_\-+=/\\[\];'`~]/.test(nuevaPassword);

  async function enviarEnlace() {
    if (correo.trim().length < 4 || loading) return;
    setLoading(true);
    setError('');
    const supabase = createClient();
    const { error: err } = await supabase.auth.resetPasswordForEmail(correo.trim(), {
      redirectTo: `${window.location.origin}/forgot?paso=nueva-contrasena`,
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setPaso('enviado');
  }

  async function guardarNuevaPassword() {
    if (!passwordValid || loading) return;
    setLoading(true);
    setError('');
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password: nuevaPassword });
    setLoading(false);
    if (err) { setError(err.message); return; }
    router.replace('/login');
  }

  return (
    <main className="flex-1 flex flex-col px-6 py-8 max-w-md mx-auto w-full">
      <button
        onClick={() => router.back()}
        className="w-11 h-11 rounded-full bg-vela-surface-2 border border-vela-line flex items-center justify-center mb-5 text-vela-text"
        aria-label="Volver"
      >
        ←
      </button>
      <h1 className="font-serif italic text-4xl text-vela-public mb-5">Vela</h1>

      {paso === 'correo' && (
        <>
          <h2 className="text-[28px] leading-tight font-bold text-vela-text mb-2">Recuperar contraseña</h2>
          <p className="text-base text-vela-text-faint mb-6">Te enviaremos un enlace a tu correo para crear una nueva contraseña.</p>
          <input
            type="email"
            value={correo}
            onChange={(e) => { setCorreo(e.target.value); setError(''); }}
            placeholder="tucorreo@ejemplo.com"
            className="w-full h-14 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 text-base text-vela-text outline-none focus:border-vela-public/60 mb-3"
          />
          {error !== '' && <p className="text-sm text-vela-safety mb-3">{error}</p>}
          <button
            onClick={enviarEnlace}
            disabled={correo.trim().length < 4 || loading}
            className="w-full h-14 flex items-center justify-center gap-2 rounded-full font-bold text-base bg-vela-public text-white disabled:bg-vela-surface-2 disabled:text-vela-text-faint"
          >
            {loading ? 'Enviando...' : 'Enviar enlace'}
            {!loading && <IconoFlecha />}
          </button>
        </>
      )}

      {paso === 'enviado' && (
        <div className="flex flex-col items-center text-center gap-4 mt-8">
          <div className="w-16 h-16 rounded-full bg-vela-verified-soft border border-vela-verified flex items-center justify-center text-2xl">✓</div>
          <p className="text-xl text-vela-text font-bold">Revisa tu correo</p>
          <p className="text-base text-vela-text-faint max-w-xs">Te enviamos un enlace a {correo} para crear una nueva contraseña.</p>
        </div>
      )}

      {paso === 'nueva-contrasena' && (
        <>
          <h2 className="text-[28px] leading-tight font-bold text-vela-text mb-2">Crea tu nueva contraseña</h2>
          <input
            type="password"
            value={nuevaPassword}
            onChange={(e) => { setNuevaPassword(e.target.value); setError(''); }}
            placeholder="Nueva contraseña"
            className="w-full h-14 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 text-base text-vela-text outline-none focus:border-vela-public/60 mt-4 mb-3"
          />
          {error !== '' && <p className="text-sm text-vela-safety mb-3">{error}</p>}
          <button
            onClick={guardarNuevaPassword}
            disabled={!passwordValid || loading}
            className="w-full h-14 flex items-center justify-center gap-2 rounded-full font-bold text-base bg-vela-public text-white disabled:bg-vela-surface-2 disabled:text-vela-text-faint"
          >
            {loading ? 'Guardando...' : 'Guardar contraseña'}
            {!loading && <IconoFlecha />}
          </button>
        </>
      )}
    </main>
  );
}