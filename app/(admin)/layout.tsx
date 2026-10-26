import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AdminNav from '@/components/AdminNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/login');
  }

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('es_admin')
    .eq('id', userData.user.id)
    .single();

  if (!perfil?.es_admin) {
    redirect('/explorar');
  }

  return (
    <div className="flex-1 flex flex-col">
      <AdminNav />
      {children}
    </div>
  );
}