"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Check, ChevronDown, Loader2, MapPin, PawPrint } from "lucide-react";
import { getSuggestedToursForAddressAction, type TourSuggestion } from "@/lib/tour-suggestions";

/** Un seul passage détaillé d'emblée ; les autres derrière un lien (§8). */
const VISIBLE_TOURS = 1;
/** Le temps de laisser finir une saisie d'adresse avant d'interroger le serveur (§17). */
const LOOKUP_DEBOUNCE_MS = 400;

type Chosen = { tourId: string; dateId: string; time: string } | null;

/**
 * Passages de tournée proposés pour l'adresse saisie.
 *
 * L'idée à faire passer tient en une phrase, et elle est écrite telle quelle
 * dans l'encart : *le professionnel sera déjà près de chez vous ce jour-là*.
 * Le visiteur n'a pas à comprendre ce qu'est une tournée, une zone ou une
 * occurrence — seulement qu'un créneau est plus simple à organiser qu'un
 * autre.
 *
 * Rien n'est imposé : la suggestion s'ignore, et le créneau déjà choisi reste
 * valable. C'est une recommandation, pas une condition.
 */
export function TourSuggestionPanel({ slug, zoneId, durationMinutes, dateId, time, onPick, onDismiss, onCountChange }: {
  /** Lien public du cabinet, qui désigne les tournées concernées. */
  slug: string;
  /** Zone déduite de l'adresse ; null tant qu'aucune zone ne correspond. */
  zoneId: string | null;
  durationMinutes: number;
  /** Créneau actuellement retenu, pour marquer celui qui vient d'une tournée. */
  dateId: string | null;
  time: string | null;
  onPick: (choice: { tourName: string; dateId: string; dateLabel: string; time: string }) => void;
  onDismiss: () => void;
  /** Nombre de passages proposés : l'étape masque son bandeau de secteur quand il y en a. */
  onCountChange: (count: number) => void;
}) {
  const [suggestions, setSuggestions] = useState<TourSuggestion[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Nouvelle adresse : la recherche repart, et les propositions précédentes
  // — qui décrivaient un autre secteur — disparaissent aussitôt (§10).
  const [lookedUpZone, setLookedUpZone] = useState<string | null>(zoneId);
  if (lookedUpZone !== zoneId) {
    setLookedUpZone(zoneId);
    setSuggestions(null);
    onCountChange(0);
    setExpanded(false);
    setDismissed(false);
  }

  useEffect(() => {
    if (!zoneId) return;

    let cancelled = false;
    const timeout = setTimeout(() => {
      getSuggestedToursForAddressAction(slug, { zoneId, durationMinutes })
        .then((result) => { if (!cancelled) { setSuggestions(result); onCountChange(result.length); } })
        // Une panne réseau ne doit jamais gêner la réservation : la suggestion
        // est un bonus, son absence se traduit par un silence (§12).
        .catch(() => { if (!cancelled) { setSuggestions([]); onCountChange(0); } });
    }, LOOKUP_DEBOUNCE_MS);

    return () => { cancelled = true; clearTimeout(timeout); };
  }, [slug, zoneId, durationMinutes, onCountChange]);

  if (!zoneId || dismissed) return null;

  // « En cours » se déduit de l'état plutôt que de se stocker : une zone
  // connue dont on n'a pas encore la réponse, c'est une recherche en cours.
  if (suggestions === null) {
    return (
      <p className="mt-4 flex items-center gap-2 rounded-2xl border border-animeo-border bg-animeo-bg px-4 py-3 text-sm font-bold text-animeo-muted">
        <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
        Recherche des passages prévus dans votre secteur…
      </p>
    );
  }

  // Aucun passage : rien ne s'affiche, et le parcours continue comme avant.
  if (!suggestions || suggestions.length === 0) return null;

  const shown = expanded ? suggestions : suggestions.slice(0, VISIBLE_TOURS);
  const hidden = suggestions.length - shown.length;
  const chosen: Chosen = dateId && time ? { tourId: "", dateId, time } : null;

  return (
    <section
      aria-labelledby="tour-suggestion-title"
      // Teinte d'accent distincte du formulaire : on doit voir d'un coup d'œil
      // que c'est une recommandation, pas un champ à remplir.
      className="mt-4 rounded-2xl border border-animeo-positive/35 bg-animeo-positive-soft/60 p-4 sm:p-5"
    >
      <p className="inline-flex items-center gap-2 rounded-full bg-animeo-positive px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.1em] text-white">
        <PawPrint aria-hidden="true" className="h-3.5 w-3.5" />
        Créneaux recommandés
      </p>

      <h3 id="tour-suggestion-title" className="mt-3 text-base font-black text-animeo-dark">
        Un passage est prévu près de chez vous
      </h3>
      <p className="mt-1 text-sm leading-6 text-animeo-dark/80">
        Le professionnel sera déjà présent dans votre secteur ce jour-là. Ces créneaux sont plus simples à organiser —
        vous restez libre de garder celui que vous avez choisi.
      </p>

      <div className="mt-4 grid gap-2">
        {shown.map((suggestion) => (
          <article key={suggestion.tourId} className="rounded-xl border border-animeo-border bg-white p-3.5">
            <header className="flex items-start gap-2.5">
              <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-animeo-positive" />
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-animeo-dark">{suggestion.tourName}</p>
                {suggestion.areaLabel ? <p className="truncate text-xs text-animeo-muted">Secteur : {suggestion.areaLabel}</p> : null}
              </div>
            </header>

            {suggestion.dates.map((date) => (
              <div key={date.dateId} className="mt-3">
                <p className="flex items-center gap-2 text-xs font-extrabold text-animeo-dark">
                  <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-animeo-muted" />
                  <span className="capitalize">{date.label}</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Créneaux du ${date.label}`}>
                  {date.slots.map((slot) => {
                    const selected = chosen?.dateId === date.dateId && chosen.time === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onPick({ tourName: suggestion.tourName, dateId: date.dateId, dateLabel: date.label, time: slot })}
                        className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-4 text-sm font-extrabold tabular-nums transition ${
                          selected
                            ? "border-animeo-positive bg-animeo-positive text-white"
                            : "border-animeo-border bg-white text-animeo-dark hover:border-animeo-positive"
                        }`}
                      >
                        {/* L'état retenu ne tient pas qu'à la couleur : une coche le dit aussi. */}
                        {selected ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : null}
                        {slot}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </article>
        ))}
      </div>

      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-extrabold text-animeo-positive underline-offset-2 hover:underline"
        >
          Voir les autres passages dans votre secteur ({hidden})
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => { setDismissed(true); onCountChange(0); onDismiss(); }}
        className="mt-3 block min-h-11 w-full rounded-xl border border-animeo-border bg-white/70 px-4 text-sm font-bold text-animeo-muted transition hover:text-animeo-dark sm:w-auto sm:px-5"
      >
        Ignorer la suggestion et garder mon créneau
      </button>
    </section>
  );
}
