"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { inputClassName, textareaClassName } from "@/components/settings/settings-fields";
import type { AnimalType, AvailabilitySettings, ServiceSettings } from "@/data/settings";
import { updateAvailabilityAction, updateBusinessProfileAction, type BusinessProfileData } from "@/lib/business-profile-actions";
import { deleteServiceAction, saveServiceAction } from "@/lib/services-actions";
import { completeOnboardingAction } from "@/lib/onboarding-actions";
import { hasCabinet, PRACTICE_MODES, visitsHomes, type PracticeMode } from "@/lib/practice-mode";
import { slugProblem } from "@/lib/slug";

/**
 * Onboarding d'un cabinet qui vient d'ouvrir (multi-comptes, phase 4).
 *
 * Six écrans courts, dans l'ordre où les réponses dépendent les unes des
 * autres : la façon d'exercer d'abord — elle décide s'il faut une adresse de
 * cabinet, des tarifs à domicile, un écran « déplacements » —, le lien de
 * réservation en dernier, puisque c'est lui qui ouvre la page au public.
 *
 * Chaque écran est enregistré en passant au suivant, par les mêmes actions
 * que les Paramètres : rien n'est perdu si l'on s'arrête en route, et les
 * mêmes règles s'appliquent. Tout ce qui n'est pas indispensable pour ouvrir
 * la page (pauses multiples, zones, frais de déplacement, page publique
 * détaillée) reste dans les Paramètres, où l'on peut y revenir à tout moment.
 */

type StepId = "mode" | "profile" | "hours" | "services" | "travel" | "link";

const STEP_TITLES: Record<StepId, string> = {
  mode: "Votre façon d’exercer",
  profile: "Votre profil",
  hours: "Vos horaires",
  services: "Vos prestations",
  travel: "Vos déplacements",
  link: "Votre lien de réservation",
};

const ANIMALS: AnimalType[] = ["Chien", "Chat", "Cheval", "NAC", "Petit ruminant"];
const DURATIONS = [30, 45, 60, 75, 90];
const TRAVEL_BUFFERS = [0, 15, 30, 45, 60];

const appOrigin = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

const labelClassName = "mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted";

/**
 * Pendant la frappe : minuscules sans accent, et tout le reste devient un
 * tiret — sans retirer ceux de fin, qu'on est peut-être en train de taper.
 * La forme exacte est vérifiée à l'envoi.
 */
function typedSlug(value: string): string {
  return value.toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-/, "");
}

/** Les plages suivent la façon d'exercer : pas de créneau « cabinet » sans cabinet, ni « domicile » sans déplacement. */
function withModeFlags(availability: AvailabilitySettings, mode: PracticeMode): AvailabilitySettings {
  return {
    ...availability,
    days: availability.days.map((day) => ({ ...day, slots: day.slots.map((slot) => ({ ...slot, cabinet: hasCabinet(mode), home: visitsHomes(mode) })) })),
  };
}

