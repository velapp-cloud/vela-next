import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import TabBar from '@/components/TabBar';
import ToastNotificaciones from '@/components/ToastNotificaciones';
import ToastMensajes from '@/components/ToastMensajes';
import BloqueoEmergencia from '@/components/BloqueoEmergencia';
import BloqueoEnCurso from '@/components/BloqueoEnCurso';
import BotonSeguridadFlotante from '@/components/BotonSeguridadFlotante';
import { PresenciaProvider } from '@/components/PresenciaProvider';
import { AccesoPlanProvider } from '@/lib/planes/accesoPlan';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/welcome');
  }

  const { data: perfil, error } = await supabase
    .from('perfiles')
    .select('cuenta_eliminada, es_admin, estado_verificacion, verificacion_notificada')
    .eq('id', userData.user.id)
    .single();

  if (error || !perfil) {
    redirect('/welcome');
  }

  if (perfil.cuenta_eliminada) {
    redirect('/reactivar-cuenta');
  }
  if (perfil.es_admin) {
    redirect('/admin/revision');
  }
  if (perfil.estado_verificacion === 'pendiente') {
    redirect('/pendiente');
  }
  // Una cuenta rechazada nunca entra a la app: siempre vuelve a la pantalla de resultado,
  // aunque ya la haya visto antes (verificacion_notificada = true).
  if (perfil.estado_verificacion === 'rechazado') {
    redirect('/verificacion-resultado?resultado=rechazada');
  }
  if (!perfil.verificacion_notificada) {
    redirect(
      `/verificacion-resultado?resultado=${perfil.estado_verificacion === 'aprobado' ? 'aprobada' : 'rechazada'}`
    );
  }

  return (
    <PresenciaProvider>
      <AccesoPlanProvider>
        {/* La pantalla se divide en dos partes que no se pisan:
            el contenido (con su propio scroll) y la barra de navegación.
            En celular la barra queda abajo; en computador, como menú lateral a la izquierda.
            La barra va primero en el código a propósito: así cualquier ventana emergente
            (fotos, perfiles, filtros) siempre se pinta POR ENCIMA de ella. */}
        <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
          <TabBar />
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <BloqueoEmergencia />
            <BloqueoEnCurso />
            <ToastNotificaciones />
            <ToastMensajes />
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
            <BotonSeguridadFlotante />
          </div>
        </div>
      </AccesoPlanProvider>
    </PresenciaProvider>
  );
}