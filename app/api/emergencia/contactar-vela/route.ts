/**
 * app/api/emergencia/contactar-vela/route.ts
 * La persona bloqueada por una alerta escribe a Vela. Se guarda la solicitud y se
 * manda un correo con la bandera "DESBLOQUEAR CUENTA" y el motivo.
 * Autenticación: Authorization: Bearer <access_token de Supabase>.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DESTINO = process.env.VELA_CORREO_DESBLOQUEO || 'velapp.contacto@gmail.com';
const URL_APP = process.env.NEXT_PUBLIC_APP_URL || 'https://www.myvelapp.com';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hora(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-SV', { timeZone: 'America/El_Salvador', hour12: true });
}

function reloj(seg: number | null | undefined): string {
  if (seg == null) return '—';
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  return `${h}h ${m}m ${s}s`;
}

export async function POST(request: NextRequest) {
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data: sesion } = await admin.auth.getUser(token);
  const miId = sesion?.user?.id;
  if (!miId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let citaId = '';
  let motivo = '';
  try {
    const body = await request.json();
    citaId = String(body?.cita_id ?? '');
    motivo = String(body?.motivo ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }
  if (!citaId) return NextResponse.json({ error: 'Falta la cita' }, { status: 400 });
  if (motivo.length < 10) return NextResponse.json({ error: 'Cuéntanos un poco más (mínimo 10 caracteres).' }, { status: 400 });
  if (motivo.length > 1000) motivo = motivo.slice(0, 1000);

  const { data: cita } = await admin
    .from('citas')
    .select('id, cliente_id, proveedora_id, lugar, hora_acordada, en_emergencia, en_emergencia_por, emergencia_automatica, emergencia_iniciada_en, emergencia_restante_segundos')
    .eq('id', citaId)
    .maybeSingle();

  if (!cita || (cita.cliente_id !== miId && cita.proveedora_id !== miId)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  if (!cita.en_emergencia) {
    return NextResponse.json({ error: 'La alerta ya no está activa.' }, { status: 409 });
  }

  // Máximo un mensaje cada 2 minutos por persona y cita.
  const hace2 = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: reciente } = await admin
    .from('solicitudes_desbloqueo')
    .select('id')
    .eq('usuario_id', miId)
    .eq('cita_id', citaId)
    .gte('creado_en', hace2)
    .limit(1);
  if (reciente && reciente.length > 0) {
    return NextResponse.json({ error: 'Ya enviaste un mensaje hace un momento. Espera un par de minutos.' }, { status: 429 });
  }

  const iniciadorId = cita.en_emergencia_por as string | null;
  const [{ data: yo }, { data: iniciador }] = await Promise.all([
    admin.from('perfiles').select('alias, nombre_completo, correo, telefono').eq('id', miId).maybeSingle(),
    iniciadorId
      ? admin.from('perfiles').select('alias').eq('id', iniciadorId).maybeSingle()
      : Promise.resolve({ data: null as { alias: string | null } | null }),
  ]);

  const { data: fila, error: errInsert } = await admin
    .from('solicitudes_desbloqueo')
    .insert({ usuario_id: miId, cita_id: citaId, motivo })
    .select('id')
    .single();
  if (errInsert || !fila) {
    console.error('No se guardó la solicitud de desbloqueo:', errInsert?.message);
    return NextResponse.json({ error: 'No se pudo guardar tu mensaje. Intenta de nuevo.' }, { status: 500 });
  }

  // ---- Correo para Vela ----
  let correoEnviado = false;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (apiKey && from) {
    const origen = cita.emergencia_automatica
      ? 'Alerta automática de Vela (la cita no se finalizó a tiempo)'
      : `Alerta activada por ${iniciador?.alias ?? 'la otra persona'}`;
    const asunto = `DESBLOQUEAR CUENTA — ${yo?.alias ?? 'usuario'}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <div style="background:#D91F3A;color:#fff;padding:14px 18px;border-radius:12px 12px 0 0;font-size:18px;font-weight:800;letter-spacing:.5px">
          🔓 DESBLOQUEAR CUENTA
        </div>
        <div style="border:1px solid #ddd;border-top:0;padding:18px;border-radius:0 0 12px 12px">
          <p style="margin:0 0 4px;color:#666;font-size:12px">MOTIVO QUE ESCRIBIÓ LA PERSONA</p>
          <p style="margin:0 0 16px;font-size:16px;white-space:pre-wrap">${esc(motivo)}</p>
          <table style="font-size:14px;border-collapse:collapse;width:100%">
            <tr><td style="padding:4px 0;color:#666">Cuenta bloqueada</td><td><b>${esc(yo?.alias)}</b> (${esc(yo?.nombre_completo)})</td></tr>
            <tr><td style="padding:4px 0;color:#666">Correo</td><td>${esc(yo?.correo)}</td></tr>
            <tr><td style="padding:4px 0;color:#666">Teléfono</td><td>${esc(yo?.telefono)}</td></tr>
            <tr><td style="padding:4px 0;color:#666">Origen de la alerta</td><td>${esc(origen)}</td></tr>
            <tr><td style="padding:4px 0;color:#666">Alerta activada</td><td>${esc(hora(cita.emergencia_iniciada_en))}</td></tr>
            <tr><td style="padding:4px 0;color:#666">Tiempo que quedaba</td><td>${esc(reloj(cita.emergencia_restante_segundos))}</td></tr>
            <tr><td style="padding:4px 0;color:#666">Lugar de la cita</td><td>${esc(cita.lugar)}</td></tr>
            <tr><td style="padding:4px 0;color:#666">Cita</td><td>${esc(cita.id)}</td></tr>
          </table>
          <p style="margin:18px 0 0">
            <a href="${esc(URL_APP)}/admin/bloqueadas" style="background:#D91F3A;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block">
              Abrir panel de cuentas bloqueadas
            </a>
          </p>
        </div>
      </div>`;
    const texto =
      `DESBLOQUEAR CUENTA\n\nMotivo:\n${motivo}\n\nCuenta: ${yo?.alias ?? ''} (${yo?.nombre_completo ?? ''})\n` +
      `Correo: ${yo?.correo ?? ''}\nTeléfono: ${yo?.telefono ?? ''}\nOrigen: ${origen}\n` +
      `Alerta activada: ${hora(cita.emergencia_iniciada_en)}\nTiempo que quedaba: ${reloj(cita.emergencia_restante_segundos)}\n` +
      `Lugar: ${cita.lugar}\nCita: ${cita.id}\n\nPanel: ${URL_APP}/admin/bloqueadas`;

    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [DESTINO],
          subject: asunto,
          html,
          text: texto,
          ...(yo?.correo ? { reply_to: yo.correo } : {}),
        }),
      });
      correoEnviado = resp.ok;
      if (!resp.ok) console.error('Resend rechazó el correo:', resp.status, await resp.text());
    } catch (e) {
      console.error('No se pudo enviar el correo a Vela:', e);
    }
  } else {
    console.error('Faltan RESEND_API_KEY o EMAIL_FROM en el servidor.');
  }

  if (correoEnviado) {
    await admin.from('solicitudes_desbloqueo').update({ correo_enviado: true }).eq('id', fila.id);
  }

  // El mensaje queda guardado y visible en el panel admin aunque el correo falle.
  return NextResponse.json({ ok: true, correo: correoEnviado });
}