import type { Metadata } from "next";
import type { ReactNode } from "react";
import AdminApp from "@/components/admin-app";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tiako dia Tiako — Espace admin",
  description: "Gérez les commandes, les produits et les accès de votre boutique.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AdminApp />
        {children}
      </body>
    </html>
  );
}
