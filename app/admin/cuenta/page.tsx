'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { RolBadge } from '@/components/AdminPerfil';

function traducirError(msg?: string): string {
  if (!msg) return 'No se pudo completar la acción. Intenta de nuevo.';
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'La contraseña actual no es correcta.';
  if (m.includes('different from the old') || m.includes('same password')) return 'La nueva contraseña debe ser distinta a la actual.';
  if (m.includes('rate limit') || m.includes('security purposes')) return 'Demasiados intentos. Espera un momento.';
  if (m.includes('already') || m.includes('registered')) return 'Ese correo ya está en uso.';
  return msg;
}

export default function CuentaAdmin() {
  const router = useRouter();
  const [cargando, setCargando] = useState(true);
  const [alias, setAlias] = useState('');
  const [correo, setCorreo] = useState('');
  const [miembroDesde, setMiembroDesde] = useState<string | null>(null);

  // Contraseña
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [guardandoPass, setGuardandoPass] = useState(false);
  const [msgPass, setMsgPass] = useState<{ ok: boolean; texto: string } | null>(null);

  // Correo
  const [nuevoCorreo, setNuevoCorreo] = useState('');
  const [guardandoCorreo, setGuardandoCorreo] = useState(false);
  const [msgCorreo, setMsgCorreo] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) { router.replace('/login'); return; }

      const emailAuth = user.email ?? '';
      setCorreo(emailAuth);
      setMiembroDesde(user.created_at ?? null);

      const { data: perfil } = await supabase.from('perfiles').select('alias, correo').eq('id', user.id).single();
      setAlias(perfil?.alias ?? '');

      // Si cambió el correo de acceso, se sincroniza el correo guardado en el perfil.
      if (emailAuth && perfil && perfil.correo !== emailAuth) {
        await supabase.from('perfiles').update({ correo: emailAuth }).eq('id', user.id);
      }
      setCargando(false);
    })();
  }, [router]);

  const passLargoOk = nueva.length >= 8;
  const passMayus = /[A-Z]/.test(nueva);
  const passMinus = /[a-z]/.test(nueva);
  const passNumero = /[0-9]/.test(nueva);
  const passSimbolo = /[!@#$%^&*(),.?":{}|<>_\-+=/\\[\];'`~]/.test(nueva);
  const passValida = passLargoOk && passMayus && passMinus && passNumero && passSimbolo;
  const coinciden = nueva.length > 0 && nueva === confirmar;
  const puedeCambiarPass = actual.length > 0 && passValida && coinciden && !guardandoPass;

  async function cambiarPassword() {
    if (!puedeCambiarPass) return;
    setGuardandoPass(true);
    setMsgPass(null);
    const supabase = createClient();

    // Se confirma la contraseña actual antes de cambiarla.
    const { error: errAuth } = await supabase.auth.signInWithPassword({ email: correo, password: actual });
    if (errAuth) {
      setMsgPass({ ok: false, texto: traducirError(errAuth.message) });
      setGuardandoPass(false);
      return;
    }

    const { error: errUpd } = await supabase.auth.updateUser({ password: nueva });
    if (errUpd) {
      setMsgPass({ ok: false, texto: traducirError(errUpd.message) });
      setGuardandoPass(false);
      return;
    }

    setActual(''); setNueva(''); setConfirmar('');
    setMsgPass({ ok: true, texto: 'Contraseña actualizada.' });
    setGuardandoPass(false);
  }

  const correoNuevoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevoCorreo.trim()) && nuevoCorreo.trim().toLowerCase() !== correo.toLowerCase();

  async function cambiarCorreo() {
    if (!correoNuevoValido || guardandoCorreo) return;
    setGuardandoCorreo(true);
    setMsgCorreo(null);
    const supabase = createClient();
    const { error: errUpd } = await supabase.auth.updateUser({ email: nuevoCorreo.trim() });
    if (errUpd) {
      setMsgCorreo({ ok: false, texto: traducirError(errUpd.message) });
      setGuardandoCorreo(false);
      return;
    }
    setMsgCorreo({
      ok: true,
      texto: `Enviamos un correo de confirmación a ${nuevoCorreo.trim()}. Ábrelo para confirmar el cambio; después entrarás con ese correo nuevo.`,
    });
    setNuevoCorreo('');
    setGuardandoCorreo(false);
  }

  async function cerrarSesion() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (cargando) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-vela-text-faint">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 px-5 py-6 max-w-2xl mx-auto w-full flex flex-col gap-4">
      <h1 className="text-xl font-extrabold text-vela-text">Mi cuenta</h1>

      <Seccion titulo="DATOS DE LA CUENTA">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-base font-extrabold italic text-vela-text">{alias || 'Administrador'}</p>
          <RolBadge esAdmin rol="" />
        </div>
        <Fila label="Correo" valor={correo || '—'} />
        <Fila
          label="Miembro desde"
          valor={
            miembroDesde
              ? new Date(miembroDesde).toLocaleDateString('es-SV', { day: 'numeric', month: 'long', year: 'numeric' })
              : '—'
          }
        />
      </Seccion>

      <Seccion titulo="CAMBIAR CONTRASEÑA">
        <div className="flex flex-col gap-3">
          <CampoPass label="Contraseña actual" value={actual} onChange={setActual} />
          <CampoPass label="Nueva contraseña" value={nueva} onChange={setNueva} />
          {nueva.length > 0 && (
            <div className="bg-vela-surface-2 rounded-xl border border-vela-line p-3 space-y-1.5">
              <Regla ok={passLargoOk} texto="Mínimo 8 caracteres" />
              <Regla ok={passMayus} texto="Al menos una mayúscula" />
              <Regla ok={passMinus} texto="Al menos una minúscula" />
              <Regla ok={passNumero} texto="Al menos un número" />
              <Regla ok={passSimbolo} texto="Al menos un símbolo especial" />
            </div>
          )}
          <CampoPass label="Confirmar nueva contraseña" value={confirmar} onChange={setConfirmar} />
          {confirmar.length > 0 && !coinciden && (
            <p className="text-xs text-vela-safety -mt-1">Las contraseñas no coinciden.</p>
          )}
          {msgPass && (
            <p className={`text-xs ${msgPass.ok ? 'text-vela-verified' : 'text-vela-safety'}`}>{msgPass.texto}</p>
          )}
          <button
            onClick={cambiarPassword}
            disabled={!puedeCambiarPass}
            className={`w-full py-3 rounded-full text-sm font-bold ${
              puedeCambiarPass ? 'bg-vela-public text-white' : 'bg-vela-surface-2 text-vela-text-faint'
            }`}
          >
            {guardandoPass ? 'Guardando...' : 'Actualizar contraseña'}
          </button>
        </div>
      </Seccion>

      <Seccion titulo="CAMBIAR CORREO">
        <p className="text-[11px] text-vela-text-faint mb-3">
          El código de acceso de tu sesión se envía a tu correo. Si lo cambias, usa uno al que tengas acceso.
        </p>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium text-vela-text-faint">Nuevo correo</label>
            <input
              type="email"
              value={nuevoCorreo}
              onChange={(e) => { setNuevoCorreo(e.target.value); setMsgCorreo(null); }}
              placeholder="nuevo@ejemplo.com"
              className="w-full mt-1.5 bg-vela-surface-2 border border-vela-line rounded-xl px-4 py-3 text-sm text-vela-text outline-none focus:border-vela-public/60"
            />
          </div>
          {msgCorreo && (
            <p className={`text-xs ${msgCorreo.ok ? 'text-vela-verified' : 'text-vela-safety'}`}>{msgCorreo.texto}</p>
          )}
          <button
            onClick={cambiarCorreo}
            disabled={!correoNuevoValido || guardandoCorreo}
            className={`w-full py-3 rounded-full text-sm font-bold ${
              correoNuevoValido ? 'bg-vela-public text-white' : 'bg-vela-surface-2 text-vela-text-faint'
            }`}
          >
            {guardandoCorreo ? 'Enviando...' : 'Enviar confirmación al nuevo correo'}
          </button>
        </div>
      </Seccion>

      <button
        onClick={cerrarSesion}
        className="w-full py-3.5 rounded-full border border-vela-safety text-vela-safety text-sm font-bold"
      >
        Cerrar sesión
      </button>
    </main>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-vela-surface border border-vela-line border-l-2 border-l-vela-public rounded-xl p-4">
      <p className="text-[11px] font-bold text-vela-public tracking-wide mb-3">{titulo}</p>
      {children}
    </div>
  );
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="py-2.5 border-b border-vela-line last:border-b-0">
      <p className="text-[10px] text-vela-text-faint mb-0.5">{label}</p>
      <p className="text-sm text-vela-text font-semibold break-all">{valor}</p>
    </div>
  );
}

function CampoPass({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-vela-text-faint">{label}</label>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        className="w-full mt-1.5 bg-vela-surface-2 border border-vela-line rounded-xl px-4 py-3 text-sm text-vela-text outline-none focus:border-vela-public/60"
      />
    </div>
  );
}

function Regla({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs ${ok ? 'text-vela-verified' : 'text-vela-text-faint'}`}>{ok ? '✓' : '○'}</span>
      <span className={`text-xs ${ok ? 'text-vela-text' : 'text-vela-text-faint'}`}>{texto}</span>
    </div>
  );
}