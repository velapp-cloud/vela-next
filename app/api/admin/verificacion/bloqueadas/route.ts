/**
 * app/api/admin/bloqueadas/route.ts
 * GET  → cuentas bloqueadas por una alerta + mensajes que escribieron a Vela.
 * POST → { accion: 'desbloquear', cita_id } o { accion: 'descartar', solicitud_id }.
 * Solo administradores.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cliente() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function adminId(admin: ReturnType<typeof cliente>, request: NextRequest): Promise<string | null> {
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  const id = data?.user?.id;
  if (!id) return null;
  const { data: p } = await admin.from('perfiles').select('es_admin').eq('id', id).maybeSingle();
  return p?.es_admin ? id : null;
}

export async function GET(request: NextRequest) {
  const admin = cliente();
  if (!(await adminId(admin, request))) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { data: citas, error } = await admin
    .from('citas')
    .select('id, cliente_id, proveedora_id, lugar, estado_manual, en_emergencia_por, emergencia_automatica, emergencia_iniciada_en, emergencia_restante_segundos')
    .eq('en_emergencia', true)
    .order('emergencia_iniciada_en', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Las citas ya canceladas o finalizadas no bloquean a nadie (igual que en la app).
  const vigentes = (citas ?? []).filter((c) => {
    const e = String(c.estado_manual ?? '').toLowerCase();
    return !e.includes('cancel') && !e.includes('finaliz');
  });

  const { data: solicitudes } = await admin
    .from('solicitudes_desbloqueo')
    .select('id, usuario_id, cita_id, motivo, estado, correo_enviado, creado_en')
    .order('creado_en', { ascending: false })
    .limit(100);

  const ids = new Set<string>();
  vigentes.forEach((c) => { ids.add(c.cliente_id); ids.add(c.proveedora_id); });
  (solicitudes ?? []).forEach((s) => ids.add(s.usuario_id));

  const { data: perfiles } = ids.size
    ? await admin.from('perfiles').select('id, alias, correo, telefono').in('id', Array.from(ids))
    : { data: [] as { id: string; alias: string | null; correo: string | null; telefono: string | null }[] };
  const mapa = new Map((perfiles ?? []).map((p) => [p.id, p]));
  const persona = (id: string) => ({
    id,
    alias: mapa.get(id)?.alias ?? '—',
    correo: mapa.get(id)?.correo ?? '',
    telefono: mapa.get(id)?.telefono ?? '',
  });

  const bloqueos = vigentes.map((c) => {
    const iniciador = c.en_emergencia_por as string | null;
    // Si la activó una persona se bloquea a la otra; si fue automática o antigua, a las dos.
    const bloqueadosIds =
      c.emergencia_automatica || !iniciador
        ? [c.cliente_id, c.proveedora_id]
        : [iniciador === c.cliente_id ? c.proveedora_id : c.cliente_id];
    return {
      cita_id: c.id,
      lugar: c.lugar,
      automatica: !!c.emergencia_automatica,
      desde: c.emergencia_iniciada_en,
      restante_segundos: c.emergencia_restante_segundos,
      iniciada_por: iniciador ? persona(iniciador) : null,
      bloqueados: bloqueadosIds.map(persona),
      solicitudes: (solicitudes ?? [])
        .filter((s) => s.cita_id === c.id)
        .map((s) => ({ ...s, alias: persona(s.usuario_id).alias })),
    };
  });

  return NextResponse.json({ bloqueos });
}

export async function POST(request: NextRequest) {
  const admin = cliente();
  const yoId = await adminId(admin, request);
  if (!yoId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  if (body?.accion === 'desbloquear' && body?.cita_id) {
    const { data: cita, error } = await admin
      .from('citas')
      .update({ en_emergencia: false, en_emergencia_por: null, emergencia_automatica: false })
      .eq('id', body.cita_id)
      .select('cliente_id, proveedora_id')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await admin
      .from('solicitudes_desbloqueo')
      .update({ estado: 'atendida', resuelto_en: new Date().toISOString() })
      .eq('cita_id', body.cita_id)
      .eq('estado', 'pendiente');

    if (cita) {
      await admin.from('notificaciones').insert([
        { para_usuario_id: cita.cliente_id, mensaje: '✅ Vela revisó tu caso y desbloqueó la cuenta.', ruta: '/encuentro' },
        { para_usuario_id: cita.proveedora_id, mensaje: '✅ Vela revisó tu caso y desbloqueó la cuenta.', ruta: '/encuentro' },
      ]);
    }
    return NextResponse.json({ ok: true });
  }

  if (body?.accion === 'descartar' && body?.solicitud_id) {
    const { error } = await admin
      .from('solicitudes_desbloqueo')
      .update({ estado: 'rechazada', resuelto_en: new Date().toISOString() })
      .eq('id', body.solicitud_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
}