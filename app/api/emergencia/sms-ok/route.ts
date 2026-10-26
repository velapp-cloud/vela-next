/**
 * app/api/emergencia/sms-ok/route.ts
 * La llama la app cuando la persona protegida desactiva una alerta automática y pulsa
 * "Avisar a mis contactos que estoy bien". Envía un SMS a SUS contactos de emergencia.
 * Autenticación: cabecera Authorization: Bearer <access_token de Supabase>.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { aE164, enviarSms } from '@/lib/emergencia/twilio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data: usuario } = await admin.auth.getUser(token);
  const miId = usuario?.user?.id;
  if (!miId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let citaId: string | undefined;
  try {
    const body = await request.json();
    citaId = body?.cita_id;
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }
  if (!citaId) return NextResponse.json({ error: 'Falta cita_id' }, { status: 400 });

  // Solo si la alerta automática fue de esta persona y sus contactos ya habían recibido el SMS de alerta.
  const { data: cita } = await admin
    .from('citas')
    .update({ emergencia_sms_ok_enviado: true })
    .eq('id', citaId)
    .eq('emergencia_sms_enviado', true)
    .eq('emergencia_sms_ok_enviado', false)
    .contains('emergencia_auto_para', [miId])
    .select('id')
    .maybeSingle();

  if (!cita) return NextResponse.json({ ok: true, enviados: 0, motivo: 'nada que avisar' });

  const [{ data: perfil }, { data: contactos }] = await Promise.all([
    admin.from('perfiles').select('alias').eq('id', miId).maybeSingle(),
    admin.from('contactos_emergencia').select('pais_dial, telefono').eq('usuario_id', miId),
  ]);

  const alias = perfil?.alias ?? 'Tu contacto';
  const texto = `Vela: la alerta que recibiste sobre ${alias} fue un descuido. Esa persona esta bien. Disculpa el susto.`;

  let enviados = 0;
  for (const c of contactos ?? []) {
    const numero = aE164(c.pais_dial, c.telefono);
    if (!numero) continue;
    const r = await enviarSms(numero, texto);
    if (r.ok) enviados += 1;
  }

  return NextResponse.json({ ok: true, enviados });
}