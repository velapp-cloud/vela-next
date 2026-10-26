import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import TabBar from '@/components/TabBar';
import NotificacionesBell from '@/components/NotificacionesBell';
import ToastNotificaciones from '@/components/ToastNotificaciones';
import ToastMensajes from '@/components/ToastMensajes';
import BloqueoEmergencia from '@/components/BloqueoEmergencia';
import BloqueoEnCurso from '@/components/BloqueoEnCurso';
import { PresenciaProvider } from '@/components/PresenciaProvider';

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
      <div className="flex-1 flex flex-col md:flex-row">
        {/* En celular este contenedor "desaparece" (contents) y todo queda como antes.
            En computador es la columna de contenido al lado del menú lateral. */}
        <div className="contents md:flex md:flex-1 md:flex-col md:min-w-0">
          <div className="sticky top-0 z-40 flex justify-end px-4 pt-3 pb-2 bg-vela-bg/95 backdrop-blur">
            <NotificacionesBell />
          </div>
          {/* Los bloqueos van FUERA del header: el backdrop-blur del header
              atrapa a los elementos "fixed" y los dejaba encerrados ahí. */}
          <BloqueoEmergencia />
          <BloqueoEnCurso />
          <ToastNotificaciones />
          <ToastMensajes />
          <div className="flex-1 flex flex-col overflow-y-auto">{children}</div>
        </div>
        <TabBar />
      </div>
    </PresenciaProvider>
  );
}