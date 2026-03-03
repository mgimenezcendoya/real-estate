import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import AuthLayout from "@/components/AuthLayout";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "Realia Admin",
  description: "Panel de gestión para desarrolladoras inmobiliarias",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="flex h-screen overflow-hidden antialiased">
        <TooltipProvider delayDuration={300}>
          <AuthProvider>
            <AuthLayout>{children}</AuthLayout>
          </AuthProvider>
        </TooltipProvider>
        <Toaster theme="light" position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
