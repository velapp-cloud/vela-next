// Uso: node --env-file=.env.local scripts\crear-webhook-didit.mjs [url-opcional]
// Crea el destino del webhook en Didit e imprime el secreto (se muestra UNA sola vez). NO lo compartas.
const apiKey = process.env.DIDIT_API_KEY;
if (!apiKey) {
  console.error('Falta DIDIT_API_KEY en .env.local');
  process.exit(1);
}

const url = process.argv[2] ?? 'https://www.myvelapp.com/api/didit/webhook';

const res = await fetch('https://verification.didit.me/v3/webhook/destinations/', {
  method: 'POST',
  headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    label: 'Vela',
    url,
    webhook_version: 'v3',
    subscribed_events: ['status.updated'],
  }),
});

const data = await res.json().catch(() => null);
console.log('HTTP', res.status);
console.log(data?.secret_shared_key ? `SECRETO: ${data.secret_shared_key}` : JSON.stringify(data, null, 2));