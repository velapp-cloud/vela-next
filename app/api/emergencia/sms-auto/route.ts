/**
 * app/api/emergencia/sms-auto/route.ts
 * La llama el servidor de base de datos (pg_cron + pg_net) cuando se dispara una alerta
 * automática de Gold/VIP. Avisa por SMS a los contactos de emergencia de la persona protegida.
 * Protegida con el secreto compartido CRON_SECRET (cabecera x-cron-secret).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { aE164, enviarSms } from '@/lib/emergencia/twilio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get('x-cron-secret') !== secreto) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let citaId: string | undefined;
  try {
    const body = await request.json();
    citaId = body?.cita_id;
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }
  if (!citaId) return NextResponse.json({ error: 'Falta cita_id' }, { status: 400 });

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // Marca atómica: solo el primer intento envía (evita SMS duplicados).
  const { data: cita } = await admin
    .from('citas')
    .update({ emergencia_sms_enviado: true })
    .eq('id', citaId)
    .eq('emergencia_automatica', true)
    .eq('emergencia_sms_enviado', false)
    .select('id, lugar, direccion, emergencia_auto_para')
    .maybeSingle();

  if (!cita) return NextResponse.json({ ok: true, enviados: 0, motivo: 'sin alerta nueva' });

  const protegidos: string[] = Array.isArray(cita.emergencia_auto_para) ? cita.emergencia_auto_para : [];
  let enviados = 0;
  const errores: string[] = [];

  for (const usuarioId of protegidos) {
    const [{ data: perfil }, { data: contactos }] = await Promise.all([
      admin.from('perfiles').select('alias').eq('id', usuarioId).maybeSingle(),
      admin.from('contactos_emergencia').select('pais_dial, telefono').eq('usuario_id', usuarioId),
    ]);

    const alias = perfil?.alias ?? 'Tu contacto';
    const lugar = `${cita.lugar ?? ''}${cita.direccion ? ` (${cita.direccion})` : ''}`.trim();
    const texto =
      `ALERTA Vela: ${alias} tenia una cita${lugar ? ` en ${lugar}` : ''} que debio terminar hace mas de 10 minutos ` +
      `y no se ha finalizado. Intenta comunicarte con esa persona ahora. Si no responde, busca ayuda.`;

    for (const c of contactos ?? []) {
      const numero = aE164(c.pais_dial, c.telefono);
      if (!numero) continue;
      const r = await enviarSms(numero, texto);
      if (r.ok) enviados += 1;
      else errores.push(r.error ?? 'error');
    }
  }

  if (errores.length > 0) console.error('SMS de emergencia automática con errores:', errores);
  return NextResponse.json({ ok: true, enviados, errores: errores.length });
}