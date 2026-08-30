"use client";

import { useState, type FormEvent } from "react";
import { Field, ImagePicker, Toggle, inputClassName, textareaClassName } from "@/components/settings/settings-fields";
import { useModalFocusTrap } from "@/components/ui/use-modal-focus-trap";
import { useUnsavedChangesWarning } from "@/components/ui/use-unsaved-changes-warning";
import type { AnimalType, ServiceSettings } from "@/data/settings";
import { servicePhotoFor } from "@/data/service-photos";
import type { PublicAnimalType } from "@/data/public-booking";

type ServiceModalProps = {
  service?: ServiceSettings;
  zoneNames: string[];
  kilometricFeesEnabled: boolean;
  defaultDuration: number;
  saving: boolean;
  onClose: () => void;
  onSave: (service: ServiceSettings) => void;
};

const animals: AnimalType[] = ["Chien", "Chat", "Cheval", "NAC", "Petit ruminant"];
const standardDurations = [30, 45, 60, 90];

const emptyServiceBase: Omit<ServiceSettings, "duration"> = {
  id: "",
  name: "",
  description: "",
  animals: ["Chien"],
  cabinetEnabled: true,
  cabinetPrice: 60,
  homeEnabled: true,
  homePrice: 70,
  travelFeesEnabled: false,
  travelFeeMode: "fixed",
  fixedTravelFee: 10,
  zoneFees: { Rouen: 0, "Le Havre": 10, Dieppe: 15 },
  kilometricRate: 0.6,
  suggestedReminder: "6 mois",
  active: true,
  photoUrl: null,
};

