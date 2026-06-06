import Sidebar from "@/components/Sidebar";
import { requireUser, isAdminRole } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isAdmin = isAdminRole(user.role);
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} isAdmin={isAdmin} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
