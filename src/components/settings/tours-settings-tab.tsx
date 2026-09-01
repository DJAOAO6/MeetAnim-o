"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { Field, SectionTitle, Toggle, inputClassName } from "@/components/settings/settings-fields";
import { notify } from "@/lib/notify";
import { saveTourAction, toggleTourStatusAction } from "@/lib/tours-actions";
import { deleteSavedPlaceAction, updateTourPreferencesAction, upsertSavedPlaceAction } from "@/lib/tour-runs-actions";
import type { Tour, Zone } from "@/data/tours";
import type { SavedPlaceView, TourPreferencesView } from "@/lib/tour-runs";
import type { GeocodedAddress } from "@/data/geocoding";

type ToursSettingsTabProps = {
  initialTours: Tour[];
  zones: Zone[];
  initialSavedPlaces: SavedPlaceView[];
  initialPreferences: TourPreferencesView;
  cabinetAvailable: boolean;
};

export function ToursSettingsTab({ initialTours, zones, initialSavedPlaces, initialPreferences, cabinetAvailable }: ToursSettingsTabProps) {
  const [tours, setTours] = useState(initialTours);
  const [editingId, setEditingId] = useState<string | null>(null);

  function updateTour(id: string, key: keyof Tour, value: string) {
    setTours((current) => current.map((tour) => tour.id === id ? { ...tour, [key]: value } : tour));
  }

  async function commitEdit(tour: Tour) {
    const result = await saveTourAction({
      id: tour.id,
      name: tour.name,
      recurrence: tour.recurrence,
      day: tour.day,
      startTime: tour.startTime,
      endTime: tour.endTime,
      zoneId: tour.zoneId,
      status: tour.status,
    });
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    setTours((current) => current.map((item) => item.id === result.tour.id ? result.tour : item));
    notify.success("Tournée modifiée");
  }

  async function toggleStatus(tour: Tour) {
    const result = await toggleTourStatusAction(tour.id);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    setTours((current) => current.map((item) => item.id === result.tour.id ? result.tour : item));
    notify.success(result.tour.status === "Active" ? "Tournée activée" : "Tournée désactivée");
  }

  return (
    <div className="space-y-10">
      <div>
        <SectionTitle title="Réglages des tournées" description="Retrouvez ici les paramètres essentiels sans remplacer la page complète des tournées." action={<Link href="/dashboard/tournees" className="inline-flex rounded-xl bg-animeo px-4 py-2.5 text-sm font-extrabold text-white">Gérer toutes les tournées →</Link>} />
        <div className="space-y-4">
          {tours.map((tour) => {
            const zone = zones.find((item) => item.id === tour.zoneId);
            const editing = editingId === tour.id;
            return (
              <Card key={tour.id} className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${tour.status === "Active" ? "bg-[#e5f5ef] text-[#278064]" : "bg-[#eef1f1] text-animeo-muted"}`}>{tour.status}</span><span className="text-xs font-bold text-animeo-muted">{tour.recurrence}</span></div>
                    {!editing ? <><h3 className="text-lg font-black text-animeo-dark">{tour.name}</h3><p className="mt-1 text-sm text-animeo-muted">{zone?.name} · {tour.day} · {tour.startTime} – {tour.endTime}</p></> : (
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <Field label="Nom"><input value={tour.name} onChange={(event) => updateTour(tour.id, "name", event.target.value)} className={inputClassName} /></Field>
                        <Field label="Zone"><select value={tour.zoneId} onChange={(event) => updateTour(tour.id, "zoneId", event.target.value)} className={inputClassName}>{zones.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                        <Field label="Jour"><select value={tour.day} onChange={(event) => updateTour(tour.id, "day", event.target.value)} className={inputClassName}>{["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"].map((day) => <option key={day}>{day}</option>)}</select></Field>
                        <Field label="Début"><input type="time" value={tour.startTime} onChange={(event) => updateTour(tour.id, "startTime", event.target.value)} className={inputClassName} /></Field>
                        <Field label="Fin"><input type="time" value={tour.endTime} onChange={(event) => updateTour(tour.id, "endTime", event.target.value)} className={inputClassName} /></Field>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" onClick={() => { if (editing) { commitEdit(tour); } setEditingId(editing ? null : tour.id); }} className="rounded-xl bg-animeo-soft px-4 py-2.5 text-xs font-extrabold text-animeo-dark">{editing ? "Enregistrer" : "Modifier"}</button>
                    <button type="button" onClick={() => toggleStatus(tour)} className="rounded-xl bg-animeo-bg px-4 py-2.5 text-xs font-extrabold text-animeo-muted">{tour.status === "Active" ? "Désactiver" : "Activer"}</button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        <p className="mt-5 rounded-2xl bg-animeo-soft p-4 text-sm text-animeo-dark"><strong>Rappel :</strong> une zone regroupe des villes et codes postaux ; une tournée associe cette zone à un jour et des horaires.</p>
      </div>

      <SavedPlacesSection savedPlaces={initialSavedPlaces} />
      <TourPreferencesSection initialPreferences={initialPreferences} savedPlaces={initialSavedPlaces} cabinetAvailable={cabinetAvailable} />
    </div>
  );
}

const placeTypeLabels = { CABINET: "Cabinet", HOME: "Domicile", CLINIC: "Clinique", STABLE: "Écurie", OTHER: "Autre" } as const;

function SavedPlacesSection({ savedPlaces }: { savedPlaces: SavedPlaceView[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<keyof typeof placeTypeLabels>("OTHER");
  const [query, setQuery] = useState("");
  const [address, setAddress] = useState<GeocodedAddress | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!label.trim() || !address) return;
    setSaving(true);
    const result = await upsertSavedPlaceAction({ label: label.trim(), type, address: address.label, latitude: address.latitude, longitude: address.longitude });
    setSaving(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    notify.success("Lieu ajouté.");
    setLabel("");
    setQuery("");
    setAddress(null);
    setFormOpen(false);
    // Recharge les données serveur (nécessaire pour obtenir le vrai id du
    // lieu créé — indispensable pour pouvoir le supprimer ensuite).
    router.refresh();
  }

  async function handleDelete(id: string) {
    const result = await deleteSavedPlaceAction(id);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    notify.success("Lieu supprimé.");
    router.refresh();
  }

  return (
    <div>
      <SectionTitle title="Lieux favoris" description="Cabinet, domicile, clinique partenaire... utilisables comme départ ou arrivée d’une tournée." action={<button type="button" onClick={() => setFormOpen((current) => !current)} className="rounded-xl border border-animeo px-4 py-2.5 text-sm font-extrabold text-animeo transition hover:bg-animeo-soft">{formOpen ? "Annuler" : "+ Ajouter un lieu"}</button>} />

      {formOpen ? (
        <Card className="mb-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom"><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ex. Domicile" className={inputClassName} /></Field>
            <Field label="Type">
              <select value={type} onChange={(event) => setType(event.target.value as keyof typeof placeTypeLabels)} className={inputClassName}>
                {Object.entries(placeTypeLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Adresse">
                <AddressAutocomplete value={query} onQueryChange={(value) => { setQuery(value); setAddress(null); }} onSelect={setAddress} placeholder="Rechercher une adresse" inputClassName={inputClassName} />
              </Field>
            </div>
          </div>
          <button type="button" onClick={handleAdd} disabled={!label.trim() || !address || saving} className="mt-4 rounded-xl bg-animeo px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? "Ajout…" : "Ajouter"}
          </button>
        </Card>
      ) : null}

      {savedPlaces.length === 0 ? (
        <p className="text-sm text-animeo-muted">Aucun lieu favori pour l’instant.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {savedPlaces.map((place) => (
            <Card key={place.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm font-black text-animeo-dark">{place.label} <span className="ml-1 rounded-full bg-animeo-bg px-2 py-0.5 text-[10px] font-black text-animeo-muted">{(placeTypeLabels as Record<string, string>)[place.type] ?? place.type}</span></p>
                <p className="truncate text-xs font-semibold text-animeo-muted">{place.address}</p>
              </div>
              <button type="button" onClick={() => handleDelete(place.id)} className="shrink-0 rounded-lg px-3 py-2 text-xs font-extrabold text-[#a9573b] transition hover:bg-[#fff1ec]">Supprimer</button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TourPreferencesSection({ initialPreferences, savedPlaces, cabinetAvailable }: { initialPreferences: TourPreferencesView; savedPlaces: SavedPlaceView[]; cabinetAvailable: boolean }) {
  const [prefs, setPrefs] = useState(initialPreferences);
  const [saving, setSaving] = useState(false);

  async function save(next: TourPreferencesView) {
    setPrefs(next);
    setSaving(true);
    const result = await updateTourPreferencesAction({
      defaultStartType: next.defaultStartType as "CABINET" | "HOME" | "FAVORITE" | "CUSTOM" | "CURRENT_LOCATION" | "LAST_APPOINTMENT" | "SAME_AS_START",
      defaultStartSavedPlaceId: next.defaultStartSavedPlaceId,
      defaultEndType: next.defaultEndType as "CABINET" | "HOME" | "FAVORITE" | "CUSTOM" | "CURRENT_LOCATION" | "LAST_APPOINTMENT" | "SAME_AS_START",
      defaultEndSavedPlaceId: next.defaultEndSavedPlaceId,
      returnToStart: next.returnToStart,
      safetyBufferMinutes: next.safetyBufferMinutes,
      lunchBreakEnabled: next.lunchBreakEnabled,
      lunchBreakStart: next.lunchBreakStart,
      lunchBreakEnd: next.lunchBreakEnd,
      workHoursStart: next.workHoursStart,
      workHoursEnd: next.workHoursEnd,
      optimizationPreference: next.optimizationPreference as "TIME" | "DISTANCE" | "BALANCED",
      avoidTolls: next.avoidTolls,
      avoidHighways: next.avoidHighways,
      avoidFerries: next.avoidFerries,
    });
    setSaving(false);
    if (!result.ok) notify.error(result.error);
  }

  return (
    <div>
      <SectionTitle title="Éditeur de tournées — réglages par défaut" description="Valeurs de départ pour chaque nouvelle tournée — chaque tournée peut ensuite les modifier ponctuellement sans toucher à ces réglages." />
      <Card className="space-y-5 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Départ par défaut">
            <select value={prefs.defaultStartType} disabled={saving} onChange={(event) => save({ ...prefs, defaultStartType: event.target.value })} className={inputClassName}>
              {cabinetAvailable ? <option value="CABINET">Cabinet</option> : null}
              {savedPlaces.filter((place) => place.type === "HOME").map((place) => <option key={place.id} value={place.id}>{place.label}</option>)}
            </select>
          </Field>
          <Field label="Arrivée par défaut">
            <select value={prefs.defaultEndType} disabled={saving} onChange={(event) => save({ ...prefs, defaultEndType: event.target.value })} className={inputClassName}>
              {cabinetAvailable ? <option value="CABINET">Cabinet</option> : null}
              {savedPlaces.filter((place) => place.type === "HOME").map((place) => <option key={place.id} value={place.id}>{place.label}</option>)}
              <option value="SAME_AS_START">Même que le départ</option>
            </select>
          </Field>
        </div>

        <Toggle checked={prefs.returnToStart} onChange={(checked) => save({ ...prefs, returnToStart: checked })} label="Retour automatique au départ" disabled={saving} />

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Temps de sécurité entre RDV">
            <select value={prefs.safetyBufferMinutes} disabled={saving} onChange={(event) => save({ ...prefs, safetyBufferMinutes: Number(event.target.value) })} className={inputClassName}>
              {[0, 5, 10, 15, 20, 30].map((minutes) => <option key={minutes} value={minutes}>{minutes === 0 ? "Aucun" : `${minutes} min`}</option>)}
            </select>
          </Field>
          <Field label="Horaires de travail — début"><input type="time" value={prefs.workHoursStart} disabled={saving} onChange={(event) => save({ ...prefs, workHoursStart: event.target.value })} className={inputClassName} /></Field>
          <Field label="Horaires de travail — fin"><input type="time" value={prefs.workHoursEnd} disabled={saving} onChange={(event) => save({ ...prefs, workHoursEnd: event.target.value })} className={inputClassName} /></Field>
        </div>

        <div>
          <Toggle checked={prefs.lunchBreakEnabled} onChange={(checked) => save({ ...prefs, lunchBreakEnabled: checked })} label="Pause déjeuner" disabled={saving} />
          {prefs.lunchBreakEnabled ? (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Début"><input type="time" value={prefs.lunchBreakStart} disabled={saving} onChange={(event) => save({ ...prefs, lunchBreakStart: event.target.value })} className={inputClassName} /></Field>
              <Field label="Fin"><input type="time" value={prefs.lunchBreakEnd} disabled={saving} onChange={(event) => save({ ...prefs, lunchBreakEnd: event.target.value })} className={inputClassName} /></Field>
            </div>
          ) : null}
        </div>

        <Field label="Optimisation préférée">
          <select value={prefs.optimizationPreference} disabled={saving} onChange={(event) => save({ ...prefs, optimizationPreference: event.target.value })} className={inputClassName}>
            <option value="BALANCED">Équilibrée</option>
            <option value="TIME">Temps</option>
            <option value="DISTANCE">Distance</option>
          </select>
        </Field>

        <div className="flex flex-wrap gap-4">
          <Toggle checked={prefs.avoidTolls} onChange={(checked) => save({ ...prefs, avoidTolls: checked })} label="Éviter les péages" compact disabled={saving} />
          <Toggle checked={prefs.avoidHighways} onChange={(checked) => save({ ...prefs, avoidHighways: checked })} label="Éviter les autoroutes" compact disabled={saving} />
          <Toggle checked={prefs.avoidFerries} onChange={(checked) => save({ ...prefs, avoidFerries: checked })} label="Éviter les ferries" compact disabled={saving} />
        </div>
      </Card>
    </div>
  );
}
