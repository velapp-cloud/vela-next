'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TarjetaPerfilAdmin, type PerfilAdmin } from '@/components/AdminPerfil';

const PAGINA = 48;

export default function PerfilesAprobados() {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [perfiles, setPerfiles] = useState<PerfilAdmin[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [limite, setLimite] = useState(PAGINA);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    const supabase = createClient();

    const { data, error: errPerfiles } = await supabase
      .from('perfiles')
      .select('id, alias, nombre_completo, correo, telefono, rol, es_admin, plan, cuenta_eliminada, creado_en')
      .or('estado_verificacion.eq.aprobado,es_admin.eq.true')
      .order('creado_en', { ascending: false });

    if (errPerfiles) {
      setError(`No se pudieron cargar los perfiles: ${errPerfiles.message}`);
      setCargando(false);
      return;
    }

    // Fecha en que se aprobó el registro: última revisión sin motivo de rechazo.
    const { data: verifs } = await supabase
      .from('verificaciones_identidad')
      .select('perfil_id, revisado_en')
      .not('revisado_en', 'is', null)
      .is('motivo_rechazo', null)
      .order('revisado_en', { ascending: false });

    const aprobadoPor: Record<string, string> = {};
    (verifs ?? []).forEach((v: any) => {
      if (!aprobadoPor[v.perfil_id]) aprobadoPor[v.perfil_id] = v.revisado_en;
    });

    const lista: PerfilAdmin[] = (data ?? [])
      .filter((p: any) => p.cuenta_eliminada !== true)
      .map((p: any) => ({
        id: p.id,
        alias: p.alias ?? '',
        nombre: p.nombre_completo ?? '',
        correo: p.correo ?? '',
        telefono: p.telefono ?? '',
        rol: p.rol ?? '',
        esAdmin: p.es_admin === true,
        plan: p.plan ?? 'basico',
        fecha: aprobadoPor[p.id] ?? null,
        fechaEtiqueta: 'Aprobado',
      }));

    setPerfiles(lista);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return perfiles;
    return perfiles.filter(
      (p) =>
        p.alias.toLowerCase().includes(q) ||
        p.nombre.toLowerCase().includes(q) ||
        p.correo.toLowerCase().includes(q),
    );
  }, [perfiles, busqueda]);

  return (
    <main className="flex-1 px-6 py-6 max-w-5xl mx-auto w-full">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[28px] leading-tight font-bold text-vela-text">Perfiles aprobados</h1>
          <p className="text-sm text-vela-text-faint mt-1">Cuentas verificadas y activas en Vela.</p>
        </div>
        <div className="bg-vela-surface border border-vela-line rounded-2xl px-6 py-4">
          <p className="text-[11px] font-bold tracking-wide text-vela-text-faint">CUENTAS ACTIVAS</p>
          <p className="text-3xl font-extrabold text-vela-public leading-tight">{perfiles.length}</p>
        </div>
      </div>

      <input
        value={busqueda}
        onChange={(e) => { setBusqueda(e.target.value); setLimite(PAGINA); }}
        placeholder="Buscar por alias, nombre o correo..."
        className="w-full mb-5 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none focus:border-vela-public/60"
      />

      {error !== '' && (
        <div className="mb-4 rounded-2xl border border-vela-safety/40 bg-vela-safety-soft p-4 text-sm text-vela-safety">{error}</div>
      )}

      {cargando ? (
        <p className="text-sm text-vela-text-faint text-center py-12">Cargando...</p>
      ) : filtrados.length === 0 ? (
        <p className="text-sm text-vela-text-faint text-center py-12">
          {busqueda ? 'Ningún perfil coincide con tu búsqueda.' : 'Aún no hay perfiles aprobados.'}
        </p>
      ) : (
        <>
          <p className="text-xs text-vela-text-faint mb-3">
            Mostrando {Math.min(limite, filtrados.length)} de {filtrados.length}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtrados.slice(0, limite).map((p) => (
              <TarjetaPerfilAdmin key={p.id} p={p} />
            ))}
          </div>
          {filtrados.length > limite && (
            <button
              onClick={() => setLimite((l) => l + PAGINA)}
              className="mt-6 w-full h-14 rounded-full bg-vela-surface-2 border border-vela-line text-base font-bold text-vela-text flex items-center justify-center"
            >
              Ver más
            </button>
          )}
        </>
      )}
    </main>
  );
}