import { AppHeader } from "@/components/domain/app-header";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-rule px-4 py-4 sm:px-6">
        <p className="mx-auto max-w-6xl text-micro text-ink-faint">
          Sfera Contester — judged in the Judge0 sandbox
        </p>
      </footer>
    </div>
  );
}
