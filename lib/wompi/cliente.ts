/**
 * lib/wompi/cliente.ts
 * Conexión con Wompi El Salvador (solo servidor):
 *  - token OAuth (client credentials), reutilizado hasta que expire
 *  - crear enlace de pago
 *  - consultar una transacción (GET /TransaccionCompra/{id}): la verificación real del pago
 *  - validar la firma de un webhook (header wompi_hash = HMAC-SHA256 del cuerpo)
 */
import { createHmac, timingSafeEqual } from 'crypto';

const URL_TOKEN = 'https://id.wompi.sv/connect/token';
const URL_API = 'https://api.wompi.sv';

let tokenEnCache: { token: string; expiraEn: number } | null = null;

async function obtenerToken(): Promise<string> {
  const ahora = Date.now();
  if (tokenEnCache && tokenEnCache.expiraEn - 60_000 > ahora) return tokenEnCache.token;

  const clientId = process.env.WOMPI_CLIENT_ID;
  const secreto = process.env.WOMPI_API_SECRET;
  if (!clientId || !secreto) throw new Error('Faltan WOMPI_CLIENT_ID o WOMPI_API_SECRET en el servidor');

  const resp = await fetch(URL_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      audience: 'wompi_api',
      client_id: clientId,
      client_secret: secreto,
    }),
    cache: 'no-store',
  });
  const json = await resp.json().catch(() => ({} as any));
  if (!resp.ok || !json.access_token) {
    throw new Error(`Wompi no entregó token (HTTP ${resp.status})`);
  }
  tokenEnCache = {
    token: json.access_token as string,
    expiraEn: ahora + Number(json.expires_in ?? 3600) * 1000,
  };
  return tokenEnCache.token;
}

export type EnlaceCreado = { idEnlace: number; urlEnlace: string };

export async function crearEnlacePago(datos: {
  referencia: string;
  monto: number;
  nombreProducto: string;
  urlRedirect: string;
  urlWebhook: string;
}): Promise<EnlaceCreado> {
  const token = await obtenerToken();
  const resp = await fetch(`${URL_API}/EnlacePago`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      identificadorEnlaceComercio: datos.referencia,
      monto: datos.monto,
      nombreProducto: datos.nombreProducto,
      configuracion: {
        urlRedirect: datos.urlRedirect,
        urlWebhook: datos.urlWebhook,
      },
    }),
    cache: 'no-store',
  });
  const texto = await resp.text();
  if (!resp.ok) {
    throw new Error(`Wompi rechazó el enlace (HTTP ${resp.status}): ${texto.slice(0, 300)}`);
  }
  let json: any;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new Error('Wompi devolvió una respuesta que no se pudo leer');
  }
  if (!json.urlEnlace) throw new Error('Wompi no devolvió urlEnlace');
  return { idEnlace: Number(json.idEnlace), urlEnlace: String(json.urlEnlace) };
}

export type TransaccionWompi = { esReal: boolean; esAprobada: boolean; monto: number };

function esVerdadero(valor: unknown): boolean {
  return valor === true || valor === 'true' || valor === 'True';
}

/**
 * Consulta a Wompi el resultado de una transacción. Es la verificación autoritativa:
 * una transacción es exitosa si esReal y esAprobada son verdaderos y el monto coincide.
 */
export async function consultarTransaccion(idTransaccion: string): Promise<TransaccionWompi> {
  const token = await obtenerToken();
  const resp = await fetch(`${URL_API}/TransaccionCompra/${encodeURIComponent(idTransaccion)}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    cache: 'no-store',
  });
  const texto = await resp.text();
  if (!resp.ok) {
    throw new Error(`Wompi no pudo consultar la transacción (HTTP ${resp.status}): ${texto.slice(0, 200)}`);
  }
  let d: any;
  try {
    d = JSON.parse(texto);
  } catch {
    throw new Error('Wompi devolvió una transacción que no se pudo leer');
  }
  const monto = Number(d.monto ?? d.Monto ?? d.montoOriginal ?? d.MontoOriginal);
  if (!Number.isFinite(monto)) throw new Error('La transacción de Wompi no trae un monto válido');
  return {
    esReal: esVerdadero(d.esReal ?? d.EsReal),
    esAprobada: esVerdadero(d.esAprobada ?? d.EsAprobada),
    monto,
  };
}

function iguales(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * La firma es el HMAC-SHA256 del cuerpo EXACTO, con el API Secret como llave.
 * La documentación no dice si va en hexadecimal o base64: se aceptan ambos.
 * Hoy solo se registra (el pago se confirma consultando a Wompi, que no se puede falsear).
 */
export function validarFirmaWebhook(cuerpoCrudo: string, firmaRecibida: string | null): boolean {
  const secreto = process.env.WOMPI_API_SECRET;
  if (!secreto || !firmaRecibida) return false;
  const digest = createHmac('sha256', secreto).update(cuerpoCrudo, 'utf8').digest();
  const recibida = firmaRecibida.trim();
  return (
    iguales(digest.toString('hex'), recibida.toLowerCase()) ||
    iguales(digest.toString('base64'), recibida)
  );
}