'use client';

/**
 * app/(auth)/login/page.tsx
 * Inicio de sesión solo con correo/teléfono + contraseña.
 * El código de verificación (OTP) se pide únicamente al crear la cuenta (registro).
 *
 * Fondo: /login-fondo.png (carpeta public). Ocupa TODA la pantalla, en celular y en computadora,
 * con un degradado oscuro para que el formulario se lea bien. Si la imagen no carga, queda fondo oscuro.
 *
 * Soporta ?next=/ruta-interna para volver a donde la persona iba
 * (ej. un perfil compartido) después de iniciar sesión.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { esCorreoValido } from '@/lib/utils/validaciones';

type Metodo = 'correo' | 'telefono';

const DIAL_SV = '+503';
// Si tu imagen es JPG, cambia la extensión a .jpg (y el archivo en public debe llamarse igual).
const FONDO_SRC = '/login-fondo.png';

/** Lee ?next= de la URL y solo lo acepta si es una ruta interna
 * segura (evita redirecciones a sitios externos). */
function leerNext(): string | null {
  if (typeof window === 'undefined') return null;
  const n = new URLSearchParams(window.location.search).get('next');
  if (!n) return null;
  if (!n.startsWith('/') || n.startsWith('//') || n.includes('\\')) return null;
  return n;
}

