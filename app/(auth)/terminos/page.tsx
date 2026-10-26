/**
 * app/(auth)/terminos/page.tsx
 * NOTA: este es un PLACEHOLDER — el contenido real de los Términos y
 * Condiciones debe revisarlo un abogado antes de publicarse, sobre
 * todo dado el posicionamiento legal que ya definiste para Vela.
 */
export default function Terminos() {
  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <h1 className="font-serif italic text-2xl text-vela-public mb-6">Términos y Condiciones</h1>
      <div className="bg-vela-amber-soft border border-vela-amber rounded-xl p-4 mb-6">
        <p className="text-sm text-vela-text-dim">
          ⚠️ Este texto es un marcador temporal. Reemplázalo con el contenido legal real,
          revisado por un abogado, antes de publicar la app.
        </p>
      </div>
      <div className="text-sm text-vela-text-dim space-y-4 leading-relaxed">
        <p>Al usar Vela, confirmas que eres mayor de 18 años y aceptas usar la plataforma de forma responsable y respetuosa hacia los demás usuarios.</p>
        <p>Vela exige verificación de identidad para todos los perfiles, y se reserva el derecho de suspender cuentas que violen estos términos.</p>
      </div>
    </main>
  );
}