export function OnboardingWizard({ initialProfile, initialAvailability, initialServices }: {
  initialProfile: BusinessProfileData;
  initialAvailability: AvailabilitySettings;
  initialServices: ServiceSettings[];
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [availability, setAvailability] = useState(initialAvailability);
  const [services, setServices] = useState(initialServices);
  const [stepIndex, setStepIndex] = useState(0);
  const [openedSlug, setOpenedSlug] = useState<string | null>(null);
  // Le mode coché sur le premier écran, avant même d'être enregistré : le
  // nombre d'étapes annoncé le suit aussitôt.
  const [chosenMode, setChosenMode] = useState(initialProfile.practiceMode);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const steps: StepId[] = ["mode", "profile", "hours", "services", ...(visitsHomes(chosenMode) ? ["travel" as const] : []), "link"];
  const step = steps[Math.min(stepIndex, steps.length - 1)];

  // Le titre de l'écran prend le focus à chaque changement : un lecteur
  // d'écran annonce où l'on est arrivé, et le clavier repart du haut.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [stepIndex]);

  const next = () => setStepIndex((index) => Math.min(index + 1, steps.length - 1));
  const back = () => setStepIndex((index) => Math.max(index - 1, 0));

  async function saveProfile(nextProfile: BusinessProfileData): Promise<string | null> {
    const result = await updateBusinessProfileAction(nextProfile);
    if (!result.ok) return result.error;
    setProfile(nextProfile);
    return null;
  }

  async function saveAvailability(nextAvailability: AvailabilitySettings): Promise<string | null> {
    // Aucun rendez-vous à protéger pendant l'onboarding : pas de contrôle de
    // conflits à confirmer.
    const result = await updateAvailabilityAction(nextAvailability, true);
    if (!result.ok) return result.error;
    setAvailability(nextAvailability);
    return null;
  }

  if (openedSlug) return <OnboardingDone slug={openedSlug} />;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-animeo-muted">Configuration de votre espace</p>
      <ol className="mt-3 flex gap-1.5" aria-label="Étapes">
        {steps.map((id, index) => (
          <li key={id} aria-current={id === step ? "step" : undefined} className={`h-1.5 flex-1 rounded-full ${index <= stepIndex ? "bg-animeo" : "bg-animeo-border"}`}>
            <span className="sr-only">{STEP_TITLES[id]}{index < stepIndex ? " (fait)" : ""}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm font-bold text-animeo-muted">Étape {stepIndex + 1} sur {steps.length}</p>
      <h1 ref={headingRef} tabIndex={-1} className="mt-1 text-2xl font-black text-animeo-dark outline-none">{STEP_TITLES[step]}</h1>

      <div className="mt-5">
        {step === "mode" ? (
          <ModeStep
            profile={{ ...profile, practiceMode: chosenMode }}
            onModeChange={setChosenMode}
            onSubmit={async (draft) => {
              const error = await saveProfile(draft);
              if (error) return error;
              // Les plages déjà réglées suivent le nouveau mode.
              return saveAvailability(withModeFlags(availability, draft.practiceMode));
            }}
            onDone={next}
          />
        ) : null}
        {step === "profile" ? <ProfileStep profile={profile} onSubmit={saveProfile} onBack={back} onDone={next} /> : null}
        {step === "hours" ? <HoursStep availability={availability} mode={profile.practiceMode} onSubmit={saveAvailability} onBack={back} onDone={next} /> : null}
        {step === "services" ? <ServicesStep services={services} mode={profile.practiceMode} onChange={setServices} onBack={back} onDone={next} /> : null}
        {step === "travel" ? (
          <TravelStep
            profile={profile}
            availability={availability}
            onSubmit={async (location, travelBuffer) => {
              const error = await saveProfile({ ...profile, location });
              if (error) return error;
              return saveAvailability({ ...availability, travelBuffer });
            }}
            onBack={back}
            onDone={next}
          />
        ) : null}
        {step === "link" ? <LinkStep profile={profile} onBack={back} onOpened={setOpenedSlug} /> : null}
      </div>
    </div>
  );
}

/**
 * Fin de l'onboarding. Affiché aussi par la page elle-même une fois le
 * cabinet configuré : l'enregistrement final rafraîchit la page, et
 * l'écran doit rester le même.
 */
export function OnboardingDone({ slug }: { slug: string }) {
  const url = `${appOrigin}/reserver/${slug}`;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => headingRef.current?.focus(), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Presse-papiers refusé par le navigateur : l'adresse reste affichée,
      // sélectionnable à la main.
    }
  }

  return (
    <Card className="mx-auto max-w-2xl p-5 sm:p-8">
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-black text-animeo-dark outline-none">Votre page de réservation est ouverte</h1>
      <p className="mt-2 text-sm text-animeo-muted">Vos clients peuvent prendre rendez-vous à cette adresse. Partagez-la sur votre site, vos réseaux, votre signature d’e-mail.</p>
      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-animeo-border-soft bg-animeo-bg p-3 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 break-all px-1 text-sm font-bold text-animeo-dark">{url}</p>
        <Button type="button" variant="secondary" size="sm" onClick={copy} className="shrink-0">{copied ? "Lien copié" : "Copier le lien"}</Button>
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link href="/dashboard" className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-animeo px-5 py-2.5 text-sm font-extrabold text-white hover:bg-animeo-hover sm:w-auto">Aller au tableau de bord</Link>
        <Link href={`/reserver/${slug}`} target="_blank" className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-animeo-border px-5 py-2.5 text-sm font-extrabold text-animeo-dark hover:bg-animeo-bg sm:w-auto">Voir ma page</Link>
      </div>
      <p className="mt-6 text-sm text-animeo-muted">
        Tout se modifie ensuite dans <Link href="/dashboard/parametres" className="font-bold text-animeo-dark underline">Paramètres</Link> : profil, horaires, pauses et fermetures, rappels de rendez-vous.
      </p>
    </Card>
  );
}

/** Cadre commun d'un écran : contenu, message d'erreur, boutons Précédent / Continuer. */
function StepForm({ children, error, pending, busy = false, onBack, submitLabel = "Continuer", onSubmit }: {
  children: ReactNode;
  error: string | null;
  /** L'écran s'enregistre : le bouton principal le dit. */
  pending: boolean;
  /** Autre chose est en cours dans l'écran (ajout d'une prestation) : on attend, sans rien annoncer. */
  busy?: boolean;
  onBack?: () => void;
  submitLabel?: string;
  onSubmit: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }
  const disabled = pending || busy;
  return (
    <form onSubmit={submit} noValidate>
      <Card className="space-y-5 p-5 sm:p-6">
        {children}
        {/* Dans le cadre, sous les champs : là où le regard se trouve. */}
        {error ? <p role="alert" className="rounded-xl bg-animeo-danger-soft px-4 py-3 text-sm font-bold text-animeo-error">{error}</p> : null}
      </Card>
      {/* Sur téléphone, l'action principale d'abord et en pleine largeur ;
          « Précédent » en dessous. Côte à côte à partir d'une tablette. */}
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {onBack ? <Button type="button" variant="secondary" onClick={onBack} disabled={disabled} className="w-full sm:w-auto">Précédent</Button> : <span className="hidden sm:block" />}
        <Button type="submit" disabled={disabled} className="w-full sm:w-auto">{pending ? "Enregistrement…" : submitLabel}</Button>
      </div>
    </form>
  );
}

/** Enregistre puis passe à la suite, ou affiche la raison du refus. */
function useStepSubmit(onDone: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<string | null>) {
    setError(null);
    startTransition(async () => {
      const failure = await action();
      if (failure) setError(failure);
      else onDone();
    });
  }
  return { error, setError, pending, run };
}

