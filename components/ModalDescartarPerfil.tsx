'use client';

import { useState } from 'react';
import { MOTIVOS_DESCARTE, MOTIVO_OTRO } from '@/lib/perfiles/motivosDescarte';

export default function ModalDescartarPerfil({ alias, enviando, error, onCancelar, onConfirmar }: {
  alias: string;
  enviando: boolean;
  error: string;
  onCancelar: () => void;
  onConfirmar: (motivo: string, nota: string) => void;
}) {
  const [motivo, setMotivo] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [errorLocal, setErrorLocal] = useState('');

  function confirmar() {
    if (!motivo || enviando) return;
    if (motivo === MOTIVO_OTRO && !nota.trim()) {
      setErrorLocal('Escribe el motivo.');
      return;
    }
    setErrorLocal('');
    onConfirmar(motivo, nota);
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50">
      <div className="bg-vela-bg border border-vela-line rounded-t-[28px] sm:rounded-[28px] max-w-md w-full max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-bold text-vela-text">
            ¿Seguro que quieres eliminar a {alias}?
          </h2>
          <p className="mt-2 text-sm text-vela-text-faint">
            No volverás a ver este perfil en tu búsqueda. Esta acción no se puede deshacer.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold text-vela-text-faint mb-2">¿Por qué la eliminas?</p>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_DESCARTE.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMotivo(m); setErrorLocal(''); }}
                className={`px-4 py-2.5 rounded-full text-sm font-medium border ${
                  motivo === m ? 'bg-vela-public-soft border-vela-public text-vela-public' : 'bg-vela-surface-2 border-vela-line text-vela-text-faint'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {motivo === MOTIVO_OTRO && (
          <div>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={3}
              placeholder="Cuéntanos qué pasó"
              className="w-full bg-vela-surface-2 border border-vela-line rounded-2xl px-4 py-3 text-base text-vela-text outline-none resize-none"
            />
            <p className="mt-1.5 text-[11px] text-vela-text-faint">
              Esta nota es solo para el respaldo interno de Vela. La otra persona no la verá.
            </p>
          </div>
        )}

        {(errorLocal || error) && <p className="text-sm text-vela-safety">{errorLocal || error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancelar}
            disabled={enviando}
            className="flex-1 h-14 rounded-full bg-vela-surface-2 border border-vela-line text-vela-text font-bold text-base disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={!motivo || enviando}
            className="flex-1 h-14 rounded-full bg-vela-safety text-white font-bold text-base disabled:opacity-50"
          >
            {enviando ? 'Eliminando...' : 'Sí, eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}