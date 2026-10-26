'use client';

/**
 * reenviar-verificacion/page.tsx
 * Para personas cuya verificación fue rechazada: suben una selfie y un documento nuevos.
 * Se ve una miniatura de lo que se sube y se puede usar la cámara del celular.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { prepararImagen, FORMATOS_TEXTO } from '@/lib/utils/imagenes';
import BotonesFoto from '@/components/BotonesFoto';

type Tipo = 'selfie' | 'documento';

function IconoFlecha() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export default function ReenviarVerificacion() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [selfiePath, setSelfiePath] = useState<string | null>(null);
  const [documentoPath, setDocumentoPath] = useState<string | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [documentoPreview, setDocumentoPreview] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<Tipo | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        router.replace('/login');
        return;
      }
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('estado_verificacion')
        .eq('id', u.user.id)
        .single();

      if (perfil?.estado_verificacion === 'pendiente') {
        router.replace('/pendiente');
        return;
      }
      if (perfil?.estado_verificacion === 'aprobado') {
        router.replace('/explorar');
        return;
      }
      setUserId(u.user.id);
      setCargando(false);
    })();
  }, [router]);

  async function handleSubir(tipo: Tipo, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !userId) return;
    setSubiendo(tipo);
    setError('');

    const r = await prepararImagen(file, 'documento');
    if (!r.ok) {
      setError(r.error);
      setSubiendo(null);
      return;
    }

    const supabase = createClient();
    const path = `${userId}/${Date.now()}-${r.archivo.name}`;
    const { error: upErr } = await supabase.storage.from('documentos-verificacion').upload(path, r.archivo);
    setSubiendo(null);

    if (upErr) {
      console.error('Error subiendo a documentos-verificacion:', upErr);
      URL.revokeObjectURL(r.vistaPrevia);
      setError('No se pudo subir el archivo. Intenta de nuevo.');
      return;
    }

    if (tipo === 'selfie') {
      setSelfiePath(path);
      setSelfiePreview((prev) => { if (prev) URL.revokeObjectURL(prev); return r.vistaPrevia; });
    } else {
      setDocumentoPath(path);
      setDocumentoPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return r.vistaPrevia; });
    }
  }

  async function enviar() {
    if (!userId || !selfiePath || !documentoPath || enviando) return;
    setEnviando(true);
    setError('');
    const supabase = createClient();

    try {
      const { error: insErr } = await supabase.from('verificaciones_identidad').insert({
        perfil_id: userId,
        selfie_url: selfiePath,
        documento_url: documentoPath,
      });
      if (insErr) {
        console.error('Error guardando verificación:', insErr);
        setError('No se pudieron guardar tus documentos. Intenta de nuevo.');
        setEnviando(false);
        return;
      }

      const { data: actualizado, error: updErr } = await supabase
        .from('perfiles')
        .update({ estado_verificacion: 'pendiente', verificacion_notificada: true })
        .eq('id', userId)
        .select('id');

      if (updErr || !actualizado || actualizado.length === 0) {
        console.error('Error actualizando estado:', updErr);
        setError('Tus documentos se guardaron, pero no se pudo actualizar tu estado. Intenta de nuevo.');
        setEnviando(false);
        return;
      }

      router.replace('/pendiente');
    } catch (err) {
      console.error('Excepción reenviando documentos:', err);
      setError('No se pudo enviar. Intenta de nuevo.');
      setEnviando(false);
    }
  }

  async function cerrarSesion() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (cargando) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-base text-vela-text-faint">Cargando...</p>
      </main>
    );
  }

  const listo = !!selfiePath && !!documentoPath;

  return (
    <main className="flex-1 flex flex-col px-6 py-8 max-w-md mx-auto w-full gap-4">
      <h1 className="font-serif italic text-4xl text-vela-public">Vela</h1>
      <div>
        <h2 className="text-[28px] leading-tight font-bold text-vela-text">Volver a enviar mis documentos</h2>
        <p className="text-base text-vela-text-faint mt-2">
          Sube fotos nuevas siguiendo las indicaciones del equipo de Vela. Formatos permitidos: {FORMATOS_TEXTO}.
          Con buena luz y que se lea todo.
        </p>
      </div>

      <TarjetaSubida
        titulo="Selfie sosteniendo tu documento"
        preview={selfiePreview}
        listo={!!selfiePath}
        subiendo={subiendo === 'selfie'}
        facing="user"
        onChange={(e) => handleSubir('selfie', e)}
      />
      <TarjetaSubida
        titulo="Foto de tu documento de identidad"
        preview={documentoPreview}
        listo={!!documentoPath}
        subiendo={subiendo === 'documento'}
        facing="environment"
        onChange={(e) => handleSubir('documento', e)}
      />

      {error !== '' && <p className="text-sm text-vela-safety">{error}</p>}

      <button
        onClick={enviar}
        disabled={!listo || enviando || subiendo !== null}
        className={`w-full h-14 flex items-center justify-center gap-2 rounded-full font-bold text-base transition ${
          listo ? 'bg-vela-public text-white' : 'bg-vela-surface-2 text-vela-text-faint'
        }`}
      >
        {enviando ? 'Enviando...' : 'Enviar para revisión'}
        {!enviando && <IconoFlecha />}
      </button>

      <button onClick={cerrarSesion} className="min-h-11 text-sm text-vela-text-faint font-semibold underline self-center">
        Cerrar sesión
      </button>
    </main>
  );
}

function TarjetaSubida({ titulo, preview, listo, subiendo, facing, onChange }: {
  titulo: string; preview: string | null; listo: boolean; subiendo: boolean;
  facing: 'user' | 'environment';
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="border border-dashed border-vela-line-strong rounded-2xl p-5 flex flex-col gap-3 bg-vela-surface">
      <div className="flex items-center justify-between gap-3">
        <span className="text-base text-vela-text-dim">
          {titulo}
          <span className="text-[#D91F3A] font-bold ml-0.5" aria-hidden="true">*</span>
        </span>
        <span className="text-sm font-semibold shrink-0 text-vela-text-faint">
          {subiendo ? 'Procesando...' : listo ? '✓ Listo' : 'Pendiente'}
        </span>
      </div>

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={titulo} className="w-full max-h-64 object-contain rounded-xl border border-vela-line bg-black/20" />
      )}

      <BotonesFoto onChange={onChange} disabled={subiendo} facing={facing} />
    </div>
  );
}