function ModeStep({ profile, onModeChange, onSubmit, onDone }: { profile: BusinessProfileData; onModeChange: (mode: PracticeMode) => void; onSubmit: (draft: BusinessProfileData) => Promise<string | null>; onDone: () => void }) {
  const [draft, setDraft] = useState(profile);
  const { error, setError, pending, run } = useStepSubmit(onDone);
  const cabinet = hasCabinet(draft.practiceMode);

  return (
    <StepForm
      error={error}
      pending={pending}
      onSubmit={() => {
        if (cabinet && !draft.address.trim()) return setError("Indiquez l’adresse du cabinet : elle figure sur votre page de réservation.");
        run(() => onSubmit(draft));
      }}
    >
      <fieldset>
        <legend className="mb-3 text-sm text-animeo-muted">Ce choix décide de ce que vos clients pourront réserver. Il se change à tout moment dans Paramètres.</legend>
        <div className="grid gap-3">
          {PRACTICE_MODES.map((mode) => (
            <label key={mode.value} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${draft.practiceMode === mode.value ? "border-animeo bg-animeo-soft" : "border-animeo-border hover:bg-animeo-bg"}`}>
              <input
                type="radio"
                name="practiceMode"
                value={mode.value}
                checked={draft.practiceMode === mode.value}
                onChange={() => {
                  setDraft((current) => ({ ...current, practiceMode: mode.value }));
                  onModeChange(mode.value);
                }}
                className="mt-1 h-4 w-4 accent-[var(--theme-brand)]"
              />
              <span>
                <span className="block font-extrabold text-animeo-dark">{mode.label}</span>
                <span className="block text-sm text-animeo-muted">{mode.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {cabinet ? (
        <div>
          <label htmlFor="onboarding-cabinet-address" className={labelClassName}>Adresse du cabinet</label>
          <AddressAutocomplete
            id="onboarding-cabinet-address"
            value={draft.address}
            required
            placeholder="12 rue des Lilas, 76000 Rouen"
            inputClassName={inputClassName}
            onQueryChange={(value) => setDraft((current) => ({ ...current, address: value }))}
            onSelect={(result) => setDraft((current) => ({ ...current, address: result.label, postalCode: result.postcode, city: result.city }))}
          />
          <p className="mt-1.5 text-xs text-animeo-muted">Affichée sur votre page de réservation.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-animeo-muted">Vos tournées et vos trajets partiront de votre point de départ. Il n’est <strong>jamais affiché</strong> à vos clients.</p>
          <div>
            <label htmlFor="onboarding-departure-label" className={labelClassName}>Nom du point de départ</label>
            <input id="onboarding-departure-label" value={draft.departureLabel ?? ""} onChange={(event) => setDraft((current) => ({ ...current, departureLabel: event.target.value || null }))} className={inputClassName} placeholder="Maison" />
          </div>
          <div>
            <label htmlFor="onboarding-departure-address" className={labelClassName}>Adresse du point de départ (facultatif)</label>
            <AddressAutocomplete
              id="onboarding-departure-address"
              value={draft.departureAddress ?? ""}
              inputClassName={inputClassName}
              onQueryChange={(value) => setDraft((current) => ({ ...current, departureAddress: value || null }))}
              onSelect={(result) => setDraft((current) => ({ ...current, departureAddress: result.label }))}
            />
          </div>
        </div>
      )}
    </StepForm>
  );
}

function ProfileStep({ profile, onSubmit, onBack, onDone }: { profile: BusinessProfileData; onSubmit: (draft: BusinessProfileData) => Promise<string | null>; onBack: () => void; onDone: () => void }) {
  const [draft, setDraft] = useState(profile);
  const { error, setError, pending, run } = useStepSubmit(onDone);
  const set = <K extends keyof BusinessProfileData>(key: K) => (value: BusinessProfileData[K]) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <StepForm
      error={error}
      pending={pending}
      onBack={onBack}
      onSubmit={() => {
        if (!draft.firstName.trim() || !draft.lastName.trim()) return setError("Indiquez votre prénom et votre nom.");
        if (!draft.profession.trim()) return setError("Indiquez votre métier : il apparaît sous votre nom sur la page de réservation.");
        if (!draft.company.trim()) return setError("Indiquez le nom de votre activité.");
        run(() => onSubmit({ ...draft, photo: draft.photo || `${draft.firstName.charAt(0)}${draft.lastName.charAt(0)}`.toLocaleUpperCase("fr-FR") }));
      }}
    >
      <p className="text-sm text-animeo-muted">Ce que vos clients verront en arrivant sur votre page.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="onboarding-first-name" label="Prénom" value={draft.firstName} onChange={set("firstName")} autoComplete="given-name" />
        <TextField id="onboarding-last-name" label="Nom" value={draft.lastName} onChange={set("lastName")} autoComplete="family-name" />
      </div>
      <TextField id="onboarding-profession" label="Métier" value={draft.profession} onChange={set("profession")} placeholder="Ostéopathe animalier, comportementaliste, toiletteur…" />
      <TextField id="onboarding-company" label="Nom de l’activité" value={draft.company} onChange={set("company")} autoComplete="organization" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="onboarding-phone" label="Téléphone (facultatif)" value={draft.phone} onChange={set("phone")} type="tel" autoComplete="tel" />
        <TextField id="onboarding-email" label="E-mail de contact" value={draft.email} onChange={set("email")} type="email" autoComplete="email" />
      </div>
      <div>
        <label htmlFor="onboarding-bio" className={labelClassName}>Présentation (facultatif)</label>
        <textarea id="onboarding-bio" value={draft.bio} onChange={(event) => set("bio")(event.target.value)} className={textareaClassName} placeholder="Votre approche, les animaux que vous accompagnez…" />
      </div>
    </StepForm>
  );
}

function TextField({ id, label, value, onChange, type = "text", placeholder, autoComplete }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClassName}>{label}</label>
      <input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} className={inputClassName} placeholder={placeholder} autoComplete={autoComplete} />
    </div>
  );
}

type DayDraft = { id: string; label: string; enabled: boolean; start: string; end: string };

function HoursStep({ availability, mode, onSubmit, onBack, onDone }: {
  availability: AvailabilitySettings;
  mode: PracticeMode;
  onSubmit: (next: AvailabilitySettings) => Promise<string | null>;
  onBack: () => void;
  onDone: () => void;
}) {
  const [days, setDays] = useState<DayDraft[]>(() => availability.days.map((day) => ({
    id: day.id,
    label: day.label,
    enabled: day.enabled && day.slots.length > 0,
    start: day.slots[0]?.start ?? "09:00",
    end: day.slots[day.slots.length - 1]?.end ?? "18:00",
  })));
  const [lunchBreak, setLunchBreak] = useState(() => availability.days.some((day) => day.enabled && day.slots.length > 1));
  const [duration, setDuration] = useState(availability.defaultAppointmentDuration);
  const { error, setError, pending, run } = useStepSubmit(onDone);

  function update(id: string, patch: Partial<DayDraft>) {
    setDays((current) => current.map((day) => (day.id === id ? { ...day, ...patch } : day)));
  }

  function submit() {
    const open = days.filter((day) => day.enabled);
    if (open.length === 0) return setError("Ouvrez au moins une journée.");
    const invalid = open.find((day) => !day.start || !day.end || day.start >= day.end);
    if (invalid) return setError(`${invalid.label} : l’heure de fin doit suivre l’heure de début.`);

    const flags = { cabinet: hasCabinet(mode), home: visitsHomes(mode) };
    const next: AvailabilitySettings = {
      ...availability,
      defaultAppointmentDuration: duration,
      days: days.map((day) => {
        if (!day.enabled) return { id: day.id, label: day.label, enabled: false, slots: [] };
        // Pause de 12 h à 14 h, seulement si elle tombe dans la journée.
        const splits = lunchBreak && day.start < "12:00" && day.end > "14:00";
        const slots = splits
          ? [{ id: `${day.id}-1`, start: day.start, end: "12:00", ...flags }, { id: `${day.id}-2`, start: "14:00", end: day.end, ...flags }]
          : [{ id: `${day.id}-1`, start: day.start, end: day.end, ...flags }];
        return { id: day.id, label: day.label, enabled: true, slots };
      }),
    };
    run(() => onSubmit(next));
  }

  return (
    <StepForm error={error} pending={pending} onBack={onBack} onSubmit={submit}>
      <p className="text-sm text-animeo-muted">Les créneaux proposés à vos clients. Plusieurs plages par jour, fermetures et congés se règlent ensuite dans Paramètres.</p>
      <ul className="divide-y divide-animeo-border-soft">
        {days.map((day) => (
          <li key={day.id} className="flex flex-wrap items-center gap-3 py-3">
            <label className="flex min-w-32 items-center gap-2 font-bold text-animeo-dark">
              <input type="checkbox" checked={day.enabled} onChange={(event) => update(day.id, { enabled: event.target.checked })} className="h-4 w-4 accent-[var(--theme-brand)]" />
              {day.label}
            </label>
            {day.enabled ? (
              <span className="flex items-center gap-2 text-sm text-animeo-muted">
                <input type="time" aria-label={`${day.label}, début`} value={day.start} onChange={(event) => update(day.id, { start: event.target.value })} className={`${inputClassName} w-32`} />
                à
                <input type="time" aria-label={`${day.label}, fin`} value={day.end} onChange={(event) => update(day.id, { end: event.target.value })} className={`${inputClassName} w-32`} />
              </span>
            ) : <span className="text-sm text-animeo-muted">Fermé</span>}
          </li>
        ))}
      </ul>
      <label className="flex items-center gap-2 text-sm font-bold text-animeo-dark">
        <input type="checkbox" checked={lunchBreak} onChange={(event) => setLunchBreak(event.target.checked)} className="h-4 w-4 accent-[var(--theme-brand)]" />
        Pause de 12 h à 14 h
      </label>
      <div>
        <label htmlFor="onboarding-duration" className={labelClassName}>Durée habituelle d’un rendez-vous</label>
        <select id="onboarding-duration" value={duration} onChange={(event) => setDuration(Number(event.target.value))} className={`${inputClassName} max-w-48`}>
          {DURATIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
        </select>
      </div>
    </StepForm>
  );
}

function ServicesStep({ services, mode, onChange, onBack, onDone }: {
  services: ServiceSettings[];
  mode: PracticeMode;
  onChange: (services: ServiceSettings[]) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const cabinet = hasCabinet(mode);
  const home = visitsHomes(mode);
  const emptyDraft = { name: "", duration: "60", animals: [] as AnimalType[], cabinetPrice: "", homePrice: "" };
  const [draft, setDraft] = useState(emptyDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [adding, startAdding] = useTransition();
  // Le formulaire est ouvert d'emblée tant qu'il n'y a rien ; ensuite, il se
  // replie : l'action attendue devient « Continuer ».
  const [formOpen, setFormOpen] = useState(services.length === 0);
  const { error, setError, pending, run } = useStepSubmit(onDone);

  function toggleAnimal(animal: AnimalType) {
    setDraft((current) => ({ ...current, animals: current.animals.includes(animal) ? current.animals.filter((item) => item !== animal) : [...current.animals, animal] }));
  }

  function add() {
    setFormError(null);
    const duration = Number(draft.duration);
    const cabinetPrice = Number(draft.cabinetPrice.replace(",", "."));
    const homePrice = Number(draft.homePrice.replace(",", "."));
    if (!draft.name.trim()) return setFormError("Donnez un nom à la prestation.");
    if (!Number.isFinite(duration) || duration < 5) return setFormError("Indiquez une durée en minutes.");
    if (draft.animals.length === 0) return setFormError("Cochez au moins une espèce.");
    if (cabinet && (!draft.cabinetPrice || !Number.isFinite(cabinetPrice) || cabinetPrice < 0)) return setFormError("Indiquez le tarif au cabinet.");
    if (home && (!draft.homePrice || !Number.isFinite(homePrice) || homePrice < 0)) return setFormError("Indiquez le tarif à domicile.");

    const service: ServiceSettings = {
      id: "",
      name: draft.name.trim(),
      description: "",
      duration,
      animals: draft.animals,
      cabinetEnabled: cabinet,
      cabinetPrice: cabinet ? cabinetPrice : 0,
      homeEnabled: home,
      homePrice: home ? homePrice : 0,
      travelFeesEnabled: false,
      travelFeeMode: "fixed",
      fixedTravelFee: 0,
      zoneFees: {},
      kilometricRate: 0,
      suggestedReminder: "Aucun",
      active: true,
      photoUrl: null,
    };
    startAdding(async () => {
      const result = await saveServiceAction(service);
      if (!result.ok) return setFormError(result.error);
      onChange([...services, result.service]);
      setDraft(emptyDraft);
      setFormOpen(false);
    });
  }

  function remove(id: string) {
    startAdding(async () => {
      const result = await deleteServiceAction(id);
      if (!result.ok) return setFormError(result.error);
      const remaining = services.filter((service) => service.id !== id);
      onChange(remaining);
      if (remaining.length === 0) setFormOpen(true);
    });
  }

  return (
    <StepForm
      error={error}
      pending={pending}
      busy={adding}
      onBack={onBack}
      onSubmit={() => {
        if (services.length === 0) return setError("Ajoutez au moins une prestation : c’est ce que vos clients réservent.");
        run(async () => null);
      }}
    >
      <p className="text-sm text-animeo-muted">Ce que vos clients pourront réserver. Description, photo, frais de déplacement et rappels se complètent dans Paramètres.</p>

      {services.length > 0 ? (
        <ul aria-label="Prestations ajoutées" className="divide-y divide-animeo-border-soft rounded-2xl border border-animeo-border-soft">
          {services.map((service) => (
            <li key={service.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block font-bold text-animeo-dark">{service.name}</span>
                <span className="block text-sm text-animeo-muted">
                  {service.duration} min · {service.animals.join(", ")}
                  {service.cabinetEnabled ? ` · ${service.cabinetPrice} € au cabinet` : ""}
                  {service.homeEnabled ? ` · ${service.homePrice} € à domicile` : ""}
                </span>
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(service.id)} disabled={adding} aria-label={`Retirer ${service.name}`}>Retirer</Button>
            </li>
          ))}
        </ul>
      ) : null}

      {formOpen ? (
      <div className="rounded-2xl border border-animeo-border-soft bg-animeo-bg p-4">
      <fieldset className="min-w-0 space-y-4">
        <legend className="mb-4 text-sm font-extrabold text-animeo-dark">{services.length === 0 ? "Votre première prestation" : "Nouvelle prestation"}</legend>
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <TextField id="onboarding-service-name" label="Nom" value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} placeholder="Séance d’ostéopathie" />
          <TextField id="onboarding-service-duration" label="Durée (min)" type="number" value={draft.duration} onChange={(value) => setDraft((current) => ({ ...current, duration: value }))} />
        </div>
        <fieldset>
          <legend className={labelClassName}>Espèces</legend>
          <div className="flex flex-wrap gap-2">
            {ANIMALS.map((animal) => (
              <label key={animal} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${draft.animals.includes(animal) ? "border-animeo bg-animeo-soft text-animeo-dark" : "border-animeo-border text-animeo-muted"}`}>
                <input type="checkbox" checked={draft.animals.includes(animal)} onChange={() => toggleAnimal(animal)} className="h-4 w-4 accent-[var(--theme-brand)]" />
                {animal}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          {cabinet ? <TextField id="onboarding-service-cabinet-price" label="Tarif au cabinet (€)" type="number" value={draft.cabinetPrice} onChange={(value) => setDraft((current) => ({ ...current, cabinetPrice: value }))} /> : null}
          {home ? <TextField id="onboarding-service-home-price" label="Tarif à domicile (€)" type="number" value={draft.homePrice} onChange={(value) => setDraft((current) => ({ ...current, homePrice: value }))} /> : null}
        </div>
        {formError ? <p role="alert" className="text-sm font-bold text-animeo-error">{formError}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={add} disabled={adding}>{adding ? "Ajout…" : "Ajouter la prestation"}</Button>
          {services.length > 0 ? <Button type="button" variant="ghost" onClick={() => { setFormOpen(false); setFormError(null); }} disabled={adding}>Annuler</Button> : null}
        </div>
      </fieldset>
      </div>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setFormOpen(true)} className="w-full sm:w-auto">Ajouter une autre prestation</Button>
      )}
    </StepForm>
  );
}

