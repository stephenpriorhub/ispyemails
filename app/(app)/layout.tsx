import Sidebar from "@/components/Sidebar";

// Auth handled client-side by hub-nav.js (oxfordhub.app/hub-nav.js)
// Server-side auth doesn't work across subdomains without .oxfordhub.app cookie domain
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={null} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
