'use client';

import { useState } from 'react';

type Props = {
  aliasOtra: string;
  procesando: boolean;
  error: string;
  onSeguir: (motivo: string) => void;
  onCancelarCita: (motivo: string) => void;
  onVolver: () => void;
};

type Camino = 'seguir' | 'cancelar';

const MOTIVOS: Record<Camino, string[]> = {
  seguir: ['Fue un descuido', 'Ya se resolvió el problema', 'Hablamos y todo está bien', 'Otro'],
  cancelar: ['Me sentí insegura o inseguro', 'Me faltaron el respeto', 'La cita no fue como lo planeado', 'Otro'],
};

/**
 * Ventana para desactivar una alerta de emergencia: primero se elige si la cita sigue o se cancela,
 * y en los dos casos se da el motivo.
 */
export default function ModalDesactivarEmergencia({ aliasOtra, procesando, error, onSeguir, onCancelarCita, onVolver }: Props) {
  const [camino, setCamino] = useState<Camino | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [otro, setOtro] = useState('');

  const esOtro = motivo === 'Otro';
  const motivoFinal = esOtro ? otro.trim() : motivo ?? '';
  const listo = !!motivo && (!esOtro || motivoFinal.length >= 5);

  function elegirCamino(c: Camino) {
    setCamino(c);
    setMotivo(null);
    setOtro('');
  }

  function confirmar() {
    if (!listo || !camino) return;
    if (camino === 'seguir') onSeguir(motivoFinal);
    else onCancelarCita(motivoFinal);
  }

  return (
    <div
      className="fixed inset-0 z-[1001] overflow-y-auto bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-label="Desactivar alerta de emergencia"
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-vela-line bg-vela-surface p-5 text-left">
          <h3 className="text-xl font-extrabold text-vela-text">Desactivar alerta</h3>

          {!camino ? (
            <>
              <p className="mt-1 text-sm text-vela-text-dim">
                ¿Qué quieres hacer con la cita con {aliasOtra}?
              </p>
              <div className="mt-4 flex flex-col gap-3">
                <button
                  onClick={() => elegirCamino('seguir')}
                  className="min-h-14 rounded-2xl bg-vela-public px-4 py-3 text-base font-bold text-white"
                >
                  Estoy bien, seguir con la cita
                </button>
                <button
                  onClick={() => elegirCamino('cancelar')}
                  className="min-h-14 rounded-2xl border border-red-500 px-4 py-3 text-base font-bold text-red-500"
                >
                  Cancelar la cita
                </button>
                <button onClick={onVolver} className="min-h-11 text-center text-sm font-semibold text-vela-text-faint">
                  Volver
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-vela-text-dim">
                {camino === 'seguir'
                  ? 'Cuéntanos por qué desactivas la alerta. La cita continúa y el cronómetro sigue donde se detuvo.'
                  : 'Cuéntanos por qué cancelas la cita. Se cerrará la conversación y se avisará a la otra persona.'}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {MOTIVOS[camino].map((m) => (
                  <button
                    key={m}
                    onClick={() => setMotivo(m)}
                    className={`rounded-full border px-4 py-2.5 text-sm font-medium ${
                      motivo === m
                        ? 'border-vela-public bg-vela-public-soft text-vela-public'
                        : 'border-vela-line bg-vela-surface-2 text-vela-text-faint'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {esOtro && (
                <textarea
                  value={otro}
                  onChange={(e) => setOtro(e.target.value)}
                  maxLength={300}
                  rows={3}
                  placeholder="Escribe el motivo..."
                  className="mt-3 w-full resize-none rounded-2xl border border-vela-line bg-vela-bg p-4 text-base text-vela-text outline-none"
                />
              )}

              {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => { setCamino(null); setMotivo(null); setOtro(''); }}
                  disabled={procesando}
                  className="h-14 flex-1 rounded-full border border-vela-line text-base font-bold text-vela-text-dim disabled:opacity-50"
                >
                  Atrás
                </button>
                <button
                  onClick={confirmar}
                  disabled={!listo || procesando}
                  className={`h-14 flex-1 rounded-full text-base font-bold text-white disabled:opacity-50 ${
                    camino === 'cancelar' ? 'bg-red-600' : 'bg-vela-public'
                  }`}
                >
                  {procesando ? '...' : camino === 'cancelar' ? 'Cancelar cita' : 'Desactivar y seguir'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}