function TravelStep({ profile, availability, onSubmit, onBack, onDone }: {
  profile: BusinessProfileData;
  availability: AvailabilitySettings;
  onSubmit: (location: string, travelBuffer: number) => Promise<string | null>;
  onBack: () => void;
  onDone: () => void;
}) {
  const [location, setLocation] = useState(profile.location);
  const [travelBuffer, setTravelBuffer] = useState(TRAVEL_BUFFERS.includes(availability.travelBuffer) ? availability.travelBuffer : 30);
  const { error, pending, run } = useStepSubmit(onDone);

  return (
    <StepForm error={error} pending={pending} onBack={onBack} onSubmit={() => run(() => onSubmit(location.trim(), travelBuffer))}>
      <p className="text-sm text-animeo-muted">Pour que vos clients sachent si vous venez jusqu’à eux, et que l’agenda laisse le temps de la route.</p>
      <TextField id="onboarding-location" label="Secteur d’intervention" value={location} onChange={setLocation} placeholder="Rouen et 30 km autour" />
      <div>
        <label htmlFor="onboarding-travel-buffer" className={labelClassName}>Temps de route entre deux rendez-vous à domicile</label>
        <select id="onboarding-travel-buffer" value={travelBuffer} onChange={(event) => setTravelBuffer(Number(event.target.value))} className={`${inputClassName} max-w-48`}>
          {TRAVEL_BUFFERS.map((minutes) => <option key={minutes} value={minutes}>{minutes === 0 ? "Aucun" : `${minutes} minutes`}</option>)}
        </select>
      </div>
      <p className="text-sm text-animeo-muted">Les frais de déplacement se règlent ensuite sur chaque prestation, dans Prestations.</p>
    </StepForm>
  );
}

