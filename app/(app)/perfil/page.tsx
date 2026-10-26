'use client';

/**
 * app/(app)/perfil/page.tsx
 *
 * SIMPLIFICACION A PROPOSITO: el campo "ciudad" se edita aqui como
 * texto libre, no con el selector Pais -> Departamento -> Ciudad que
 * construimos en el registro — reutilizar ese selector completo
 * aqui se puede hacer despues sin problema, se dejo simple para no
 * detener el avance de la Fase 2.
 */
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { CAPACIDADES } from '@/lib/planes/capacidades';
import { PASATIEMPOS } from '@/lib/hobbies/pasatiempos';
import { CATEGORIAS_CHIPS } from '@/lib/chips/chipsPreferencia';
import { ZONAS_SV, DEPARTAMENTOS, resumenVisibilidad, type AlcanceVisibilidad } from '@/lib/zonas/elSalvador';
import { calcularEdad } from '@/lib/utils/edad';
import { tienePlanActivo } from '@/lib/planes/planActivo';
import PlanBadge, { ESTILO_PLAN } from '@/components/PlanBadge';
import { EstadoConexion } from '@/components/PresenciaProvider';
import EditorFotos from '@/components/EditorFotos';

type Tab = 'publico' | 'privado' | 'historial';

type PerfilCompleto = {
  id: string;
  alias: string;
  nombre_completo: string | null;
  correo: string | null;
  telefono: string | null;
  rol: 'cliente' | 'proveedor';
  plan: 'basico' | 'premium' | 'gold' | 'vip';
  plan_vence_en?: string | null;
  avatar_color: string;
  ciudad: string | null;
  estatura: string | null;
  ocupacion: string | null;
  idiomas: string | null;
  disponible: string | null;
  nota_publica: string | null;
  fecha_nacimiento: string | null;
  fotos: string[] | null;
  calificacion_prom: number | null;
  total_resenas: number | null;
  perfil_activo: boolean;
  estado_verificacion: string;
  regalo: string | null;
  creado_en: string;
  visibilidad_alcance: AlcanceVisibilidad | null;
  visibilidad_departamentos: string[] | null;
  visibilidad_municipios: string[] | null;
  zona_cambios_mes?: number | null;
  zona_cambios_mes_ref?: string | null;
};

type HistorialItem = {
  id: string;
  veces: number;
  fecha: string;
  cancelada: boolean;
  motivoCancelacion: string;
  yoCancele: boolean;
  calRating: number;
  chips: string[];
};

type ResenaRecibida = {
  id: string;
  cita_id: string;
  estrellas: number;
  chips: string[];
  creado_en: string;
};

const DISPONIBILIDAD_OPCIONES = ['Mañanas', 'Tardes', 'Noches', 'Fines de semana', 'Siempre disponible'];
const FOTO_MIN = 2;
const NOTA_MAX = 200;
// Cambios de zona de visibilidad por mes: Gold hasta 20, VIP sin límite. Básico y Premium no pueden cambiarla.
const ZONA_LIMITE_GOLD = 20;

function mesActualSV(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' }).slice(0, 7);
}

