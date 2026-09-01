"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { buildSingleStopMapsUrl } from "@/lib/tour-maps";
import { notify } from "@/lib/notify";
import type { PublicProfessional } from "@/data/public-booking";

const RealMap = dynamic(() => import("@/components/tours/real-map").then((mod) => mod.RealMap), {
  ssr: false,
  loading: () => <div className="flex h-40 items-center justify-center rounded-2xl border border-[#dbe7e3] bg-[#edf4ef] text-xs font-bold text-animeo-muted">Chargement de la carte…</div>,
});

const ABOUT_TRUNCATE_LENGTH = 220;

function SidebarCard({ title, icon, children }: { title: string; icon: Parameters<typeof Icon>[0]["name"]; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-animeo-dark">
        <Icon name={icon} className="h-4 w-4 text-animeo" aria-hidden="true" />
        {title}
      </h2>
      {children}
    </Card>
  );
}

function AboutCard({ professional }: { professional: PublicProfessional }) {
  const [expanded, setExpanded] = useState(false);
  const bio = professional.bio.trim();
  if (!bio) return null;
  const isLong = bio.length > ABOUT_TRUNCATE_LENGTH;
  const shown = expanded || !isLong ? bio : `${bio.slice(0, ABOUT_TRUNCATE_LENGTH).trimEnd()}…`;

  return (
    <SidebarCard title="À propos" icon="clients">
      <p className="text-sm leading-6 text-animeo-muted">{shown}</p>
      {isLong ? (
        <button type="button" onClick={() => setExpanded((current) => !current)} className="mt-2 text-xs font-extrabold text-animeo hover:underline">
          {expanded ? "Afficher moins" : "Afficher plus"}
        </button>
      ) : null}
    </SidebarCard>
  );
}

function PracticalInfoCard({ professional }: { professional: PublicProfessional }) {
  const rows: { icon: Parameters<typeof Icon>[0]["name"]; text: string }[] = [];
  if (professional.showPhonePublicly && professional.phone.trim()) rows.push({ icon: "phone", text: professional.phone.trim() });
  if (professional.showPaymentsPublicly && professional.acceptedPayments?.trim()) rows.push({ icon: "euro", text: professional.acceptedPayments.trim() });
  if (professional.cabinetAvailable && professional.homeAvailable) rows.push({ icon: "home", text: "Cabinet & à domicile" });
  else if (professional.cabinetAvailable) rows.push({ icon: "home", text: "Cabinet uniquement" });
  else if (professional.homeAvailable) rows.push({ icon: "car", text: "À domicile uniquement" });
  if (professional.showSocialsPublicly && (professional.website?.trim() || professional.facebook?.trim() || professional.instagram?.trim())) {
    const links = [professional.website, professional.facebook, professional.instagram].filter((link): link is string => Boolean(link?.trim()));
    for (const link of links) rows.push({ icon: "externalLink", text: link.trim().replace(/^https?:\/\//, "") });
  }

  if (rows.length === 0) return null;

  return (
    <SidebarCard title="Infos pratiques" icon="shield">
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

function CabinetAddressCard({ professional }: { professional: PublicProfessional }) {
  const [copied, setCopied] = useState(false);
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
    <SidebarCard title="Adresse du cabinet" icon="map">
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
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#d9e5e2] px-3 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-bg"
        >
          <Icon name="copy" className="h-3.5 w-3.5" aria-hidden="true" />
          {copied ? "Adresse copiée ✓" : "Copier l’adresse"}
        </button>
      </div>
    </SidebarCard>
  );
}

function OpeningHoursCard({ professional }: { professional: PublicProfessional }) {
  if (!professional.showHoursPublicly || professional.openingHours.length === 0) return null;

  return (
    <SidebarCard title="Horaires" icon="calendar">
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

export function ProfessionalSidebar({ professional, className = "" }: { professional: PublicProfessional; className?: string }) {
  return (
    <aside className={`space-y-4 ${className}`}>
      <AboutCard professional={professional} />
      <PracticalInfoCard professional={professional} />
      <CabinetAddressCard professional={professional} />
      <OpeningHoursCard professional={professional} />
    </aside>
  );
}
