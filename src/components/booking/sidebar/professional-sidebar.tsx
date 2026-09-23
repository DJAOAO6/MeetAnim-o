"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { buildSingleStopMapsUrl } from "@/lib/tour-maps";
import { notify } from "@/lib/notify";
import type { PublicProfessional } from "@/data/public-booking";
import { DEFAULT_PUBLIC_SECTIONS, sectionDefinition, type PublicSection, type PublicSectionId } from "@/data/public-page";
import { hasCabinet, visitsHomes } from "@/lib/practice-mode";

const RealMap = dynamic(() => import("@/components/tours/real-map").then((mod) => mod.RealMap), {
  ssr: false,
  loading: () => <div className="flex h-40 items-center justify-center rounded-2xl border border-animeo-border bg-animeo-positive-soft text-xs font-bold text-animeo-muted">Chargement de la carte…</div>,
});

const ABOUT_TRUNCATE_LENGTH = 220;

/**
 * `tone` vient de l'éditeur de page : la carte habituelle, une teinte douce,
 * ou pas de fond du tout pour une section qui doit se fondre dans la page.
 */
function SidebarCard({ title, icon, tone = "surface", children }: { title: string; icon: Parameters<typeof Icon>[0]["name"]; tone?: PublicSection["tone"]; children: React.ReactNode }) {
  const toneClassName = tone === "soft" ? "bg-animeo-soft" : tone === "transparent" ? "border-transparent bg-transparent shadow-none" : "";
  return (
    <Card className={`p-5 ${toneClassName}`}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-animeo-dark">
        <Icon name={icon} className="h-4 w-4 text-animeo" aria-hidden="true" />
        {title}
      </h2>
      {children}
    </Card>
  );
}

function AboutCard({ professional, section }: { professional: PublicProfessional; section: PublicSection }) {
  const [expanded, setExpanded] = useState(false);
  const bio = professional.bio.trim();
  if (!bio) return null;
  const isLong = bio.length > ABOUT_TRUNCATE_LENGTH;
  const shown = expanded || !isLong ? bio : `${bio.slice(0, ABOUT_TRUNCATE_LENGTH).trimEnd()}…`;

  return (
    <SidebarCard title={section.title ?? "À propos"} icon="clients" tone={section.tone}>
      <p className="text-sm leading-6 text-animeo-muted">{shown}</p>
      {isLong ? (
        <button type="button" onClick={() => setExpanded((current) => !current)} className="mt-2 text-xs font-extrabold text-animeo hover:underline">
          {expanded ? "Afficher moins" : "Afficher plus"}
        </button>
      ) : null}
    </SidebarCard>
  );
}

