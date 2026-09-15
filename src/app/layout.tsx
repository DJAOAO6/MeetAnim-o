import type { Metadata, Viewport } from "next";
import {
  DM_Sans,
  Inter,
  Manrope,
  Nunito_Sans,
  Poppins,
  Montserrat,
  Roboto,
  Open_Sans,
  Lato,
  Work_Sans,
  Source_Sans_3,
  Merriweather,
  Playfair_Display,
  Libre_Baskerville,
  Cormorant_Garamond,
  Lora,
  PT_Serif,
  Oswald,
  Roboto_Condensed,
  Bebas_Neue,
} from "next/font/google";
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

// Bibliothèque de polices du Studio de documents (étape 17) — chargées ici
// via next/font/google (auto-hébergées, self-hosted), comme les 4 polices
// ci-dessus. Le fichier de police réel n'est téléchargé par le navigateur
// qu'au premier usage réel de sa variable CSS (voir studio-fonts.ts) : ça
// satisfait "ne charge pas tout au démarrage" sans système de chargement
// dynamique par nom arbitraire, hors périmètre de ce chantier (voir le
// plan). `weight` explicite uniquement pour les polices non variables
// (sans axe "wght" chez Google Fonts) — sinon la police variable par défaut.
const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], display: "swap" });
const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"], display: "swap" });
const openSans = Open_Sans({ variable: "--font-open-sans", subsets: ["latin"], display: "swap" });
const lato = Lato({ variable: "--font-lato", subsets: ["latin"], weight: ["400", "700", "900"], display: "swap" });
const workSans = Work_Sans({ variable: "--font-work-sans", subsets: ["latin"], display: "swap" });
const sourceSans3 = Source_Sans_3({ variable: "--font-source-sans-3", subsets: ["latin"], display: "swap" });
const merriweather = Merriweather({ variable: "--font-merriweather", subsets: ["latin"], display: "swap" });
const playfairDisplay = Playfair_Display({ variable: "--font-playfair-display", subsets: ["latin"], display: "swap" });
const libreBaskerville = Libre_Baskerville({ variable: "--font-libre-baskerville", subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const cormorantGaramond = Cormorant_Garamond({ variable: "--font-cormorant-garamond", subsets: ["latin"], display: "swap" });
const lora = Lora({ variable: "--font-lora", subsets: ["latin"], display: "swap" });
const ptSerif = PT_Serif({ variable: "--font-pt-serif", subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const oswald = Oswald({ variable: "--font-oswald", subsets: ["latin"], display: "swap" });
const robotoCondensed = Roboto_Condensed({ variable: "--font-roboto-condensed", subsets: ["latin"], display: "swap" });
const bebasNeue = Bebas_Neue({ variable: "--font-bebas-neue", subsets: ["latin"], weight: ["400"], display: "swap" });

const studioFontVariables = [
  poppins.variable,
  montserrat.variable,
  roboto.variable,
  openSans.variable,
  lato.variable,
  workSans.variable,
  sourceSans3.variable,
  merriweather.variable,
  playfairDisplay.variable,
  libreBaskerville.variable,
  cormorantGaramond.variable,
  lora.variable,
  ptSerif.variable,
  oswald.variable,
  robotoCondensed.variable,
  bebasNeue.variable,
].join(" ");

export const metadata: Metadata = {
  title: {
    default: "1002 Pattes",
    template: "%s · 1002 Pattes",
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
    <html lang="fr" className={`${nunitoSans.variable} ${inter.variable} ${dmSans.variable} ${manrope.variable} ${studioFontVariables} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
