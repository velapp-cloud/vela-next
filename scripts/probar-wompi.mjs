// scripts/probar-wompi.mjs
// Prueba la conexión con Wompi: pide un token y crea un enlace de pago de $0.01.
// No imprime el token ni el secret.
// Uso: node --env-file=.env.local scripts\probar-wompi.mjs

const clientId = process.env.WOMPI_CLIENT_ID;
const secret = process.env.WOMPI_API_SECRET;

if (!clientId || !secret) {
  console.log('Faltan WOMPI_CLIENT_ID o WOMPI_API_SECRET en .env.local');
  process.exit(1);
}

// 1) Token
const t = await fetch('https://id.wompi.sv/connect/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    audience: 'wompi_api',
    client_id: clientId,
    client_secret: secret,
  }),
});
console.log('1) Token -> HTTP', t.status);
const tj = await t.json().catch(() => ({}));
if (!t.ok || !tj.access_token) {
  console.log('   No se obtuvo token. Detalle:', tj.error ?? tj.error_description ?? 'sin detalle');
  process.exit(1);
}
console.log('   OK. Expira en', tj.expires_in, 'segundos');

// 2) Enlace de pago de prueba
const referencia = 'PRUEBA-' + Date.now();
const r = await fetch('https://api.wompi.sv/EnlacePago', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: 'Bearer ' + tj.access_token,
  },
  body: JSON.stringify({
    identificadorEnlaceComercio: referencia,
    monto: 0.01,
    nombreProducto: 'Prueba Vela',
    configuracion: {
      urlRedirect: 'https://www.myvelapp.com/planes',
      urlWebhook: 'https://www.myvelapp.com/api/wompi/webhook',
    },
  }),
});
console.log('2) Crear enlace de prueba -> HTTP', r.status);
const cuerpo = await r.text();
console.log(cuerpo.slice(0, 1500));