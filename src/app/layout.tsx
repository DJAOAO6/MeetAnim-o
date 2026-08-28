import type { Metadata, Viewport } from "next";
import { DM_Sans, Inter, Manrope, Nunito_Sans } from "next/font/google";
import "./globals.css";

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Animéo",
    template: "%s · Animéo",
  },
  description: "L’agenda intelligent des professionnels animaliers.",
};

// viewportFit: "cover" est nécessaire pour que env(safe-area-inset-*) (voir
// booking-ui.tsx, BookingActions) résolve à une vraie valeur sur iOS plutôt
// qu'à 0 — sans lui, le contenu ne s'étend jamais sous l'encoche/la barre
// système et les variables d'inset restent inertes.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${nunitoSans.variable} ${inter.variable} ${dmSans.variable} ${manrope.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
