"use client";

import { useState } from "react";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { updateManualAvailabilityAction } from "@/lib/business-profile-actions";
import { notify } from "@/lib/notify";

type Mode = "cabinet" | "home";

type DashboardAvailabilityControlsProps = {
  cabinetAvailable: boolean;
  homeAvailable: boolean;
};

/**
 * Ferme/rouvre réellement la réservation publique — persisté en base
 * (cabinetAvailable/homeAvailable sur BusinessProfile), revérifié côté
 * serveur par submitPublicBookingAction. Remplace l'ancienne version qui
 * n'écrivait qu'en localStorage : le badge changeait de couleur sur l'écran
 * de la praticienne sans le moindre effet sur ce que voyaient ses visiteurs
 * (AUDIT-PRODUIT-2026-08-30.md, finding P0 en tête).
 *
 * Version volontairement simple (bascule ouvert/fermé) plutôt que la
 * programmation de date/durée/réouverture automatique de l'ancienne
 * interface — la praticienne rouvre manuellement. Voir le rapport d'audit
 * pour la version plus riche si le besoin se confirme.
 */
export function DashboardAvailabilityControls({ cabinetAvailable, homeAvailable }: DashboardAvailabilityControlsProps) {
  const [cabinet, setCabinet] = useState(cabinetAvailable);
  const [home, setHome] = useState(homeAvailable);
  const [pendingClose, setPendingClose] = useState<Mode | null>(null);
  const [saving, setSaving] = useState(false);

  async function apply(nextCabinet: boolean, nextHome: boolean, successMessage: string) {
    setSaving(true);
    const result = await updateManualAvailabilityAction(nextCabinet, nextHome);
    setSaving(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    setCabinet(nextCabinet);
    setHome(nextHome);
    notify.success(successMessage);
  }

  function toggle(mode: Mode) {
    const isOpen = mode === "cabinet" ? cabinet : home;
    const label = mode === "cabinet" ? "Cabinet" : "Domicile";
    if (isOpen) {
      setPendingClose(mode);
      return;
    }
    void apply(mode === "cabinet" ? true : cabinet, mode === "home" ? true : home, `${label} rouvert aux réservations en ligne.`);
  }

  function confirmClose() {
    if (!pendingClose) return;
    const mode = pendingClose;
    const label = mode === "cabinet" ? "Cabinet" : "Domicile";
    setPendingClose(null);
    void apply(mode === "cabinet" ? false : cabinet, mode === "home" ? false : home, `${label} fermé aux réservations en ligne.`);
  }

  return (
    <>
      <section aria-label="Ouverture manuelle des réservations" className="mb-6 flex flex-wrap items-center gap-3">
        <AvailabilityBadge label="Cabinet" open={cabinet} disabled={saving} onClick={() => toggle("cabinet")} />
        <AvailabilityBadge label="Domicile" open={home} disabled={saving} onClick={() => toggle("home")} />
      </section>

      {pendingClose ? (
        <ConfirmModal
          title={`Fermer ${pendingClose === "cabinet" ? "Cabinet" : "Domicile"} aux réservations ?`}
          message={`Les visiteurs de votre page de réservation ne pourront plus prendre de rendez-vous ${pendingClose === "cabinet" ? "au cabinet" : "à domicile"} tant que vous ne rouvrez pas manuellement ce mode ici.`}
          confirmLabel="Fermer"
          onConfirm={confirmClose}
          onClose={() => setPendingClose(null)}
        />
      ) : null}
    </>
  );
}

function AvailabilityBadge({ label, open, disabled, onClick }: { label: string; open: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${open ? "Fermer" : "Rouvrir"} ${label} aux réservations en ligne`}
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-extrabold transition disabled:cursor-not-allowed disabled:opacity-60 ${open ? "border-[#cfe7e1] bg-white text-animeo-dark hover:bg-animeo-soft" : "border-[#d9dfdf] bg-[#eef1f1] text-animeo-muted hover:bg-white"}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${open ? "bg-animeo shadow-[0_0_0_4px_rgba(79,175,159,0.14)]" : "bg-[#E05D5D] shadow-[0_0_0_4px_rgba(224,93,93,0.14)]"}`} />
      {label} {open ? "ouvert" : "fermé"}
      <span aria-hidden="true" className="ml-1 text-xs opacity-60">{open ? "Fermer" : "Rouvrir"}</span>
    </button>
  );
}