function PracticalInfoCard({ professional, section }: { professional: PublicProfessional; section: PublicSection }) {
  const rows: { icon: Parameters<typeof Icon>[0]["name"]; text: string }[] = [];
  if (professional.showPhonePublicly && professional.phone.trim()) rows.push({ icon: "phone", text: professional.phone.trim() });
  if (professional.showPaymentsPublicly && professional.acceptedPayments?.trim()) rows.push({ icon: "euro", text: professional.acceptedPayments.trim() });
  // Ce qui est proposé aujourd'hui : la façon d'exercer (permanente),
  // moins ce qui est temporairement fermé.
  const offersCabinet = hasCabinet(professional.practiceMode) && professional.cabinetAvailable;
  const offersHome = visitsHomes(professional.practiceMode) && professional.homeAvailable;
  if (offersCabinet && offersHome) rows.push({ icon: "home", text: "Cabinet & à domicile" });
  else if (offersCabinet) rows.push({ icon: "home", text: "Cabinet uniquement" });
  else if (offersHome) rows.push({ icon: "car", text: "À domicile uniquement" });
  if (professional.showSocialsPublicly && (professional.website?.trim() || professional.facebook?.trim() || professional.instagram?.trim())) {
    const links = [professional.website, professional.facebook, professional.instagram].filter((link): link is string => Boolean(link?.trim()));
    for (const link of links) rows.push({ icon: "externalLink", text: link.trim().replace(/^https?:\/\//, "") });
  }

  if (rows.length === 0) return null;

  return (
    <SidebarCard title={section.title ?? "Infos pratiques"} icon="shield" tone={section.tone}>
      <ul className="space-y-2.5">
        {rows.map((row, index) => (
          <li key={index} className="flex items-start gap-2.5 text-sm font-semibold text-animeo-dark">
            <Icon name={row.icon} className="mt-0.5 h-4 w-4 shrink-0 text-animeo-muted" aria-hidden="true" />
            <span className="break-words">{row.text}</span>
          </li>
        ))}
      </ul>
    </SidebarCard>
  );
}

function CabinetAddressCard({ professional, section }: { professional: PublicProfessional; section: PublicSection }) {
  const [copied, setCopied] = useState(false);
  // Sans cabinet, il n'y a pas d'adresse à montrer : celle qui sert aux
  // tournées est privée (voir src/lib/practice-mode.ts).
  if (!hasCabinet(professional.practiceMode)) return null;
  if (!professional.cabinetAvailable || !professional.showAddressPublicly || !professional.cabinetAddress.trim()) return null;

  const coordinates = professional.cabinetLatitude != null && professional.cabinetLongitude != null
    ? { lat: professional.cabinetLatitude, lng: professional.cabinetLongitude }
    : null;
  const fullAddress = [professional.cabinetAddress, [professional.cabinetPostalCode, professional.cabinetCity].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(fullAddress);
      setCopied(true);
      notify.success("Adresse copiée");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      notify.error("Impossible de copier l’adresse.");
    }
  }

  return (
    <SidebarCard title={section.title ?? "Adresse du cabinet"} icon="map" tone={section.tone}>
      {professional.cabinetName?.trim() ? <p className="text-sm font-black text-animeo-dark">{professional.cabinetName}</p> : null}
      <p className="text-sm font-semibold text-animeo-dark">{professional.cabinetAddress}</p>
      <p className="text-sm text-animeo-muted">{[professional.cabinetPostalCode, professional.cabinetCity].filter(Boolean).join(" ")}</p>

      {professional.cabinetInstructions?.trim() ? <p className="mt-2 text-xs leading-5 text-animeo-muted">{professional.cabinetInstructions}</p> : null}
      {professional.parkingInformation?.trim() ? <p className="mt-1 text-xs leading-5 text-animeo-muted">🅿️ {professional.parkingInformation}</p> : null}
      {professional.accessibilityInformation?.trim() ? <p className="mt-1 text-xs leading-5 text-animeo-muted">♿ {professional.accessibilityInformation}</p> : null}

      {coordinates ? (
        <div className="mt-3 overflow-hidden rounded-2xl">
          <RealMap
            points={[{ id: "cabinet", lat: coordinates.lat, lng: coordinates.lng, label: professional.cabinetCity, title: professional.cabinetName || professional.company, color: professional.color }]}
            heightClassName="h-40"
          />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {coordinates ? (
          <a
            href={buildSingleStopMapsUrl(coordinates)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-animeo px-3 text-xs font-extrabold text-animeo transition hover:bg-animeo-soft"
          >
            <Icon name="navigation" className="h-3.5 w-3.5" aria-hidden="true" />
            Voir l’itinéraire
          </a>
        ) : null}
        <button
          type="button"
          onClick={copyAddress}
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-animeo-border px-3 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-bg"
        >
          <Icon name="copy" className="h-3.5 w-3.5" aria-hidden="true" />
          {copied ? "Adresse copiée ✓" : "Copier l’adresse"}
        </button>
      </div>
    </SidebarCard>
  );
}

function OpeningHoursCard({ professional, section }: { professional: PublicProfessional; section: PublicSection }) {
  if (!professional.showHoursPublicly || professional.openingHours.length === 0) return null;

  return (
    <SidebarCard title={section.title ?? "Horaires"} icon="calendar" tone={section.tone}>
      <ul className="space-y-1.5">
        {professional.openingHours.map((row) => (
          <li key={row.label} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-bold text-animeo-dark">{row.label}</span>
            <span className={row.hours ? "text-animeo-muted" : "font-semibold text-animeo-muted"}>{row.hours ?? "Fermé"}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-animeo-muted">Horaires susceptibles d’évoluer selon les disponibilités.</p>
    </SidebarCard>
  );
}

const cards: Partial<Record<PublicSectionId, (props: { professional: PublicProfessional; section: PublicSection }) => React.ReactNode>> = {
  about: AboutCard,
  practical: PracticalInfoCard,
  address: CabinetAddressCard,
  hours: OpeningHoursCard,
};

/**
 * L'ordre et la visibilité des cartes viennent de la page publiée composée
 * dans l'éditeur (`sections`). Sans configuration — profil qui n'a jamais
 * ouvert l'éditeur — on retombe sur l'ordre d'origine : rien ne change pour
 * qui n'a rien personnalisé.
 *
 * Les sections « en-tête » et « prestations » ne passent pas par ici : elles
 * sont rendues par la page elle-même, pas par cette colonne.
 */
export function ProfessionalSidebar({ professional, className = "", sections = DEFAULT_PUBLIC_SECTIONS }: { professional: PublicProfessional; className?: string; sections?: PublicSection[] }) {
  return (
    <aside className={`space-y-4 ${className}`}>
      {sections.map((section) => {
        const Card = cards[section.id];
        if (!Card || !section.visible || !sectionDefinition(section.id)) return null;
        return <Card key={section.id} professional={professional} section={section} />;
      })}
    </aside>
  );
}