export default function Login() {
  const router = useRouter();
  const [metodo, setMetodo] = useState<Metodo>('correo');

  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const identificador = metodo === 'correo' ? email.trim() : `${DIAL_SV}${telefono}`;

  const correoValido = esCorreoValido(email);
  const telefonoValido = telefono.length === 8;

  const canContinuar =
    (metodo === 'correo' ? correoValido : telefonoValido) && password.length > 0;

  /** Decide a dónde mandar a la persona según el estado real de su perfil. */
  async function entrarSegunPerfil(userId: string) {
    const supabase = createClient();
    const { data: perfil, error: perfilError } = await supabase
      .from('perfiles')
      .select('cuenta_eliminada, es_admin, estado_verificacion, verificacion_notificada')
      .eq('id', userId)
      .single();

    if (perfilError || !perfil) {
      setError('Tu cuenta existe pero no se pudo cargar el perfil. Intenta de nuevo.');
      setLoading(false);
      return;
    }

    setLoading(false);

    if (perfil.cuenta_eliminada) {
      router.replace('/reactivar-cuenta');
      return;
    }
    if (perfil.es_admin) {
      router.replace('/admin/revision');
      return;
    }
    if (perfil.estado_verificacion === 'pendiente') {
      router.replace('/pendiente');
      return;
    }
    if (!perfil.verificacion_notificada) {
      router.replace(
        `/verificacion-resultado?resultado=${perfil.estado_verificacion === 'aprobado' ? 'aprobada' : 'rechazada'}`
      );
      return;
    }
    // Si venía de un link (ej. perfil compartido), vuelve allí.
    router.replace(leerNext() ?? '/explorar');
  }

  const handleContinuar = async () => {
    if (!canContinuar || loading) return;
    setLoading(true);
    setError('');
    const supabase = createClient();

    try {
      const { data, error: authError } =
        metodo === 'correo'
          ? await supabase.auth.signInWithPassword({ email: identificador, password })
          : await supabase.auth.signInWithPassword({ phone: identificador, password });

      if (authError || !data.session) {
        setLoading(false);
        setError(traducirError(authError?.message));
        return;
      }

      await entrarSegunPerfil(data.session.user.id);
    } catch (err) {
      setLoading(false);
      setError(traducirError(err));
    }
  };

  return (
    <div
      className="fixed inset-0 z-0 overflow-y-auto"
      style={{ backgroundColor: '#0D0D0D' }}
    >
      {/* Imagen de fondo a pantalla completa (celular y computadora). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={FONDO_SRC}
        alt=""
        aria-hidden="true"
        className="fixed inset-0 w-full h-full object-cover pointer-events-none"
        style={{ objectPosition: '75% center' }}
      />
      {/* Celular: oscurece más abajo, donde va el formulario. */}
      <div
        aria-hidden="true"
        className="md:hidden fixed inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, rgba(13,13,13,0.10) 0%, rgba(13,13,13,0.60) 45%, rgba(13,13,13,0.95) 100%)' }}
      />
      {/* Computadora: oscurece a la izquierda, donde va el formulario. */}
      <div
        aria-hidden="true"
        className="hidden md:block fixed inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(to right, rgba(13,13,13,0.90) 0%, rgba(13,13,13,0.55) 45%, rgba(13,13,13,0) 100%)' }}
      />

      <button
        onClick={() => router.back()}
        className="fixed top-4 left-4 z-20 w-11 h-11 rounded-xl bg-black/40 backdrop-blur flex items-center justify-center text-white"
        aria-label="Volver"
      >
        ←
      </button>

      <div className="relative z-10 min-h-full flex">
        <main className="flex-1 flex flex-col justify-end md:justify-center px-6 pt-72 pb-8 md:pt-10 w-full max-w-[28rem] md:max-w-[32rem] mx-auto md:mx-0 md:ml-[8vw]">
          <h1 className="font-serif italic text-4xl text-vela-public mb-4">Vela</h1>

          <h2 className="text-2xl font-extrabold text-white mb-1">Bienvenida de nuevo</h2>
          <p className="text-sm text-white/70 mb-5">Ingresa para continuar.</p>

          <div className="flex rounded-2xl p-1 mb-4" style={{ backgroundColor: 'rgba(31,31,35,0.9)' }}>
            <button
              onClick={() => { setMetodo('correo'); setError(''); }}
              className={`flex-1 h-11 rounded-xl text-sm font-semibold transition ${
                metodo === 'correo' ? 'bg-vela-public text-white' : 'text-white/50'
              }`}
            >
              Correo
            </button>
            <button
              onClick={() => { setMetodo('telefono'); setError(''); }}
              className={`flex-1 h-11 rounded-xl text-sm font-semibold transition ${
                metodo === 'telefono' ? 'bg-vela-public text-white' : 'text-white/50'
              }`}
            >
              Teléfono
            </button>
          </div>

          {metodo === 'correo' ? (
            <div className="mb-4">
              <label className="text-xs font-medium text-white/70">Correo electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value.replace(/\s/g, '')); setError(''); }}
                placeholder="tucorreo@ejemplo.com"
                autoComplete="email"
                className="w-full mt-1.5 border border-white/15 rounded-2xl px-4 h-14 text-base text-white placeholder:text-white/35 outline-none focus:border-vela-public/70"
                style={{ backgroundColor: 'rgba(31,31,35,0.9)' }}
              />
              {email.length > 0 && !correoValido && (
                <p className="text-xs text-vela-safety mt-1.5">Escribe un correo válido, por ejemplo nombre@dominio.com.</p>
              )}
            </div>
          ) : (
            <div className="mb-4">
              <label className="text-xs font-medium text-white/70">Teléfono</label>
              <div className="flex gap-2 mt-1.5">
                <div
                  className="border border-white/15 rounded-2xl px-4 h-14 flex items-center text-base font-bold text-white"
                  style={{ backgroundColor: 'rgba(31,31,35,0.9)' }}
                >
                  SV {DIAL_SV}
                </div>
                <input
                  type="tel"
                  value={telefono}
                  onChange={(e) => { setTelefono(e.target.value.replace(/\D/g, '').slice(0, 8)); setError(''); }}
                  placeholder="00000000"
                  autoComplete="tel-national"
                  className="flex-1 min-w-0 border border-white/15 rounded-2xl px-4 h-14 text-base text-white placeholder:text-white/35 outline-none focus:border-vela-public/70"
                  style={{ backgroundColor: 'rgba(31,31,35,0.9)' }}
                />
              </div>
              {telefono.length > 0 && !telefonoValido && (
                <p className="text-xs text-vela-safety mt-1.5">El teléfono debe tener 8 dígitos.</p>
              )}
            </div>
          )}

          <div className="mb-5">
            <div className="flex justify-between items-baseline">
              <label className="text-xs font-medium text-white/70">Contraseña</label>
              <Link href="/forgot" className="text-xs text-vela-public font-semibold">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <div className="relative mt-1.5">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="Tu contraseña"
                autoComplete="current-password"
                onKeyDown={(e) => e.key === 'Enter' && handleContinuar()}
                className="w-full border border-white/15 rounded-2xl pl-4 pr-24 h-14 text-base text-white placeholder:text-white/35 outline-none focus:border-vela-public/70"
                style={{ backgroundColor: 'rgba(31,31,35,0.9)' }}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 h-9 px-3 rounded-xl bg-white/10 text-xs font-bold text-white"
              >
                {showPass ? 'Ocultar' : 'Ver'}
              </button>
            </div>
          </div>

          {error !== '' && <p className="text-sm text-vela-safety mb-3">{error}</p>}

          <button
            onClick={handleContinuar}
            disabled={!canContinuar || loading}
            className={`w-full h-14 rounded-full font-bold text-base flex items-center justify-center gap-2 transition ${
              canContinuar ? 'bg-vela-public text-white active:scale-[0.98]' : 'bg-white/10 text-white/40'
            }`}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>

          <div className="flex justify-center gap-1 mt-5 text-sm">
            <span className="text-white/70">¿Aún no tienes cuenta?</span>
            <Link href="/registro" className="text-vela-public font-semibold">Créala aquí</Link>
          </div>

          <div className="flex items-center gap-2 justify-center mt-6 text-xs text-white/50">
            <span>🛡️</span>
            <span>Plataforma con verificación de identidad obligatoria</span>
          </div>
        </main>
      </div>
    </div>
  );
}

function traducirError(err?: unknown): string {
  let msg = '';
  if (typeof err === 'string') msg = err;
  else if (err instanceof Error) msg = err.message;
  else if (err && typeof err === 'object' && 'message' in err) msg = String((err as any).message);

  if (!msg || msg.trim() === '' || msg.trim() === '{}') {
    return 'No se pudo completar la acción. Revisa tu conexión o intenta de nuevo en unos segundos.';
  }

  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo/teléfono o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Debes confirmar tu correo antes de iniciar sesión.';
  if (m.includes('rate limit') || m.includes('security purposes'))
    return 'Demasiados intentos. Espera un momento antes de volver a intentar.';
  return msg;
}