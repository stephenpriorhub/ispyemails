import AppShell from "@/components/AppShell";

// Auth is now handled client-side via ClientAuthProvider.
// The browser fetches oxfordhub.app/api/me with credentials — this sends
// the OxfordHub session cookie automatically, even from ispy.oxfordhub.app.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
