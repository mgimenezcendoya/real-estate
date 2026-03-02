import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Realia Admin",
  description: "Panel de gestión para desarrolladoras inmobiliarias",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="flex h-screen overflow-hidden antialiased">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-transparent relative">
          <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] pointer-events-none mix-blend-overlay"></div>
          <div className="relative z-10 w-full h-full">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
