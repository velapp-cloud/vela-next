'use client';

/**
 * components/PopupPruebaVip.tsx
 * Aviso que se muestra UNA sola vez (por perfil, en este dispositivo) cuando la cuenta se aprueba y
 * empieza la prueba VIP gratis: dice qué plan está activo, cuándo termina y permite renovar al instante.
 * No importa useSession (para evitar un ciclo de importación): recibe los datos por props.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

function textoRestante(finMs: number): string {
  const ms = Math.max(0, finMs - Date.now());
  const horasTotales = Math.floor(ms / 3_600_000);
  const dias = Math.floor(horasTotales / 24);
  const horas = horasTotales % 24;
  if (dias >= 1) return `${dias} ${dias === 1 ? 'día' : 'días'}${horas > 0 ? ` y ${horas} h` : ''}`;
  if (horasTotales >= 1) return `${horasTotales} h`;
  return 'menos de 1 hora';
}

export default function PopupPruebaVip({ perfilId, finISO }: { perfilId: string; finISO: string }) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const clave = `vela_popup_prueba_${perfilId}`;

  useEffect(() => {
    try {
      if (!localStorage.getItem(clave)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, [clave]);

  function cerrar() {
    try {
      localStorage.setItem(clave, '1');
    } catch {
      /* sin almacenamiento: se mostrará de nuevo la próxima vez */
    }
    setVisible(false);
  }

  function renovar() {
    cerrar();
    router.push('/planes');
  }

  if (!visible) return null;

  const finMs = new Date(finISO).getTime();
  const fechaFin = new Date(finISO).toLocaleString('es-SV', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 px-4 pb-4 sm:pb-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-prueba-vip"
    >
      <div className="w-full max-w-md bg-vela-surface border border-vela-line rounded-3xl p-6 shadow-2xl">
        <p className="inline-flex items-center gap-1.5 text-xs font-bold text-vela-verified bg-vela-verified-soft rounded-full px-3 py-1">
          ✓ Cuenta verificada
        </p>
        <h2 id="titulo-prueba-vip" className="text-2xl font-extrabold text-vela-text mt-3">
          Disfruta Vela VIP gratis
        </h2>
        <p className="text-sm text-vela-text-dim mt-2 leading-relaxed">
          Tu plan activo ahora es <span className="font-bold text-vela-text">VIP</span>, con todas las funciones,
          durante tu prueba de 3 días.
        </p>

        <div className="mt-4 rounded-2xl border border-vela-line bg-vela-surface-2 p-4">
          <p className="text-xs text-vela-text-faint">Tu prueba termina el</p>
          <p className="text-base font-bold text-vela-text capitalize">{fechaFin}</p>
          <p className="text-xs text-vela-text-faint mt-1">Te quedan {textoRestante(finMs)}.</p>
        </div>

        <p className="text-xs text-vela-text-faint mt-3 leading-relaxed">
          Al terminar pasas automáticamente al plan Básico. Si quieres conservar tus beneficios, puedes renovar
          ahora mismo con el plan que prefieras.
        </p>

        <div className="flex flex-col gap-2 mt-5">
          <button
            type="button"
            onClick={renovar}
            className="w-full h-14 rounded-full bg-vela-public text-white text-base font-bold active:scale-[0.98] transition"
          >
            Renovar ahora
          </button>
          <button
            type="button"
            onClick={cerrar}
            className="w-full h-12 rounded-full text-sm font-bold text-vela-text-faint"
          >
            Entendido, seguir con la prueba
          </button>
        </div>
      </div>
    </div>
  );
}