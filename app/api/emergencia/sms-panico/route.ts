/**
 * app/api/emergencia/sms-panico/route.ts
 * La llama la app justo después de que una persona activa el botón de pánico.
 * Envía un SMS a SUS contactos de emergencia, sin abrir ninguna ventana.
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

  // Marca atómica: un solo envío por alerta, y solo si la alerta la activó esta persona.
  const { data: cita } = await admin
    .from('citas')
    .update({ emergencia_sms_enviado: true })
    .eq('id', citaId)
    .eq('en_emergencia', true)
    .eq('en_emergencia_por', miId)
    .eq('emergencia_sms_enviado', false)
    .select('id, lugar, direccion, cliente_id, proveedora_id')
    .maybeSingle();

  if (!cita) return NextResponse.json({ ok: true, omitido: true, enviados: 0, total: 0 });

  const otroId = cita.cliente_id === miId ? cita.proveedora_id : cita.cliente_id;
  const [{ data: yo }, { data: otro }, { data: contactos }] = await Promise.all([
    admin.from('perfiles').select('alias').eq('id', miId).maybeSingle(),
    admin.from('perfiles').select('alias').eq('id', otroId).maybeSingle(),
    admin.from('contactos_emergencia').select('pais_dial, telefono').eq('usuario_id', miId),
  ]);

  const lugar = `${cita.lugar ?? ''}${cita.direccion ? ` (${cita.direccion})` : ''}`.trim();
  const texto =
    `ALERTA Vela: ${yo?.alias ?? 'Tu contacto'} activo una alerta de emergencia durante una cita con ` +
    `${otro?.alias ?? 'otra persona'}${lugar ? ` en ${lugar}` : ''}. ` +
    `Intenta comunicarte con esa persona ahora. Si no responde, busca ayuda.`;

  const lista = contactos ?? [];
  let enviados = 0;
  const errores: string[] = [];
  for (const c of lista) {
    const numero = aE164(c.pais_dial, c.telefono);
    if (!numero) continue;
    const r = await enviarSms(numero, texto);
    if (r.ok) enviados += 1;
    else errores.push(r.error ?? 'error');
  }

  // Si no salió ni un SMS, se libera la marca para poder reintentar.
  if (lista.length > 0 && enviados === 0) {
    await admin.from('citas').update({ emergencia_sms_enviado: false }).eq('id', citaId);
  }
  if (errores.length > 0) console.error('SMS de pánico con errores:', errores);

  return NextResponse.json({ ok: true, enviados, total: lista.length });
}