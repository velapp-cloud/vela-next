'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TarjetaPerfilAdmin, type PerfilAdmin } from '@/components/AdminPerfil';

type Plan = 'basico' | 'premium' | 'gold' | 'vip';

const PLANES: { id: Plan; label: string }[] = [
  { id: 'basico', label: 'Básico' },
  { id: 'premium', label: 'Premium' },
  { id: 'gold', label: 'Gold' },
  { id: 'vip', label: 'VIP' },
];

type Conteos = {
  total: number;
  nuevos7: number;
  conocer: number;
  descubierta: number;
  pendientes: number;
  aprobados: number;
  rechazados: number;
  planes: Record<Plan, number>;
};

// Todos los conteos excluyen las cuentas admin.
const NO_ADMIN = 'es_admin.is.null,es_admin.eq.false';

async function contar(aplicar?: (q: any) => any): Promise<number> {
  const supabase = createClient();
  let q: any = supabase.from('perfiles').select('id', { count: 'exact', head: true }).or(NO_ADMIN);
  if (aplicar) q = aplicar(q);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export default function Reporte() {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [c, setC] = useState<Conteos | null>(null);

  const [planSel, setPlanSel] = useState<Plan | null>(null);
  const [listaPlan, setListaPlan] = useState<PerfilAdmin[]>([]);
  const [cargandoLista, setCargandoLista] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const hace7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [total, nuevos7, conocer, descubierta, pendientes, aprobados, rechazados, basico, premium, gold, vip] =
        await Promise.all([
          contar(),
          contar((q) => q.gte('creado_en', hace7)),
          contar((q) => q.eq('rol', 'cliente')),
          contar((q) => q.eq('rol', 'proveedor')),
          contar((q) => q.eq('estado_verificacion', 'pendiente')),
          contar((q) => q.eq('estado_verificacion', 'aprobado')),
          contar((q) => q.eq('estado_verificacion', 'rechazado')),
          ...PLANES.map((p) => contar((q) => q.eq('estado_verificacion', 'aprobado').eq('plan', p.id))),
        ]);

      setC({
        total, nuevos7, conocer, descubierta, pendientes, aprobados, rechazados,
        planes: { basico, premium, gold, vip },
      });
    } catch (e: any) {
      setError(`No se pudo cargar el reporte: ${e?.message ?? 'error desconocido'}`);
    }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function verPlan(plan: Plan) {
    if (planSel === plan) { setPlanSel(null); setListaPlan([]); return; }
    setPlanSel(plan);
    setCargandoLista(true);
    setListaPlan([]);
    const supabase = createClient();
    const { data, error: errLista } = await supabase
      .from('perfiles')
      .select('id, alias, nombre_completo, correo, telefono, rol, es_admin, plan, creado_en')
      .or(NO_ADMIN)
      .eq('estado_verificacion', 'aprobado')
      .eq('plan', plan)
      .order('creado_en', { ascending: false })
      .limit(200);

    if (errLista) {
      setError(`No se pudo cargar la lista del plan: ${errLista.message}`);
      setCargandoLista(false);
      return;
    }

    setListaPlan(
      (data ?? []).map((p: any) => ({
        id: p.id,
        alias: p.alias ?? '',
        nombre: p.nombre_completo ?? '',
        correo: p.correo ?? '',
        telefono: p.telefono ?? '',
        rol: p.rol ?? '',
        esAdmin: false,
        plan: p.plan ?? plan,
        fecha: p.creado_en,
        fechaEtiqueta: 'Registro',
        mostrarPlan: true,
      })),
    );
    setCargandoLista(false);
  }

  return (
    <main className="flex-1 px-5 py-6 max-w-5xl mx-auto w-full">
      <div className="flex items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-extrabold text-vela-text">Reporte</h1>
          <p className="text-xs text-vela-text-faint mt-0.5">Resumen de usuarios. No incluye cuentas admin.</p>
        </div>
        <button
          onClick={cargar}
          className="text-xs font-semibold bg-vela-surface-2 border border-vela-line rounded-full px-4 py-2 text-vela-text-dim"
        >
          Actualizar
        </button>
      </div>

      {error !== '' && (
        <div className="mb-4 rounded-xl border border-vela-safety/40 bg-vela-safety-soft p-3 text-xs text-vela-safety">{error}</div>
      )}

      {cargando || !c ? (
        <p className="text-sm text-vela-text-faint text-center py-12">Cargando...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="TOTAL DE PERFILES" valor={c.total} />
            <Stat label="NUEVOS (7 DÍAS)" valor={c.nuevos7} />
            <Stat label="QUIERO CONOCER" valor={c.conocer} color="#3B82F6" />
            <Stat label="QUIERO SER DESCUBIERTA" valor={c.descubierta} color="#D91F3A" />
            <Stat label="PENDIENTES DE REVISIÓN" valor={c.pendientes} color="#F59E0B" />
            <Stat label="APROBADOS" valor={c.aprobados} color="#22C55E" />
            <Stat label="RECHAZADOS" valor={c.rechazados} color="#D91F3A" />
          </div>

          <h2 className="text-sm font-extrabold text-vela-text mt-8 mb-1">Perfiles por plan</h2>
          <p className="text-[11px] text-vela-text-faint mb-3">Solo perfiles aprobados. Toca un plan para ver quiénes lo tienen.</p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {PLANES.map((p) => (
              <button
                key={p.id}
                onClick={() => verPlan(p.id)}
                className={`text-left rounded-xl border p-4 transition ${
                  planSel === p.id
                    ? 'border-vela-public bg-vela-public-soft'
                    : 'border-vela-line bg-vela-surface'
                }`}
              >
                <p className="text-[10px] font-bold tracking-wide text-vela-text-faint">{p.label.toUpperCase()}</p>
                <p className="text-2xl font-extrabold text-vela-text mt-1">{c.planes[p.id]}</p>
              </button>
            ))}
          </div>

          {planSel && (
            <div className="mt-5">
              <p className="text-xs font-bold text-vela-text-faint tracking-wide mb-3">
                PLAN {PLANES.find((p) => p.id === planSel)?.label.toUpperCase()}
              </p>
              {cargandoLista ? (
                <p className="text-sm text-vela-text-faint text-center py-8">Cargando...</p>
              ) : listaPlan.length === 0 ? (
                <p className="text-sm text-vela-text-faint text-center py-8">Nadie tiene este plan todavía.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {listaPlan.map((p) => (
                    <TarjetaPerfilAdmin key={p.id} p={p} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}

function Stat({ label, valor, color }: { label: string; valor: number; color?: string }) {
  return (
    <div
      className="bg-vela-surface border border-vela-line border-l-2 rounded-xl p-4"
      style={color ? { borderLeftColor: color } : undefined}
    >
      <p className="text-[10px] font-bold tracking-wide text-vela-text-faint">{label}</p>
      <p className="text-3xl font-extrabold leading-tight mt-1" style={color ? { color } : undefined}>
        {valor}
      </p>
    </div>
  );
}