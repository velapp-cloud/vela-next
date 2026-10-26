import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Permite probar la app desde el celular en la misma red WiFi
  // (por ejemplo, para probar la instalacion como PWA) sin la
  // advertencia de "cross-origin request blocked". Si tu IP local
  // cambia (otra red, otro router), solo actualiza el valor aqui.
  allowedDevOrigins: ["192.168.1.5"],
};

export default nextConfig;
