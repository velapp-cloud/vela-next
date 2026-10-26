'use client';

/**
 * app/admin/revision/page.tsx
 * Cola de verificación de identidad. Solo accesible para es_admin
 * (lo protege app/admin/layout.tsx).
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { calcularEdad } from '@/lib/utils/edad';

type Solicitud = {
  perfilId: string;
  alias: string;
  nombre: string;
  correo: string;
  telefono: string;
  rol: string;
  ciudad: string;
  edad: number | null;
  creado: string;
  selfieUrl: string | null;
  documentoUrl: string | null;
  sinDocumentos: boolean;
};

const MOTIVOS_RAPIDOS = [
  'La foto del documento no se ve legible.',
  'La selfie no muestra tu documento junto a tu rostro.',
  'El nombre del documento no coincide con el que registraste.',
  'El documento está vencido o incompleto.',
  'No se ve tu rostro con claridad en la selfie.',
];

export default function RevisionAdmin() {
  const router = useRouter();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    const supabase = createClient();

    const { data: perfiles, error: errPerfiles } = await supabase
      .from('perfiles')
      .select('id, alias, nombre_completo, correo, telefono, rol, ciudad, fecha_nacimiento, creado_en')
      .eq('estado_verificacion', 'pendiente')
      .eq('registro_completo', true)
      .order('creado_en', { ascending: true });

    if (errPerfiles) {
      setError(`No se pudieron cargar las solicitudes: ${errPerfiles.message}`);
      setCargando(false);
      return;
    }

    const lista = perfiles ?? [];
    if (lista.length === 0) {
      setSolicitudes([]);
      setCargando(false);
      return;
    }

    const ids = lista.map((p: any) => p.id);
    const { data: verifs, error: errVerifs } = await supabase
      .from('verificaciones_identidad')
      .select('perfil_id, selfie_url, documento_url, creado_en')
      .in('perfil_id', ids)
      .order('creado_en', { ascending: false });

    if (errVerifs) {
      setError(`No se pudieron cargar los documentos: ${errVerifs.message}`);
    }

    const ultimaPorPerfil: Record<string, any> = {};
    (verifs ?? []).forEach((v: any) => {
      if (!ultimaPorPerfil[v.perfil_id]) ultimaPorPerfil[v.perfil_id] = v;
    });

    async function firmar(path: string | null): Promise<string | null> {
      if (!path) return null;
      const { data } = await supabase.storage.from('documentos-verificacion').createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    }

    const resultado: Solicitud[] = await Promise.all(
      lista.map(async (p: any) => {
        const v = ultimaPorPerfil[p.id];
        return {
          perfilId: p.id,
          alias: p.alias ?? '',
          nombre: p.nombre_completo ?? '',
          correo: p.correo ?? '',
          telefono: p.telefono ?? '',
          rol: p.rol ?? '',
          ciudad: p.ciudad ?? '',
          edad: calcularEdad(p.fecha_nacimiento),
          creado: p.creado_en,
          selfieUrl: await firmar(v?.selfie_url ?? null),
          documentoUrl: await firmar(v?.documento_url ?? null),
          sinDocumentos: !v,
        };
      }),
    );

    setSolicitudes(resultado);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function cerrarSesion() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
  }

  function alResolver(perfilId: string, mensaje: string) {
    setSolicitudes((prev) => prev.filter((s) => s.perfilId !== perfilId));
    setAviso(mensaje);
  }

  return (
    <main className="flex-1 px-5 py-8 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="font-serif italic text-2xl text-vela-public">Vela · Revisión</h1>
          <p className="text-xs text-vela-text-faint mt-0.5">Verificación de identidad pendiente</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={cargar}
            className="text-xs font-semibold bg-vela-surface-2 border border-vela-line rounded-full px-4 py-2 text-vela-text-dim"
          >
            Actualizar
          </button>
          <button
            onClick={cerrarSesion}
            className="text-xs font-semibold bg-vela-surface-2 border border-vela-line rounded-full px-4 py-2 text-vela-text-dim"
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      {aviso !== '' && (
        <div className="mb-4 rounded-xl border border-vela-verified/40 bg-vela-verified-soft p-3 text-xs text-vela-text-dim flex justify-between gap-3">
          <span>{aviso}</span>
          <button onClick={() => setAviso('')} className="text-vela-text-faint">✕</button>
        </div>
      )}

      {error !== '' && (
        <div className="mb-4 rounded-xl border border-vela-safety/40 bg-vela-safety-soft p-3 text-xs text-vela-safety">
          {error}
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-vela-text-faint text-center py-12">Cargando...</p>
      ) : solicitudes.length === 0 ? (
        <p className="text-sm text-vela-text-faint text-center py-12">No hay solicitudes pendientes.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-xs font-bold text-vela-text-faint tracking-wide">
            {solicitudes.length} PENDIENTE{solicitudes.length === 1 ? '' : 'S'}
          </p>
          {solicitudes.map((s) => (
            <TarjetaSolicitud key={s.perfilId} s={s} onResuelto={alResolver} />
          ))}
        </div>
      )}
    </main>
  );
}

function TarjetaSolicitud({ s, onResuelto }: { s: Solicitud; onResuelto: (id: string, msg: string) => void }) {
  const [rechazando, setRechazando] = useState(false);
  const [comentario, setComentario] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [errorLocal, setErrorLocal] = useState('');

  const comentarioValido = comentario.trim().length >= 10;

  function agregarMotivo(m: string) {
    setComentario((prev) => (prev.trim() === '' ? m : prev.includes(m) ? prev : `${prev.trim()} ${m}`));
  }

  async function enviar(decision: 'aprobar' | 'rechazar') {
    if (procesando) return;
    if (decision === 'rechazar' && !comentarioValido) return;
    setProcesando(true);
    setErrorLocal('');
    try {
      const res = await fetch('/api/admin/verificacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perfilId: s.perfilId, decision, comentario }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorLocal(json.error ?? 'No se pudo completar la acción.');
        setProcesando(false);
        return;
      }
      if (decision === 'aprobar') {
        onResuelto(s.perfilId, `${s.alias || s.nombre} fue aprobada.`);
      } else if (json.emailEnviado) {
        onResuelto(s.perfilId, `${s.alias || s.nombre} fue rechazada y se envió el correo con tu comentario.`);
      } else {
        onResuelto(
          s.perfilId,
          `${s.alias || s.nombre} fue rechazada, pero el correo NO salió: ${json.emailError ?? 'error desconocido'}.`,
        );
      }
    } catch {
      setErrorLocal('No se pudo conectar con el servidor.');
      setProcesando(false);
    }
  }

  return (
    <div className="bg-vela-surface border border-vela-line border-l-2 border-l-vela-public rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-base font-extrabold text-vela-text italic">
            {s.nombre || s.alias}
            {s.edad !== null && <span className="not-italic font-bold text-vela-text-dim">, {s.edad}</span>}
          </p>
          <p className="text-xs text-vela-text-faint">
            {s.rol === 'proveedor' ? 'Quiere ser descubierta' : 'Quiere conocer'} · {s.ciudad || 'Sin ciudad'}
          </p>
        </div>
        <p className="text-[11px] text-vela-text-faint">
          Registro: {new Date(s.creado).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 text-xs mb-4">
        <p className="py-1 text-vela-text-dim"><span className="text-vela-text-faint">Alias: </span>{s.alias || '—'}</p>
        <p className="py-1 text-vela-text-dim"><span className="text-vela-text-faint">Correo: </span>{s.correo || '—'}</p>
        <p className="py-1 text-vela-text-dim"><span className="text-vela-text-faint">Teléfono: </span>{s.telefono || '—'}</p>
      </div>

      {s.sinDocumentos ? (
        <div className="rounded-xl border border-vela-amber/40 bg-vela-surface-2 p-3 text-xs text-vela-text-dim mb-4">
          Esta persona no tiene documentos guardados (se registró antes de que existiera la tabla de verificación).
          Puedes rechazarla con un comentario para que vuelva a enviarlos.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <Imagen titulo="Selfie con documento" url={s.selfieUrl} />
          <Imagen titulo="Documento de identidad" url={s.documentoUrl} />
        </div>
      )}

      {errorLocal !== '' && <p className="text-xs text-vela-safety mb-3">{errorLocal}</p>}

      {!rechazando ? (
        <div className="flex gap-3">
          <button
            onClick={() => enviar('aprobar')}
            disabled={procesando || s.sinDocumentos}
            className="flex-1 py-3 rounded-full bg-vela-verified text-white text-sm font-bold disabled:opacity-50"
          >
            {procesando ? 'Procesando...' : 'Aprobar'}
          </button>
          <button
            onClick={() => setRechazando(true)}
            disabled={procesando}
            className="flex-1 py-3 rounded-full bg-vela-safety text-white text-sm font-bold disabled:opacity-50"
          >
            Rechazar
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-vela-line bg-vela-surface-2 p-3.5">
          <p className="text-xs font-bold text-vela-text mb-1">Comentario para la persona</p>
          <p className="text-[11px] text-vela-text-faint mb-2">
            Se enviará por correo a {s.correo || 'la persona'}. Explica qué debe corregir.
          </p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {MOTIVOS_RAPIDOS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => agregarMotivo(m)}
                className="text-[10px] bg-vela-surface border border-vela-line text-vela-text-dim rounded-full px-2.5 py-1"
              >
                + {m}
              </button>
            ))}
          </div>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value.slice(0, 500))}
            rows={4}
            placeholder="Ej. La foto del documento sale borrosa, súbela de nuevo con buena luz."
            className="w-full bg-vela-surface border border-vela-line rounded-xl px-3 py-2.5 text-sm text-vela-text outline-none focus:border-vela-public/60 resize-none"
          />
          <div className="flex items-center justify-between mt-1 mb-3">
            <span className="text-[10px] text-vela-text-faint">
              {comentarioValido ? ' ' : 'Mínimo 10 caracteres'}
            </span>
            <span className="text-[10px] text-vela-text-faint">{comentario.length}/500</span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setRechazando(false); setComentario(''); setErrorLocal(''); }}
              disabled={procesando}
              className="flex-1 py-3 rounded-full bg-vela-surface border border-vela-line text-vela-text-faint text-sm font-semibold"
            >
              Cancelar
            </button>
            <button
              onClick={() => enviar('rechazar')}
              disabled={procesando || !comentarioValido}
              className="flex-1 py-3 rounded-full bg-vela-safety text-white text-sm font-bold disabled:opacity-50"
            >
              {procesando ? 'Enviando...' : 'Rechazar y enviar correo'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Imagen({ titulo, url }: { titulo: string; url: string | null }) {
  return (
    <div>
      <p className="text-[10px] text-vela-text-faint mb-1">{titulo}</p>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={titulo} className="w-full max-h-72 object-contain rounded-lg border border-vela-line bg-black/20" />
        </a>
      ) : (
        <div className="w-full h-40 rounded-lg border border-dashed border-vela-line flex items-center justify-center text-xs text-vela-text-faint">
          No disponible
        </div>
      )}
    </div>
  );
}