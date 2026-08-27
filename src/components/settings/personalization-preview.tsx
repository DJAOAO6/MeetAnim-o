"use client";

import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { fontFamilyVars, type DashboardDisplayOptions } from "@/data/dashboard-theme";
import type { ProfileSettings, ServiceSettings } from "@/data/settings";

type PersonalizationPreviewProps = {
  profile: ProfileSettings;
  services: ServiceSettings[];
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  displayOptions: DashboardDisplayOptions;
};

export function PersonalizationPreview({ profile, services, primaryColor, secondaryColor, accentColor, displayOptions }: PersonalizationPreviewProps) {
  const photoIsImage = profile.photo.startsWith("data:image");
  const visibleServices = services.filter((service) => service.active).slice(0, 3);

  return (
    <div className="xl:sticky xl:top-6">
      <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Aperçu en temps réel</p>
      <p className="mb-4 text-xs text-animeo-muted">Voici un aperçu de vos personnalisations.</p>

      <div
        className="overflow-hidden rounded-[18px] border border-[#dfe9e6] bg-white shadow-[0_18px_50px_rgba(24,59,69,0.12)]"
        style={{ fontFamily: fontFamilyVars[displayOptions.fontFamily] }}
      >
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-black text-white" style={{ backgroundColor: primaryColor }}>
              {photoIsImage ? <Image src={profile.photo} alt="Portrait local" width={44} height={44} unoptimized className="h-full w-full object-cover" /> : profile.photo}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-animeo-dark">{profile.firstName} {profile.lastName}</p>
              <p className="truncate text-xs font-bold" style={{ color: secondaryColor }}>{profile.profession}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full px-3 py-2 text-xs font-extrabold text-white" style={{ backgroundColor: primaryColor }}>Prendre rendez-vous</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-animeo-bg text-animeo-dark"><Icon name="agenda" className="h-4 w-4" /></span>
          </div>
        </div>

        <div className="space-y-4 border-t border-[#eef2f1] p-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Votre prochaine consultation</p>
            <div className="mt-2 flex items-center gap-3 rounded-2xl bg-animeo-bg p-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-animeo-dark shadow-sm"><Icon name="paw" className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-animeo-dark">Luna</p>
                <p className="truncate text-xs text-animeo-muted">Golden Retriever</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs font-bold text-animeo-muted">
                  <span>Lundi 26 mai · 14:00 – 15:00</span>
                </p>
              </div>
              <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black text-white" style={{ backgroundColor: accentColor }}>À domicile</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Vos prestations</p>
            </div>
            {visibleServices.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {visibleServices.map((service) => (
                  <li key={service.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-animeo-dark">{service.name}</span>
                      <span className="block text-xs text-animeo-muted">{service.duration} min</span>
                    </span>
                    <span className="shrink-0 font-black text-animeo-dark">{Math.max(service.cabinetPrice, service.homePrice)} €</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-animeo-muted">Aucune prestation active pour le moment.</p>
            )}
            <Link href="/dashboard/prestations" className="mt-2 inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: primaryColor }}>
              Voir toutes les prestations
              <Icon name="arrow" className="h-3 w-3" />
            </Link>
          </div>

          <div className="rounded-2xl bg-animeo-bg p-3.5">
            <p className="text-sm font-extrabold text-animeo-dark">Présentation publique</p>
            <p className="mt-1 text-xs text-animeo-muted">Personnalisez l’apparence de votre page de réservation</p>
            <Link href={`/reserver/${profile.slug}`} target="_blank" className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-[#d9e5e2] bg-white px-4 py-2.5 text-xs font-extrabold" style={{ color: primaryColor }}>
              Voir ma page publique
              <Icon name="arrow" className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#e1eae8] bg-animeo-bg px-4 py-3.5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-animeo-muted"><Icon name="shield" className="h-3.5 w-3.5" /></span>
        <p className="text-xs leading-5 text-animeo-muted">
          Ces personnalisations s’appliquent uniquement à votre interface et à votre page de réservation. Les paramètres fonctionnels restent inchangés.
        </p>
      </div>
    </div>
  );
}
