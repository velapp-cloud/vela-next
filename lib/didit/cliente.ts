import crypto from 'crypto';

const BASE = 'https://verification.didit.me';

export type SesionDidit = { sessionId: string; url: string };

/** Crea una sesión de verificación hospedada por Didit. vendorData = id del perfil en Vela. */
export async function crearSesionDidit(vendorData: string, callback: string): Promise<SesionDidit> {
  const apiKey = process.env.DIDIT_API_KEY;
  const workflowId = process.env.DIDIT_WORKFLOW_ID;
  if (!apiKey || !workflowId) throw new Error('Faltan DIDIT_API_KEY o DIDIT_WORKFLOW_ID');

  const res = await fetch(`${BASE}/v3/session/`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ workflow_id: workflowId, vendor_data: vendorData, callback }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    throw new Error(`Didit respondió ${res.status}: ${JSON.stringify(data)?.slice(0, 200)}`);
  }
  const url: string | undefined = data.url ?? data.session_url;
  const sessionId: string | undefined = data.session_id;
  if (!url || !sessionId) throw new Error('Didit no devolvió url o session_id');
  return { sessionId, url };
}

function acortarFlotantes(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(acortarFlotantes);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, acortarFlotantes(x)]));
  }
  return v;
}

function ordenarLlaves(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenarLlaves);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.keys(o)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = ordenarLlaves(o[k]);
        return acc;
      }, {});
  }
  return v;
}

/** Verifica X-Signature-V2 (HMAC-SHA256 del JSON canónico) y que el timestamp tenga menos de 5 minutos. */
export function validarFirmaDidit(cuerpoCrudo: string, firma: string | null, timestamp: string | null): boolean {
  const secreto = process.env.DIDIT_WEBHOOK_SECRET;
  if (!secreto || !firma || !timestamp) return false;

  const ahora = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(ahora - ts) > 300) return false;

  let parseado: unknown;
  try {
    parseado = JSON.parse(cuerpoCrudo);
  } catch {
    return false;
  }
  const canonico = JSON.stringify(ordenarLlaves(acortarFlotantes(parseado)));
  const esperado = crypto.createHmac('sha256', secreto).update(canonico, 'utf8').digest('hex');

  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(firma, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}