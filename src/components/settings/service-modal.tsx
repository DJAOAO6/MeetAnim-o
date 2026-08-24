"use client";

import { useState, type FormEvent } from "react";
import { Field, Toggle, inputClassName, textareaClassName } from "@/components/settings/settings-fields";
import { serviceZoneNames, type AnimalType, type ServiceSettings } from "@/data/settings";

type ServiceModalProps = {
  service?: ServiceSettings;
  onClose: () => void;
  onSave: (service: ServiceSettings) => void;
};

const animals: AnimalType[] = ["Chien", "Chat", "Cheval", "NAC"];
const standardDurations = [30, 45, 60, 90];

const emptyService: ServiceSettings = {
  id: "",
  name: "",
  description: "",
  duration: 60,
  animals: ["Chien"],
  cabinetEnabled: true,
  cabinetPrice: 60,
  homeEnabled: true,
  homePrice: 70,
  travelFeesEnabled: false,
  travelFeeMode: "fixed",
  fixedTravelFee: 10,
  zoneFees: { Rouen: 0, "Le Havre": 10, Dieppe: 15 },
  suggestedReminder: "6 mois",
  active: true,
};

export function ServiceModal({ service, onClose, onSave }: ServiceModalProps) {
  const [draft, setDraft] = useState<ServiceSettings>(service ?? emptyService);
  const [durationMode, setDurationMode] = useState(standardDurations.includes(draft.duration) ? String(draft.duration) : "custom");
  const zoneFee = draft.zoneFees["Le Havre"] ?? 0;
  const travelFee = draft.travelFeesEnabled ? (draft.travelFeeMode === "fixed" ? draft.fixedTravelFee : zoneFee) : 0;
  const homeTotal = draft.homePrice + travelFee;

  function update<K extends keyof ServiceSettings>(key: K, value: ServiceSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.cabinetEnabled && !draft.homeEnabled) return;
    onSave({ ...draft, id: draft.id || `service-${Date.now()}` });
  }

  function toggleAnimal(animal: AnimalType) {
    update("animals", draft.animals.includes(animal) ? draft.animals.filter((item) => item !== animal) : [...draft.animals, animal]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102f37]/60 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="service-dialog-title" className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-[0_24px_70px_rgba(12,39,47,0.3)]">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#e5eeeb] bg-gradient-to-r from-animeo-soft to-white p-5 sm:p-6">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-animeo">Configuration locale</p><h2 id="service-dialog-title" className="mt-1 text-2xl font-black text-animeo-dark">{service ? "Modifier la prestation" : "Nouvelle prestation"}</h2></div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xl text-animeo-muted shadow-sm">×</button>
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

              <div>
                <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Types d’animaux concernés</p>
                <div className="flex flex-wrap gap-2">
                  {animals.map((animal) => <button key={animal} type="button" aria-pressed={draft.animals.includes(animal)} onClick={() => toggleAnimal(animal)} className={`rounded-xl px-4 py-2 text-sm font-extrabold ${draft.animals.includes(animal) ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-dark"}`}>{animal}</button>)}
                </div>
                <p className="mt-2 text-xs text-animeo-muted">Les petits ruminants seront ajoutés en V2.</p>
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
                  <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black text-animeo-dark">Frais de déplacement</h3><p className="text-xs text-animeo-muted">Aucun calcul kilométrique en V1.</p></div><Toggle checked={draft.travelFeesEnabled} onChange={(value) => update("travelFeesEnabled", value)} label={draft.travelFeesEnabled ? "Activés" : "Désactivés"} /></div>
                  {draft.travelFeesEnabled ? (
                    <div className="mt-5 space-y-4">
                      <Field label="Mode de calcul"><select value={draft.travelFeeMode} onChange={(event) => update("travelFeeMode", event.target.value as ServiceSettings["travelFeeMode"])} className={inputClassName}><option value="fixed">Montant fixe</option><option value="zone">Selon la zone</option></select></Field>
                      {draft.travelFeeMode === "fixed" ? <Field label="Montant fixe"><PriceInput value={draft.fixedTravelFee} onChange={(value) => update("fixedTravelFee", value)} /></Field> : (
                        <div className="grid gap-3 sm:grid-cols-3">
                          {serviceZoneNames.map((zone) => <Field key={zone} label={zone}><PriceInput value={draft.zoneFees[zone] ?? 0} onChange={(value) => update("zoneFees", { ...draft.zoneFees, [zone]: value })} prefix="+" /></Field>)}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <Field label="Rappel conseillé"><select value={draft.suggestedReminder} onChange={(event) => update("suggestedReminder", event.target.value as ServiceSettings["suggestedReminder"])} className={inputClassName}><option>3 mois</option><option>6 mois</option><option>12 mois</option><option>Aucun</option></select></Field>
              {!draft.cabinetEnabled && !draft.homeEnabled ? <p className="rounded-xl bg-[#fff0eb] p-3 text-sm font-bold text-[#a9573b]">Activez au moins un mode de consultation.</p> : null}
            </div>

            <aside className="h-fit rounded-3xl bg-animeo-dark p-5 text-white lg:sticky lg:top-28">
              <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#83d2c5]">Aperçu du prix client</p>
              <div className="mt-5 space-y-3 text-sm">
                <PriceLine label="Au cabinet" value={draft.cabinetEnabled ? `${draft.cabinetPrice} €` : "Non proposé"} />
                <PriceLine label="À domicile" value={draft.homeEnabled ? `${draft.homePrice} €` : "Non proposé"} />
                {draft.homeEnabled ? <PriceLine label="Frais de déplacement" value={`+${travelFee} €`} /> : null}
              </div>
              <div className="my-4 h-px bg-white/15" />
              <PriceLine label="Total estimé à domicile" value={draft.homeEnabled ? `${homeTotal} €` : "—"} strong />
              {draft.travelFeeMode === "zone" && draft.travelFeesEnabled ? <p className="mt-3 text-xs text-white/60">Exemple calculé avec la zone Le Havre.</p> : null}
            </aside>
          </div>

          <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-[#e5eeeb] bg-white p-5 sm:flex-row sm:justify-end sm:p-6">
            <button type="button" onClick={onClose} className="rounded-xl border border-[#d4e2df] px-5 py-2.5 text-sm font-extrabold text-animeo-dark">Annuler</button>
            <button type="submit" className="rounded-xl bg-animeo px-5 py-2.5 text-sm font-extrabold text-white">{service ? "Enregistrer" : "Créer la prestation"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PriceInput({ value, onChange, prefix }: { value: number; onChange: (value: number) => void; prefix?: string }) {
  return <div className="relative"><input type="number" min="0" step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} className={`${inputClassName} ${prefix ? "pl-8" : "pr-9"}`} />{prefix ? <span className="absolute left-3 top-3 text-sm font-black text-animeo-muted">{prefix}</span> : null}<span className="absolute right-3 top-3 text-sm font-black text-animeo-muted">€</span></div>;
}

function PriceLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-3"><span className={strong ? "font-extrabold" : "text-white/70"}>{label}</span><span className={strong ? "text-xl font-black text-[#83d2c5]" : "font-black"}>{value}</span></div>;
}