export function ServiceModal({ service, zoneNames, kilometricFeesEnabled, defaultDuration, saving, onClose, onSave }: ServiceModalProps) {
  const [draft, setDraft] = useState<ServiceSettings>(service ?? { ...emptyServiceBase, duration: defaultDuration });
  const [durationMode, setDurationMode] = useState(standardDurations.includes(draft.duration) ? String(draft.duration) : "custom");
  const [exampleDistance, setExampleDistance] = useState(20);
  const [initialSnapshot] = useState(() => JSON.stringify(draft));
  const isDirty = JSON.stringify(draft) !== initialSnapshot;
  const { confirmDiscard } = useUnsavedChangesWarning(isDirty);
  function guardedClose() {
    if (confirmDiscard()) onClose();
  }
  const dialogRef = useModalFocusTrap<HTMLElement>(guardedClose);
  const zoneFee = draft.zoneFees["Le Havre"] ?? 0;
  const feeSelection = draft.travelFeesEnabled ? draft.travelFeeMode : "none";
  // On garde l'option visible si une prestation existante l'utilise déjà,
  // même si le réglage global a été désactivé depuis — pour ne pas afficher
  // un mode sélectionné qui n'existe plus dans la liste.
  const showKilometricOption = kilometricFeesEnabled || draft.travelFeeMode === "kilometric";
  const travelFee = !draft.travelFeesEnabled
    ? 0
    : draft.travelFeeMode === "fixed"
      ? draft.fixedTravelFee
      : draft.travelFeeMode === "zone"
        ? zoneFee
        : draft.kilometricRate * exampleDistance;
  const homeTotal = draft.homePrice + travelFee;

  function update<K extends keyof ServiceSettings>(key: K, value: ServiceSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((!draft.cabinetEnabled && !draft.homeEnabled) || draft.animals.length === 0) return;
    onSave(draft);
  }

  function updateFeeMode(value: "none" | ServiceSettings["travelFeeMode"]) {
    if (value === "none") {
      update("travelFeesEnabled", false);
      return;
    }
    setDraft((current) => ({ ...current, travelFeesEnabled: true, travelFeeMode: value }));
  }

  function toggleAnimal(animal: AnimalType) {
    update("animals", draft.animals.includes(animal) ? draft.animals.filter((item) => item !== animal) : [...draft.animals, animal]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102f37]/60 p-4 backdrop-blur-sm">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="service-dialog-title" className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-[18px] bg-white shadow-[0_24px_70px_rgba(12,39,47,0.3)] outline-none">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#e5eeeb] bg-gradient-to-r from-animeo-soft to-white p-5 sm:p-6">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-animeo">Configuration locale</p><h2 id="service-dialog-title" className="mt-1 text-2xl font-black text-animeo-dark">{service ? "Modifier la prestation" : "Nouvelle prestation"}</h2></div>
          <button type="button" onClick={guardedClose} aria-label="Fermer" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xl text-animeo-muted shadow-sm">×</button>
        </div>

        <form onSubmit={submit}>
          <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_300px] sm:p-6">
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Field label="Nom de la prestation"><input value={draft.name} onChange={(event) => update("name", event.target.value)} className={inputClassName} required /></Field></div>
                <div className="sm:col-span-2"><Field label="Description courte"><textarea value={draft.description} onChange={(event) => update("description", event.target.value)} className={textareaClassName} /></Field></div>
                <Field label="Durée">
                  <select value={durationMode} onChange={(event) => { setDurationMode(event.target.value); if (event.target.value !== "custom") update("duration", Number(event.target.value)); }} className={inputClassName}>
                    {standardDurations.map((duration) => <option key={duration} value={duration}>{duration} min</option>)}
                    <option value="custom">Valeur personnalisée</option>
                  </select>
                </Field>
                {durationMode === "custom" ? <Field label="Durée personnalisée"><input type="number" min="15" step="5" value={draft.duration} onChange={(event) => update("duration", Number(event.target.value))} className={inputClassName} /></Field> : <div />}
              </div>

              <ImagePicker
                label="Photo de la prestation"
                value={servicePhotoFor(draft.photoUrl, (draft.animals[0] ?? "Chien") as PublicAnimalType)}
                onChange={(value) => update("photoUrl", value)}
                shape="square"
              />

              <div>
                <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Types d’animaux concernés</p>
                <div className="flex flex-wrap gap-2">
                  {animals.map((animal) => <button key={animal} type="button" aria-pressed={draft.animals.includes(animal)} onClick={() => toggleAnimal(animal)} className={`rounded-xl px-4 py-2 text-sm font-extrabold ${draft.animals.includes(animal) ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-dark"}`}>{animal}</button>)}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-[#dfe9e6] p-4">
                  <Toggle checked={draft.cabinetEnabled} onChange={(value) => update("cabinetEnabled", value)} label={draft.cabinetEnabled ? "Cabinet activé" : "Cabinet désactivé"} />
                  {draft.cabinetEnabled ? <div className="mt-4"><Field label="Prix au cabinet"><PriceInput value={draft.cabinetPrice} onChange={(value) => update("cabinetPrice", value)} /></Field></div> : null}
                </div>
                <div className="rounded-2xl border border-[#dfe9e6] p-4">
                  <Toggle checked={draft.homeEnabled} onChange={(value) => update("homeEnabled", value)} label={draft.homeEnabled ? "Domicile activé" : "Domicile désactivé"} />
                  {draft.homeEnabled ? <div className="mt-4"><Field label="Prix à domicile"><PriceInput value={draft.homePrice} onChange={(value) => update("homePrice", value)} /></Field></div> : null}
                </div>
              </div>

              {draft.homeEnabled ? (
                <div className="rounded-2xl bg-animeo-bg p-4 sm:p-5">
                  <div>
                    <h3 className="font-black uppercase tracking-[0.08em] text-animeo-dark">Frais de déplacement</h3>
                    <p className="mt-1 text-xs text-animeo-muted">Choisissez le calcul appliqué à cette prestation à domicile.</p>
                  </div>
                  <div className="mt-5 space-y-4">
                    <Field label="Mode de calcul">
                      <select value={feeSelection} onChange={(event) => updateFeeMode(event.target.value as "none" | ServiceSettings["travelFeeMode"])} className={inputClassName}>
                        <option value="none">Aucun frais</option>
                        <option value="fixed">Montant fixe</option>
                        <option value="zone">Selon la zone</option>
                        {showKilometricOption ? <option value="kilometric">Frais kilométriques</option> : null}
                      </select>
                    </Field>

                    {feeSelection === "fixed" ? (
                      <Field label="Montant en €"><PriceInput value={draft.fixedTravelFee} onChange={(value) => update("fixedTravelFee", value)} /></Field>
                    ) : null}

                    {feeSelection === "zone" ? (
                      zoneNames.length > 0 ? (
                        <div className="grid gap-3 sm:grid-cols-3">
                          {zoneNames.map((zone) => <Field key={zone} label={zone}><PriceInput value={draft.zoneFees[zone] ?? 0} onChange={(value) => update("zoneFees", { ...draft.zoneFees, [zone]: value })} prefix="+" /></Field>)}
                        </div>
                      ) : (
                        <p className="rounded-xl bg-[#fff0eb] p-3 text-sm font-bold text-[#a9573b]">Aucune zone n’est configurée. Créez-en une dans Tournées avant d’utiliser ce mode de calcul.</p>
                      )
                    ) : null}

                    {feeSelection === "kilometric" ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Tarif par kilomètre">
                          <PriceInput value={draft.kilometricRate} onChange={(value) => update("kilometricRate", value)} step="0.01" unit="€/km" />
                        </Field>
                        <Field label="Distance de l’exemple" hint="La distance sera saisie manuellement dans la V1.">
                          <NumberInput value={exampleDistance} onChange={setExampleDistance} unit="km" />
                        </Field>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <Field label="Rappel conseillé"><select value={draft.suggestedReminder} onChange={(event) => update("suggestedReminder", event.target.value as ServiceSettings["suggestedReminder"])} className={inputClassName}><option>3 mois</option><option>6 mois</option><option>12 mois</option><option>Aucun</option></select></Field>
              {!draft.cabinetEnabled && !draft.homeEnabled ? <p className="rounded-xl bg-[#fff0eb] p-3 text-sm font-bold text-[#a9573b]">Activez au moins un mode de consultation.</p> : null}
              {draft.animals.length === 0 ? <p className="rounded-xl bg-[#fff0eb] p-3 text-sm font-bold text-[#a9573b]">Sélectionnez au moins une espèce.</p> : null}
            </div>

            <aside className="h-fit rounded-[18px] bg-animeo-dark p-5 text-white lg:sticky lg:top-28">
              <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#83d2c5]">Aperçu du prix client</p>
              <div className="mt-5 space-y-3 text-sm">
                <PriceLine label="Au cabinet" value={draft.cabinetEnabled ? formatEuro(draft.cabinetPrice) : "Non proposé"} />
                <PriceLine label="Consultation domicile" value={draft.homeEnabled ? formatEuro(draft.homePrice) : "Non proposé"} />
                {draft.homeEnabled && feeSelection === "kilometric" ? <PriceLine label="Distance" value={`${exampleDistance} km`} /> : null}
                {draft.homeEnabled && feeSelection === "kilometric" ? <PriceLine label="Tarif kilométrique" value={`${formatNumber(draft.kilometricRate, 2)} €/km`} /> : null}
                {draft.homeEnabled ? <PriceLine label="Frais de déplacement" value={travelFee > 0 ? `+${formatEuro(travelFee)}` : "Aucun"} /> : null}
              </div>
              <div className="my-4 h-px bg-white/15" />
              <PriceLine label="Total estimé" value={draft.homeEnabled ? formatEuro(homeTotal) : "—"} strong />
              {draft.travelFeeMode === "zone" && draft.travelFeesEnabled ? <p className="mt-3 text-xs text-white/60">Exemple calculé avec la zone Le Havre.</p> : null}
              {draft.travelFeeMode === "kilometric" && draft.travelFeesEnabled ? <p className="mt-3 text-xs leading-5 text-white/60">Simulation locale : aucune distance n’est calculée automatiquement.</p> : null}
            </aside>
          </div>

          <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-[#e5eeeb] bg-white p-5 sm:flex-row sm:justify-end sm:p-6">
            <button type="button" onClick={guardedClose} className="rounded-xl border border-[#d4e2df] px-5 py-2.5 text-sm font-extrabold text-animeo-dark">Annuler</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-animeo px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-70">{saving ? "Enregistrement…" : service ? "Enregistrer" : "Créer la prestation"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PriceInput({ value, onChange, prefix, step = "1", unit = "€" }: { value: number; onChange: (value: number) => void; prefix?: string; step?: string; unit?: string }) {
  return <div className="relative"><input type="number" min="0" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className={`${inputClassName} ${prefix ? "pl-8" : ""} ${unit.length > 1 ? "pr-16" : "pr-9"}`} />{prefix ? <span className="absolute left-3 top-3 text-sm font-black text-animeo-muted">{prefix}</span> : null}<span className="absolute right-3 top-3 text-sm font-black text-animeo-muted">{unit}</span></div>;
}

function NumberInput({ value, onChange, unit }: { value: number; onChange: (value: number) => void; unit: string }) {
  return <div className="relative"><input type="number" min="0" step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} className={`${inputClassName} pr-12`} /><span className="absolute right-3 top-3 text-sm font-black text-animeo-muted">{unit}</span></div>;
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: value % 1 === 0 ? 0 : maximumFractionDigits, maximumFractionDigits }).format(value);
}

function formatEuro(value: number) {
  return `${formatNumber(value, 2)} €`;
}

function PriceLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-3"><span className={strong ? "font-extrabold" : "text-white/70"}>{label}</span><span className={strong ? "text-xl font-black text-[#83d2c5]" : "font-black"}>{value}</span></div>;
}
