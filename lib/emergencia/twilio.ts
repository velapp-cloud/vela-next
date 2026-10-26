/**
 * lib/emergencia/twilio.ts
 * Envío de SMS con la API REST de Twilio (sin SDK). SOLO para usar en el servidor
 * (rutas /api). Variables de entorno necesarias en Vercel:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 *   y UNA de: TWILIO_MESSAGING_SERVICE_SID  o  TWILIO_FROM (número en formato +1555...)
 */

/** Convierte "+503", "503" y "7000-0000" en "+50370000000". Devuelve null si no hay dígitos. */
export function aE164(paisDial: string | null | undefined, telefono: string | null | undefined): string | null {
  const digitos = `${paisDial ?? ''}${telefono ?? ''}`.replace(/[^\d]/g, '');
  return digitos ? `+${digitos}` : null;
}

export async function enviarSms(para: string, texto: string): Promise<{ ok: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const servicio = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const desde = process.env.TWILIO_FROM;

  if (!sid || !token || (!servicio && !desde)) {
    return { ok: false, error: 'Faltan variables de Twilio en el servidor' };
  }

  const cuerpo = new URLSearchParams({ To: para, Body: texto });
  if (servicio) cuerpo.set('MessagingServiceSid', servicio);
  else cuerpo.set('From', desde as string);

  try {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: cuerpo.toString(),
    });
    if (!resp.ok) {
      const detalle = await resp.text();
      return { ok: false, error: `Twilio ${resp.status}: ${detalle.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de red con Twilio' };
  }
}