function LinkStep({ profile, onBack, onOpened }: { profile: BusinessProfileData; onBack: () => void; onOpened: (slug: string) => void }) {
  const [slug, setSlug] = useState(profile.slug);
  const { error, setError, pending, run } = useStepSubmit(() => onOpened(slug));

  return (
    <StepForm
      error={error}
      pending={pending}
      onBack={onBack}
      submitLabel="Ouvrir ma page de réservation"
      onSubmit={() => {
        const problem = slugProblem(slug);
        if (problem) return setError(problem);
        run(async () => {
          const result = await completeOnboardingAction(slug);
          return result.ok ? null : result.error;
        });
      }}
    >
      <p className="text-sm text-animeo-muted">L’adresse de votre page de réservation. Elle s’ouvre au public dès que vous validez.</p>
      <div>
        <label htmlFor="onboarding-slug" className={labelClassName}>Votre lien</label>
        <input id="onboarding-slug" value={slug} onChange={(event) => setSlug(typedSlug(event.target.value))} className={inputClassName} aria-describedby="onboarding-slug-preview onboarding-slug-hint" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        {/* L'adresse entière, telle que les clients la verront : le champ ne
            porte que la partie choisie, pour rester lisible sur téléphone. */}
        <p id="onboarding-slug-preview" className="mt-2 break-all text-sm font-bold text-animeo-dark">
          {appOrigin.replace(/^https?:\/\//, "")}/reserver/<span className="text-animeo">{slug || "…"}</span>
        </p>
        <p id="onboarding-slug-hint" className="mt-1.5 text-xs text-animeo-muted">Lettres minuscules, chiffres et tirets. Évitez d’en changer ensuite : les liens déjà partagés ne mèneraient plus nulle part.</p>
      </div>
    </StepForm>
  );
}
