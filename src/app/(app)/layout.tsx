import { Sidebar } from "@/components/Sidebar";
import { Toaster } from "@/components/Toaster";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-8 pb-16 pt-6">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