export default function Perfil() {
  const router = useRouter();
  const { perfil: perfilSesion, cerrarSesion } = useSession();

  const [tab, setTab] = useState<Tab>('publico');
  const [cargando, setCargando] = useState(true);
  const [perfil, setPerfil] = useState<PerfilCompleto | null>(null);
  const [hobbies, setHobbies] = useState<string[]>([]);
  const [chipsPreferencia, setChipsPreferencia] = useState<string[]>([]);
  const [meEncantaRecibidos, setMeEncantaRecibidos] = useState(0);
  const [historial, setHistorial] = useState<HistorialItem[]>([]);
  const [historialLimite, setHistorialLimite] = useState(5);
  const [calificaciones, setCalificaciones] = useState<ResenaRecibida[]>([]);

  const [showEdit, setShowEdit] = useState(false);
  const [showZona, setShowZona] = useState(false);
  const [showEliminarModal, setShowEliminarModal] = useState(false);
  const [showCerrarSesionModal, setShowCerrarSesionModal] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) { setCargando(false); return; }

    const { data: p } = await supabase.from('perfiles').select('*').eq('id', userId).single();
    setPerfil(p);

    const { data: hobbiesData } = await supabase.from('perfil_hobbies').select('hobby_id').eq('perfil_id', userId);
    setHobbies((hobbiesData ?? []).map((h: any) => h.hobby_id));

    const { data: chipsData } = await supabase.from('perfil_chips_preferencia').select('chip').eq('perfil_id', userId);
    setChipsPreferencia((chipsData ?? []).map((c: any) => c.chip));

    const { count } = await supabase.from('favoritos').select('*', { count: 'exact', head: true }).eq('perfil_guardado', userId);
    setMeEncantaRecibidos(count ?? 0);

    const { data: citasData } = await supabase
      .from('citas')
      .select('*')
      .or(`cliente_id.eq.${userId},proveedora_id.eq.${userId}`)
      .in('estado_manual', ['finalizada', 'cancelada'])
      .order('hora_acordada', { ascending: false });

    const { data: resenasData } = await supabase.from('resenas_publicas').select('*').eq('calificado_id', userId);
    const resenasMap = Object.fromEntries((resenasData ?? []).map((r: any) => [r.cita_id, r]));

    setCalificaciones(
      (resenasData ?? [])
        .slice()
        .sort((a: any, b: any) => new Date(b.creado_en).getTime() - new Date(a.creado_en).getTime())
        .map((r: any) => ({
          id: r.id,
          cita_id: r.cita_id,
          estrellas: r.estrellas,
          chips: r.chips ?? [],
          creado_en: r.creado_en,
        })),
    );

    let contadorGlobal = 0;
    const numeroPorCitaId: Record<string, number> = {};
    [...(citasData ?? [])].reverse().forEach((c: any) => {
      contadorGlobal++;
      numeroPorCitaId[c.id] = contadorGlobal;
    });

    setHistorial((citasData ?? []).map((c: any) => {
      const resena = resenasMap[c.id];
      return {
        id: c.id,
        veces: numeroPorCitaId[c.id] ?? 1,
        fecha: new Date(c.hora_acordada).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' }),
        cancelada: c.estado_manual === 'cancelada',
        motivoCancelacion: c.motivo_cancelacion ?? '',
        yoCancele: c.cancelado_por === userId,
        calRating: resena?.estrellas ?? 0,
        chips: resena?.chips ?? [],
      };
    }));

    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function confirmarCerrarSesion() {
    await cerrarSesion();
    router.replace('/welcome');
  }

  async function confirmarEliminarCuenta() {
    if (!perfil) return;
    const supabase = createClient();
    await supabase
      .from('perfiles')
      .update({ cuenta_eliminada: true, cuenta_eliminada_en: new Date().toISOString(), perfil_activo: false })
      .eq('id', perfil.id);
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (cargando || !perfil) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-vela-text-faint">Cargando...</p>
      </main>
    );
  }

  const cap = CAPACIDADES[perfil.plan];
  const estiloPlan = ESTILO_PLAN[perfil.plan];
  const planActivo = tienePlanActivo(perfil.plan, perfil.plan_vence_en);
  const planPermiteZona = planActivo && (perfil.plan === 'gold' || perfil.plan === 'vip');
  const zonaUsados = perfil.zona_cambios_mes_ref === mesActualSV() ? (perfil.zona_cambios_mes ?? 0) : 0;
  const zonaAgotada = perfil.plan === 'gold' && zonaUsados >= ZONA_LIMITE_GOLD;
  const hobbyLabels = hobbies.map((id) => PASATIEMPOS.find((p) => p.id === id)?.label).filter((l): l is string => !!l);
  const fotos = perfil.fotos ?? [];
  const edad = calcularEdad(perfil.fecha_nacimiento);

  const frecuenciaChips: Record<string, number> = {};
  calificaciones.forEach((r) => {
    r.chips.forEach((chip) => {
      frecuenciaChips[chip] = (frecuenciaChips[chip] ?? 0) + 1;
    });
  });
  const chipsOrdenados = Object.entries(frecuenciaChips).sort((a, b) => b[1] - a[1]);

  return (
    <main className="flex-1 px-6 py-8 max-w-md mx-auto w-full">
      <div className="flex gap-4 items-start mb-5">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden border-2"
          style={{ backgroundColor: perfil.avatar_color, borderColor: '#000' }}
        >
          {fotos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fotos[0]} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-white font-extrabold text-2xl italic">{perfil.alias.charAt(0)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-extrabold text-vela-text italic">
              {perfil.alias}
              {edad !== null && <span className="not-italic font-bold text-vela-text-dim">, {edad}</span>}
            </h1>
            <PlanBadge plan={perfil.plan} />
          </div>
          <EstadoConexion userId={perfil.id} className="mt-0.5" />
          <div className="flex items-center gap-1 mt-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={i <= Math.round(perfil.calificacion_prom ?? 0) ? 'text-vela-amber' : 'text-vela-text-faint'}>★</span>
            ))}
            <span className="text-sm text-vela-amber font-bold ml-1">{(perfil.calificacion_prom ?? 0).toFixed(1)}</span>
          </div>
          <p className="text-sm text-vela-text-faint mt-1">
            {edad !== null ? `${edad} años · ` : ''}{perfil.ciudad || 'Sin ciudad'} · {perfil.estatura || '—'}
          </p>
        </div>
      </div>

      {hobbyLabels.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {hobbyLabels.map((h) => (
            <span key={h} className="text-sm bg-vela-surface-2 border border-vela-line rounded-full px-4 py-2 text-vela-text-dim">{h}</span>
          ))}
        </div>
      )}

      <div className="flex border-b border-vela-line mb-4">
        {(['publico', 'privado', 'historial'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 h-12 text-base font-semibold border-b-2 transition ${
              tab === t ? 'border-vela-public text-vela-public' : 'border-transparent text-vela-text-faint'
            }`}
          >
            {t === 'publico' ? 'Público' : t === 'privado' ? 'Privado' : 'Historial'}
          </button>
        ))}
      </div>

      {/* Botón de plan: muestra tu plan actual y lleva a Planes */}
      <Link
        href="/planes"
        className={`mb-5 flex items-center justify-between gap-3 rounded-2xl border px-5 py-4 ${estiloPlan.tarjeta}`}
      >
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-wide text-vela-text-faint">MI PLAN</p>
          <div className="mt-0.5 flex items-center gap-2">
            <PlanBadge plan={perfil.plan} />
            <span className="text-base font-extrabold text-vela-text">{cap.label}</span>
          </div>
          <p className={`mt-1 text-xs ${planActivo ? 'text-vela-text-faint' : 'text-vela-safety font-semibold'}`}>
            {!planActivo
              ? 'Plan vencido · renuévalo para seguir disfrutándolo'
              : perfil.plan_vence_en
                ? `Activo hasta el ${new Date(perfil.plan_vence_en).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : 'Plan activo'}
          </p>
        </div>
        <span className="shrink-0 text-sm font-bold text-vela-public">Ver planes →</span>
      </Link>

      {tab === 'publico' && (
        <div className="flex flex-col gap-4">
          <SectionCard titulo="ESTADÍSTICAS">
            <FilaDato label="Calificación promedio" valor={`★ ${(perfil.calificacion_prom ?? 0).toFixed(1)}`} />
            <FilaDato label="Reseñas recibidas" valor={String(perfil.total_resenas ?? 0)} />
            <FilaDato label="Me encanta recibidos" valor={`❤️ ${meEncantaRecibidos}`} />
          </SectionCard>

          <SectionCard titulo="CALIFICACIONES RECIBIDAS">
            {calificaciones.length === 0 ? (
              <p className="text-sm text-vela-text-faint py-2">Aún no tienes calificaciones.</p>
            ) : (
              <>
                {chipsOrdenados.length > 0 && (
                  <div className="pb-3 mb-3 border-b border-vela-line">
                    <p className="text-xs text-vela-text-faint mb-2">Lo que más dicen de ti</p>
                    <div className="flex flex-wrap gap-2">
                      {chipsOrdenados.map(([chip, veces]) => (
                        <span key={chip} className="text-xs bg-vela-surface-2 border border-vela-line text-vela-text-dim rounded-full px-3 py-1.5">
                          {chip} <span className="text-vela-text-faint">×{veces}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-3 max-h-64 overflow-y-auto">
                  {calificaciones.map((r) => (
                    <div key={r.id} className="pb-3 border-b border-vela-line last:border-b-0 last:pb-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-vela-text-faint">
                          {new Date(r.creado_en).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        <span className="text-sm text-vela-amber">{'★'.repeat(r.estrellas)}{'☆'.repeat(5 - r.estrellas)}</span>
                      </div>
                      {r.chips.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {r.chips.map((chip) => (
                            <span key={chip} className="text-[11px] bg-vela-surface-2 border border-vela-line text-vela-text-faint rounded-full px-2.5 py-1">{chip}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </SectionCard>

          <SectionCard titulo="INFORMACIÓN VISIBLE">
            <div className="py-3 border-b border-vela-line">
              <p className="text-xs text-vela-text-faint mb-0.5">Nota pública · qué tipo de persona eres</p>
              <p className={`text-base ${perfil.nota_publica ? 'text-vela-text italic' : 'text-vela-text-faint'}`}>
                {perfil.nota_publica ? `“${perfil.nota_publica}”` : 'Aún no escribes tu nota pública.'}
              </p>
            </div>
            <FilaDato label="Alias" valor={perfil.alias} />
            {edad !== null && <FilaDato label="Edad" valor={`${edad} años`} />}
            <FilaDato label="Ciudad" valor={perfil.ciudad || '—'} />
            <FilaDato label="Estatura" valor={perfil.estatura || '—'} />
            <FilaDato label="Idiomas" valor={perfil.idiomas || '—'} />
            <FilaDato label="Disponible" valor={perfil.disponible || '—'} />
            {perfil.rol === 'proveedor' && <FilaDato label="Regalo que le gusta" valor={perfil.regalo || '—'} />}
            {perfil.rol === 'proveedor' && chipsPreferencia.length > 0 && (
              <div className="pt-3">
                <p className="text-xs text-vela-text-faint mb-2">Preferencias</p>
                <div className="flex flex-wrap gap-2">
                  {chipsPreferencia.map((c) => (
                    <span key={c} className="text-xs bg-vela-public-soft border border-vela-public/30 text-vela-public rounded-full px-3 py-1.5">{c}</span>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => setShowEdit(true)} className="min-h-11 text-sm text-vela-public font-semibold mt-3 pt-3 border-t border-vela-line w-full text-center">
              Editar esta información
            </button>
          </SectionCard>

          <SectionCard titulo="VISIBILIDAD SEGÚN TU ZONA">
            <p className="text-sm text-vela-text-faint mb-3">
              Elige dónde quieres ser más visible para quienes buscan conocer a alguien.
            </p>
            <div className="rounded-2xl bg-vela-surface-2 border border-vela-line p-4">
              <p className="text-xs text-vela-text-faint mb-1">Alcance actual</p>
              <p className="text-base font-semibold text-vela-text">
                {resumenVisibilidad(
                  perfil.visibilidad_alcance ?? 'nacional',
                  perfil.visibilidad_departamentos,
                  perfil.visibilidad_municipios,
                )}
              </p>
            </div>
            {planPermiteZona ? (
              <>
                <p className="text-xs text-vela-text-faint mt-3">
                  {perfil.plan === 'vip'
                    ? 'Plan VIP: cambios de zona ilimitados.'
                    : `Plan Gold: ${zonaUsados} de ${ZONA_LIMITE_GOLD} cambios usados este mes.`}
                </p>
                <button
                  onClick={() => setShowZona(true)}
                  disabled={zonaAgotada}
                  className="min-h-11 text-sm text-vela-public font-semibold mt-2 w-full text-center disabled:text-vela-text-faint"
                >
                  {zonaAgotada ? 'Ya usaste tus 20 cambios de este mes' : 'Cambiar mi zona de visibilidad'}
                </button>
              </>
            ) : (
              <p className="text-xs text-vela-amber mt-3 text-center">
                Cambiar tu zona de visibilidad está disponible en los planes Gold y VIP.
              </p>
            )}
          </SectionCard>
        </div>
      )}

      {tab === 'privado' && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 items-start rounded-2xl border border-vela-verified/40 bg-vela-verified-soft p-4">
            <span className="text-lg">✅</span>
            <p className="text-sm text-vela-text-dim">
              <span className="font-bold text-vela-text">Verificado por Vela.</span>{' '}
              No visible para otros usuarios: son los datos que ingresaste para iniciar sesión.
            </p>
          </div>

          <SectionCard titulo="DATOS PROTEGIDOS">
            <FilaDato label="Nombre completo" valor={perfil.nombre_completo || '—'} />
            <FilaDato label="Teléfono" valor={perfil.telefono ? `${perfil.telefono.slice(0, 4)}•••••` : '—'} />
            <FilaDato label="Correo" valor={perfil.correo ? perfil.correo.replace(/(.{2}).+(@.+)/, '$1•••$2') : '—'} />
            <FilaDato label="Verificado" valor={perfil.estado_verificacion === 'aprobado' ? 'Identidad confirmada' : 'Pendiente'} />
            <FilaDato label="Miembro desde" valor={new Date(perfil.creado_en).toLocaleDateString('es-SV', { month: 'long', year: 'numeric' })} />
          </SectionCard>

          <SectionCard titulo="CUENTA Y SEGURIDAD">
            <button onClick={() => setShowCerrarSesionModal(true)} className="w-full min-h-12 text-left py-3 text-base text-vela-amber font-semibold">
              Cerrar sesión
            </button>
            <button onClick={() => setShowEliminarModal(true)} className="w-full min-h-12 text-left py-3 text-base text-vela-safety font-semibold border-t border-vela-line">
              Eliminar cuenta
            </button>
          </SectionCard>
        </div>
      )}

      {tab === 'historial' && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold text-vela-text-faint tracking-wide">{historial.length} ENCUENTROS COMPLETADOS</p>
          {historial.slice(0, historialLimite).map((h) => (
            <div key={h.id} className="bg-vela-surface border border-vela-line rounded-2xl px-4 py-3.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-extrabold text-vela-text shrink-0">Encuentro #{h.veces}</span>
                <span className="text-xs text-vela-text-faint shrink-0">· {h.fecha}</span>
                {h.cancelada ? (
                  <span className="text-[11px] font-extrabold text-vela-safety bg-vela-safety-soft border border-vela-safety/40 rounded-full px-2.5 py-0.5 shrink-0">Cancelada</span>
                ) : h.calRating > 0 ? (
                  <span className="text-sm text-vela-amber shrink-0">{'★'.repeat(h.calRating)}</span>
                ) : (
                  <span className="text-[11px] text-vela-text-faint shrink-0">Sin calificar</span>
                )}
                {!h.cancelada && h.chips.length > 0 && (
                  <div className="flex gap-1 min-w-0 flex-1 overflow-hidden">
                    {h.chips.map((chip) => (
                      <span key={chip} className="text-[10px] whitespace-nowrap bg-vela-surface-2 border border-vela-line text-vela-text-faint rounded-full px-2 py-0.5">
                        {chip}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {h.cancelada && h.motivoCancelacion && (
                <div className="bg-vela-surface-2 rounded-xl p-3 mt-2">
                  <p className="text-xs font-semibold text-vela-text-faint mb-0.5">
                    {h.yoCancele ? 'Tú cancelaste:' : 'La otra persona canceló:'}
                  </p>
                  <p className="text-sm text-vela-text-dim italic">{h.motivoCancelacion}</p>
                </div>
              )}
            </div>
          ))}
          {historial.length > historialLimite && (
            <button onClick={() => setHistorialLimite((l) => l + 5)} className="min-h-11 text-sm text-vela-public font-semibold py-2 text-center">
              Ver más encuentros
            </button>
          )}
          {historial.length === 0 && <p className="text-sm text-vela-text-faint text-center py-8">Aún no tienes encuentros finalizados.</p>}
        </div>
      )}

      {showEdit && (
        <ModalEditarPerfil
          perfil={perfil}
          hobbiesIniciales={hobbies}
          chipsIniciales={chipsPreferencia}
          onCerrar={() => setShowEdit(false)}
          onGuardado={() => { setShowEdit(false); cargar(); }}
        />
      )}

      {showZona && (
        <ModalZona
          perfil={perfil}
          usados={zonaUsados}
          onCerrar={() => setShowZona(false)}
          onGuardado={() => { setShowZona(false); cargar(); }}
        />
      )}

      {showCerrarSesionModal && (
        <ModalConfirmar
          titulo="¿Cerrar sesión?"
          cuerpo="Puedes volver a iniciar sesión cuando quieras. Aparecerás sin conexión."
          textoConfirmar="Sí, cerrar sesión"
          colorConfirmar="bg-vela-amber"
          onCancelar={() => setShowCerrarSesionModal(false)}
          onConfirmar={confirmarCerrarSesion}
        />
      )}

      {showEliminarModal && (
        <ModalConfirmar
          titulo="¿Eliminar tu cuenta?"
          cuerpo="No podrás iniciar sesión hasta que decidas reactivarla. Tus datos no se borran."
          textoConfirmar="Sí, eliminar"
          colorConfirmar="bg-vela-safety"
          onCancelar={() => setShowEliminarModal(false)}
          onConfirmar={confirmarEliminarCuenta}
        />
      )}
    </main>
  );
}

function SectionCard({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-vela-surface border border-vela-line border-l-2 border-l-vela-public rounded-2xl p-5">
      <p className="text-xs font-bold text-vela-public tracking-wide mb-3">{titulo}</p>
      {children}
    </div>
  );
}

function FilaDato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="py-3 border-b border-vela-line last:border-b-0">
      <p className="text-xs text-vela-text-faint mb-0.5">{label}</p>
      <p className="text-base text-vela-text font-semibold">{valor}</p>
    </div>
  );
}

function ModalConfirmar({ titulo, cuerpo, textoConfirmar, colorConfirmar, onCancelar, onConfirmar }: {
  titulo: string; cuerpo: string; textoConfirmar: string; colorConfirmar: string;
  onCancelar: () => void; onConfirmar: () => void;
}) {
  const [procesando, setProcesando] = useState(false);
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
      <div className="bg-vela-surface border border-vela-line rounded-3xl p-6 max-w-sm w-full text-center">
        <h3 className="text-xl font-extrabold text-vela-text mb-2">{titulo}</h3>
        <p className="text-sm text-vela-text-dim mb-6 leading-relaxed">{cuerpo}</p>
        <div className="flex gap-3">
          <button onClick={onCancelar} className="flex-1 h-12 rounded-full bg-vela-surface-2 text-vela-text-faint text-sm font-bold">
            Cancelar
          </button>
          <button
            onClick={async () => { setProcesando(true); await onConfirmar(); }}
            disabled={procesando}
            className={`flex-1 h-12 rounded-full text-white text-sm font-bold disabled:opacity-60 ${colorConfirmar}`}
          >
            {procesando ? 'Procesando...' : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalEditarPerfil({ perfil, hobbiesIniciales, chipsIniciales, onCerrar, onGuardado }: {
  perfil: PerfilCompleto; hobbiesIniciales: string[]; chipsIniciales: string[];
  onCerrar: () => void; onGuardado: () => void;
}) {
  const [ciudad, setCiudad] = useState(perfil.ciudad ?? '');
  const [estatura, setEstatura] = useState(perfil.estatura ?? '');
  const [idiomas, setIdiomas] = useState(perfil.idiomas ?? '');
  const [nota, setNota] = useState(perfil.nota_publica ?? '');
  const [disponibilidad, setDisponibilidad] = useState<string[]>((perfil.disponible ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const [regalo, setRegalo] = useState(perfil.regalo ?? '');
  const [hobbiesSel, setHobbiesSel] = useState<string[]>(hobbiesIniciales);
  const [chipsSel, setChipsSel] = useState<string[]>(chipsIniciales);
  const [fotos, setFotos] = useState<string[]>(perfil.fotos ?? []);
  const [guardando, setGuardando] = useState(false);

  const limite = CAPACIDADES[perfil.plan].maxFotos;

  function toggleDisponibilidad(op: string) {
    setDisponibilidad((prev) => (prev.includes(op) ? prev.filter((x) => x !== op) : [...prev, op]));
  }
  function toggleHobby(id: string) {
    setHobbiesSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleChip(chip: string) {
    setChipsSel((prev) => (prev.includes(chip) ? prev.filter((x) => x !== chip) : [...prev, chip]));
  }

  async function guardar() {
    if (fotos.length < FOTO_MIN || guardando) return;
    setGuardando(true);
    const supabase = createClient();

    const { error } = await supabase
      .from('perfiles')
      .update({
        ciudad: ciudad.trim(),
        estatura: estatura.trim(),
        idiomas: idiomas.trim(),
        nota_publica: nota.trim() || null,
        disponible: disponibilidad.join(', '),
        fotos,
        ...(perfil.rol === 'proveedor' ? { regalo: regalo.trim() || null } : {}),
      })
      .eq('id', perfil.id);

    if (error) {
      console.error('Error guardando perfil:', error);
      setGuardando(false);
      return;
    }

    await supabase.from('perfil_hobbies').delete().eq('perfil_id', perfil.id);
    if (hobbiesSel.length > 0) {
      await supabase.from('perfil_hobbies').insert(hobbiesSel.map((h) => ({ perfil_id: perfil.id, hobby_id: h })));
    }

    if (perfil.rol === 'proveedor') {
      await supabase.from('perfil_chips_preferencia').delete().eq('perfil_id', perfil.id);
      if (chipsSel.length > 0) {
        await supabase.from('perfil_chips_preferencia').insert(chipsSel.map((chip) => ({ perfil_id: perfil.id, chip })));
      }
    }

    setGuardando(false);
    onGuardado();
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50">
      <div className="bg-vela-bg border border-vela-line rounded-t-[28px] sm:rounded-[28px] max-w-md w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-vela-line sticky top-0 bg-vela-bg z-10">
          <h2 className="text-xl font-extrabold text-vela-text italic">Editar perfil</h2>
          <button onClick={onCerrar} className="w-11 h-11 rounded-full bg-vela-surface-2 flex items-center justify-center text-vela-text-dim">✕</button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          <EditorFotos
            userId={perfil.id}
            fotos={fotos}
            onChange={setFotos}
            limite={limite}
            minimo={FOTO_MIN}
          />

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-vela-text-faint">Nota pública</label>
              <span className="text-xs text-vela-text-faint">{nota.length}/{NOTA_MAX}</span>
            </div>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value.slice(0, NOTA_MAX))}
              rows={3}
              placeholder="Cuenta qué tipo de persona eres: tu forma de ser, lo que disfrutas, qué buscas..."
              className="w-full mt-1.5 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 py-3 text-base text-vela-text outline-none focus:border-vela-public/60 resize-none"
            />
          </div>

          <CampoEdit label="Ciudad" value={ciudad} onChange={setCiudad} />
          <CampoEdit label="Estatura" value={estatura} onChange={setEstatura} />
          <CampoEdit label="Idiomas" value={idiomas} onChange={setIdiomas} />

          <div>
            <p className="text-xs font-semibold text-vela-text-faint mb-2">Disponibilidad</p>
            <div className="flex flex-wrap gap-2">
              {DISPONIBILIDAD_OPCIONES.map((op) => (
                <ChipMini key={op} texto={op} activo={disponibilidad.includes(op)} onClick={() => toggleDisponibilidad(op)} />
              ))}
            </div>
          </div>

          {perfil.rol === 'proveedor' && (
            <>
              <CampoEdit label="¿Qué te gusta que te regalen?" value={regalo} onChange={setRegalo} />
              <div>
                <p className="text-xs font-semibold text-vela-text-faint mb-2">Tu tiempo es para...</p>
                <div className="flex flex-col gap-4">
                  {CATEGORIAS_CHIPS.map((cat) => (
                    <div key={cat.id}>
                      <p className="text-xs text-vela-public font-semibold mb-1.5">{cat.label}</p>
                      <div className="flex flex-wrap gap-2">
                        {cat.chips.map((chip) => (
                          <ChipMini key={chip} texto={chip} activo={chipsSel.includes(chip)} onClick={() => toggleChip(chip)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <p className="text-xs font-semibold text-vela-text-faint mb-2">Pasatiempos ({hobbiesSel.length})</p>
            <div className="flex flex-wrap gap-2">
              {PASATIEMPOS.map((h) => (
                <ChipMini key={h.id} texto={h.label} activo={hobbiesSel.includes(h.id)} onClick={() => toggleHobby(h.id)} />
              ))}
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-vela-line sticky bottom-0 bg-vela-bg">
          <button
            onClick={guardar}
            disabled={fotos.length < FOTO_MIN || guardando}
            className="w-full h-14 rounded-full bg-vela-public text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {guardando
              ? 'Guardando...'
              : fotos.length < FOTO_MIN
                ? `Necesitas al menos ${FOTO_MIN} fotos`
                : (
                  <>
                    Guardar cambios
                    <IconoFlecha />
                  </>
                )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalZona({ perfil, usados, onCerrar, onGuardado }: {
  perfil: PerfilCompleto; usados: number; onCerrar: () => void; onGuardado: () => void;
}) {
  const [alcance, setAlcance] = useState<AlcanceVisibilidad>(perfil.visibilidad_alcance ?? 'nacional');
  const [deptosSel, setDeptosSel] = useState<string[]>(perfil.visibilidad_departamentos ?? []);
  const [munisSel, setMunisSel] = useState<string[]>(perfil.visibilidad_municipios ?? []);
  const [deptoAbierto, setDeptoAbierto] = useState<string>(DEPARTAMENTOS[0]);
  const [guardando, setGuardando] = useState(false);
  const [errorZona, setErrorZona] = useState('');

  const esGold = perfil.plan === 'gold';

  const zonaInvalida =
    (alcance === 'departamento' && deptosSel.length === 0) ||
    (alcance === 'municipio' && munisSel.length === 0);

  function toggleDepto(d: string) {
    setDeptosSel((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }
  function toggleMuni(m: string) {
    setMunisSel((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  async function guardarZona() {
    if (zonaInvalida || guardando) return;
    setGuardando(true);
    setErrorZona('');
    const supabase = createClient();

    // El conteo mensual y el límite por plan los valida la base de datos (función cambiar_zona_visibilidad).
    const { data, error } = await supabase.rpc('cambiar_zona_visibilidad', {
      p_alcance: alcance,
      p_departamentos: alcance === 'departamento' ? deptosSel : [],
      p_municipios: alcance === 'municipio' ? munisSel : [],
    });

    if (error) {
      console.error('Error cambiando zona:', error.message, error.details, error.hint, error.code);
      setErrorZona('No se pudo guardar tu zona. Intenta de nuevo.');
      setGuardando(false);
      return;
    }

    const res = data as { ok?: boolean; error?: string } | null;
    if (!res?.ok) {
      setErrorZona(
        res?.error === 'limite'
          ? `Ya usaste tus ${ZONA_LIMITE_GOLD} cambios de zona de este mes. Se renuevan el próximo mes.`
          : res?.error === 'plan'
            ? 'Cambiar la zona está disponible en los planes Gold y VIP.'
            : 'No se pudo guardar tu zona. Intenta de nuevo.',
      );
      setGuardando(false);
      return;
    }

    setGuardando(false);
    onGuardado();
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50">
      <div className="bg-vela-bg border border-vela-line rounded-t-[28px] sm:rounded-[28px] max-w-md w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-vela-line sticky top-0 bg-vela-bg z-10">
          <h2 className="text-xl font-extrabold text-vela-text italic">Zona de visibilidad</h2>
          <button onClick={onCerrar} className="w-11 h-11 rounded-full bg-vela-surface-2 flex items-center justify-center text-vela-text-dim">✕</button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <p className="text-xs text-vela-text-faint">
            {esGold
              ? `Plan Gold: llevas ${usados} de ${ZONA_LIMITE_GOLD} cambios este mes. Guardar un cambio cuenta como uno.`
              : 'Plan VIP: puedes cambiar tu zona sin límite.'}
          </p>

          <div className="rounded-2xl border border-vela-line bg-vela-surface p-4">
            <p className="text-sm font-bold text-vela-public mb-1">Elige tu zona de visibilidad</p>
            <p className="text-xs text-vela-text-faint mb-3">¿Dónde quieres ser más visible?</p>

            <div className="grid grid-cols-3 gap-2 mb-3">
              {([
                ['nacional', 'Nacional'],
                ['departamento', 'Departamento'],
                ['municipio', 'Municipio'],
              ] as [AlcanceVisibilidad, string][]).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  onClick={() => setAlcance(valor)}
                  className={`rounded-xl border h-12 text-xs font-bold transition ${
                    alcance === valor
                      ? 'border-vela-public bg-vela-public-soft text-vela-public'
                      : 'border-vela-line bg-vela-surface-2 text-vela-text-faint'
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>

            {alcance === 'nacional' && (
              <p className="text-xs text-vela-text-dim">Aparecerás por igual en todo El Salvador.</p>
            )}

            {alcance === 'departamento' && (
              <div className="flex flex-wrap gap-2">
                {DEPARTAMENTOS.map((d) => (
                  <ChipMini key={d} texto={d} activo={deptosSel.includes(d)} onClick={() => toggleDepto(d)} />
                ))}
              </div>
            )}

            {alcance === 'municipio' && (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-xs text-vela-text-faint mb-1.5">1. Elige un departamento para ver sus municipios</p>
                  <div className="flex flex-wrap gap-2">
                    {DEPARTAMENTOS.map((d) => {
                      const cuantos = ZONAS_SV[d].filter((m) => munisSel.includes(m)).length;
                      return (
                        <button
                          key={d}
                          onClick={() => setDeptoAbierto(d)}
                          className={`rounded-full border px-3.5 py-2 text-xs font-semibold ${
                            deptoAbierto === d
                              ? 'border-vela-public text-vela-public bg-vela-public-soft'
                              : 'border-vela-line text-vela-text-faint bg-vela-surface-2'
                          }`}
                        >
                          {d}{cuantos > 0 ? ` (${cuantos})` : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-vela-text-faint mb-1.5">2. Marca tus municipios en {deptoAbierto}</p>
                  <div className="flex flex-wrap gap-2">
                    {ZONAS_SV[deptoAbierto].map((m) => (
                      <ChipMini key={m} texto={m} activo={munisSel.includes(m)} onClick={() => toggleMuni(m)} />
                    ))}
                  </div>
                </div>
                {munisSel.length > 0 && (
                  <p className="text-xs text-vela-text-dim">Seleccionados: {munisSel.join(', ')}</p>
                )}
              </div>
            )}

            {zonaInvalida && (
              <p className="mt-2 text-xs text-vela-amber">
                Elige al menos {alcance === 'departamento' ? 'un departamento' : 'un municipio'} para guardar.
              </p>
            )}
          </div>

          {errorZona && <p className="text-xs text-vela-safety">{errorZona}</p>}
        </div>

        <div className="p-5 border-t border-vela-line sticky bottom-0 bg-vela-bg">
          <button
            onClick={guardarZona}
            disabled={zonaInvalida || guardando}
            className="w-full h-14 rounded-full bg-vela-public text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : zonaInvalida ? 'Completa tu zona' : (
              <>
                Guardar zona
                <IconoFlecha />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function CampoEdit({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-semibold text-vela-text-faint">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1.5 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none focus:border-vela-public/60"
      />
    </div>
  );
}

function ChipMini({ texto, activo, onClick }: { texto: string; activo: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 rounded-full text-sm font-medium border transition ${
        activo ? 'bg-vela-public-soft border-vela-public text-vela-public' : 'bg-vela-surface-2 border-vela-line text-vela-text-faint'
      }`}
    >
      {texto}
    </button>
  );
}

/** Flecha de los botones principales (solo diseño). */
function IconoFlecha() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}