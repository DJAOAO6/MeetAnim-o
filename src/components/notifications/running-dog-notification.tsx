"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { CalendarClock } from "lucide-react";
import { useAppointments } from "@/components/appointments/appointments-context";
import { notify } from "@/lib/notify";
import "./running-dog-notification.css";

/**
 * Notification signature de 1002 Pattes : quand une nouvelle demande de
 * rendez-vous arrive de la page de réservation, le teckel traverse le haut
 * de l'écran en tirant une banderole. Un clic sur la banderole ouvre la
 * demande.
 *
 * Source : les demandes en attente (statut « pending ») que le tableau de
 * bord relit déjà toutes les minutes (DashboardRealtimeRefresh) — la même
 * que la cloche. Aucun second mécanisme.
 *
 * Seules les demandes arrivées pendant la visite courent : celles déjà là au
 * chargement de la page, et celles que le professionnel crée lui-même, ne
 * déclenchent rien. Chaque demande ne court qu'une fois, une seule course à
 * la fois, les suivantes attendent leur tour.
 *
 * Désactivable sans toucher au code : NEXT_PUBLIC_RUNNING_DOG=off.
 */

export type DogNotification = {
  /** Seul type pour l'instant ; d'autres pourront suivre (rendez-vous confirmé, nouveau client…). */
  kind: "appointment_request";
  id: string;
  clientName?: string;
  animalName?: string;
  /** Jour de la demande, "YYYY-MM-DD". */
  date?: string;
  /** Heure de début, "HH:MM". */
  start?: string;
  /** Notification du mode de test : rien à ouvrir au clic. */
  test?: boolean;
};

const ENABLED = process.env.NEXT_PUBLIC_RUNNING_DOG !== "off";
const PAUSE_BETWEEN_RUNS_MS = 600;
const DOG_SRC = "/assets/1002pattes/dog-running.svg";

const dayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function whenLabel(request: DogNotification): string | null {
  if (!request.start) return null;
  const time = request.start.replace(":", "h");
  return request.date ? `${dayFormatter.format(new Date(`${request.date}T00:00:00Z`))} à ${time}` : time;
}

function detailsLabel(request: DogNotification): string {
  return [request.clientName, request.animalName, whenLabel(request)].filter(Boolean).join(" · ");
}

/** Événement que le bouton « Voir l'animation » des Paramètres envoie. */
export const DOG_PREVIEW_EVENT = "1002pattes:dog-preview";

export function RunningDogNotifications({ requests, enabled = true }: {
  requests: DogNotification[];
  /** Préférence du compte (Paramètres › Personnalisation). Éteinte, les demandes restent mémorisées : la rallumer ne rejoue pas les anciennes. */
  enabled?: boolean;
}) {
  const { appointments, openManager } = useAppointments();
  const [queue, setQueue] = useState<DogNotification[]>([]);
  const [active, setActive] = useState<DogNotification | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // Ce qui a déjà été vu : jamais deux courses pour une même demande.
  const seenIds = useRef<Set<string> | null>(null);

  const enqueue = useCallback((items: DogNotification[]) => {
    if (items.length) setQueue((current) => [...current, ...items]);
  }, []);

  // 1. Demandes relues depuis le serveur. Au premier passage, tout ce qui
  //    est là est considéré comme déjà connu : un rechargement de page ne
  //    fait courir personne.
  useEffect(() => {
    if (seenIds.current === null) {
      seenIds.current = new Set(requests.map((request) => request.id));
      return;
    }
    const seen = seenIds.current;
    const fresh = requests.filter((request) => !seen.has(request.id));
    for (const request of fresh) seen.add(request.id);
    if (ENABLED && enabled) enqueue(fresh);
  }, [requests, enqueue, enabled]);

  // 2. Rendez-vous créés dans cet écran (par le professionnel lui-même) :
  //    connus avant même que le serveur ne les renvoie, ils ne courent pas.
  //    Déclaré après l'effet 1 : quand une relecture apporte une vraie
  //    nouvelle demande, l'effet 1 la voit d'abord comme nouvelle.
  useEffect(() => {
    const seen = seenIds.current;
    if (!seen) return;
    for (const appointment of appointments) seen.add(appointment.id);
  }, [appointments]);

  // Une seule course à la fois ; la suivante après une courte pause.
  useEffect(() => {
    if (active || queue.length === 0) return;
    const timer = window.setTimeout(() => {
      const [next, ...rest] = queue;
      setQueue(rest);
      setActive(next);
      setAnnouncement(`Nouvelle demande de rendez-vous${detailsLabel(next) ? ` : ${detailsLabel(next)}` : ""}, à confirmer.`);
    }, PAUSE_BETWEEN_RUNS_MS);
    return () => window.clearTimeout(timer);
  }, [active, queue]);

  const finish = useCallback(() => setActive(null), []);

  function open(request: DogNotification) {
    if (request.test) {
      notify.info("Aperçu : aucune demande réelle à ouvrir.");
      return;
    }
    openManager(request.id);
  }

  // Aperçu depuis les Paramètres : une course de démonstration, que le
  // réglage soit allumé ou non — c'est justement pour choisir.
  useEffect(() => {
    const preview = () => enqueue(testNotifications(1));
    window.addEventListener(DOG_PREVIEW_EVENT, preview);
    return () => window.removeEventListener(DOG_PREVIEW_EVENT, preview);
  }, [enqueue]);

  // Mode de test, en développement seulement (voir DevTrigger).
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const trigger = (count = 1) => enqueue(testNotifications(count));
    (window as unknown as { __testDogNotification?: typeof trigger }).__testDogNotification = trigger;
    return () => {
      delete (window as unknown as { __testDogNotification?: typeof trigger }).__testDogNotification;
    };
  }, [enqueue]);

  if (!ENABLED) return null;

  return (
    <>
      {/* Annonce pour les lecteurs d'écran ; le chien, lui, est décoratif. */}
      <p aria-live="polite" className="sr-only">{announcement}</p>
      {active ? <Run key={active.id} request={active} onOpen={() => open(active)} onFinished={finish} /> : null}
      {process.env.NODE_ENV === "development" ? <DevTrigger onTest={(count) => enqueue(testNotifications(count))} /> : null}
    </>
  );
}

/** Une course : la couche, puis l'ensemble banderole + cordes + chien. */
function Run({ request, onOpen, onFinished }: { request: DogNotification; onOpen: () => void; onFinished: () => void }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const runnerRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<{ left: string; travel: number } | null>(null);

  // Mesuré une fois, au départ : largeur de la barre latérale (figée pour
  // toute la course) et distance à parcourir.
  useEffect(() => {
    const layer = layerRef.current;
    const runner = runnerRef.current;
    if (!layer || !runner) return;
    const left = getComputedStyle(document.body).getPropertyValue("--sidebar-width").trim() || "260px";
    setGeometry({ left, travel: layer.clientWidth + runner.offsetWidth });
  }, []);

  // Filet de sécurité : si la fin d'animation n'arrive jamais (onglet mis
  // en arrière-plan), la course se termine quand même.
  useEffect(() => {
    if (!geometry) return;
    // La plus longue des deux : course, ou fondu du mouvement réduit (6 s).
    const duration = parseFloat(getComputedStyle(layerRef.current!).getPropertyValue("--rdn-duration")) || 6.2;
    const timer = window.setTimeout(onFinished, (Math.max(duration, 6) + 1.5) * 1000);
    return () => window.clearTimeout(timer);
  }, [geometry, onFinished]);

  const details = detailsLabel(request);

  return (
    <div ref={layerRef} className="rdn-layer" style={{ "--rdn-left": geometry?.left } as CSSProperties} data-testid="running-dog-notification">
      <div
        ref={runnerRef}
        className="rdn-runner"
        // Invisible tant que la distance n'est pas mesurée : pas de faux départ.
        style={geometry ? ({ "--rdn-travel": `${geometry.travel}px` } as CSSProperties) : { visibility: "hidden", animation: "none" }}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) onFinished();
        }}
      >
        <button
          type="button"
          onClick={onOpen}
          title="Voir la demande"
          aria-label={`Nouvelle demande de rendez-vous${details ? ` : ${details}` : ""}, à confirmer. Voir la demande.`}
          className="rdn-banner group block rounded-[4px] text-left drop-shadow-[0_4px_10px_rgb(var(--theme-shadow-rgb)/0.14)] transition-[filter,translate] duration-200 hover:-translate-y-0.5 hover:drop-shadow-[0_8px_16px_rgb(var(--theme-shadow-rgb)/0.2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-animeo-dark"
        >
          <span className="rdn-fabric block bg-animeo-border p-px">
            <span className="rdn-fabric-inner flex items-center gap-3 bg-[#FFFaf3] py-2.5 pl-6 pr-4 sm:py-3 sm:pl-7 sm:pr-5">
              <span aria-hidden="true" className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-animeo-soft text-animeo-dark sm:flex">
                <CalendarClock className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block whitespace-nowrap text-[13px] font-black leading-tight text-animeo-dark sm:text-sm">
                  <span className="sm:hidden">Nouvelle demande</span>
                  <span className="hidden sm:inline">Nouvelle demande de rendez-vous</span>
                </span>
                {details ? <span className="mt-0.5 hidden max-w-[17rem] truncate text-xs font-semibold text-animeo-muted md:block">{details}</span> : null}
              </span>
              <span className="shrink-0 whitespace-nowrap rounded-full bg-animeo-warning-soft px-2.5 py-1 text-[11px] font-extrabold text-animeo-dark">À confirmer</span>
            </span>
          </span>
        </button>
        <svg aria-hidden="true" className="rdn-ropes" viewBox="0 0 40 40" fill="none">
          <path d="M0 11 Q22 14 40 21" stroke="#8A5A3B" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M0 29 Q22 26 40 22" stroke="#8A5A3B" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG animé par ses propres styles : next/image n'apporterait rien */}
        <img src={DOG_SRC} alt="" aria-hidden="true" className="rdn-dog" draggable={false} />
      </div>
    </div>
  );
}

/** Données de test (mode développement). */
function testNotifications(count: number): DogNotification[] {
  const samples = [
    { clientName: "Marie Dupont", animalName: "Nala", start: "15:30" },
    { clientName: "Pierre Martin", animalName: "Oslo", start: "10:00" },
    { clientName: "Julie Bernard", animalName: "Pixel", start: "17:45" },
  ];
  const stamp = Date.now();
  return Array.from({ length: count }, (_, index) => ({
    kind: "appointment_request" as const,
    id: `test-${stamp}-${index}`,
    test: true,
    ...samples[index % samples.length],
  }));
}

/**
 * « Tester notification chien » — développement uniquement, et jamais sous
 * un navigateur piloté (tests automatiques), où il pourrait recouvrir un
 * élément à cliquer. Aussi disponible dans la console :
 * `__testDogNotification(1)` ou `__testDogNotification(3)`.
 */
function DevTrigger({ onTest }: { onTest: (count: number) => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // Après l'hydratation : navigator n'existe pas côté serveur.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique d'une propriété du navigateur
    setVisible(!navigator.webdriver);
  }, []);
  if (!visible) return null;
  return (
    <div className="fixed bottom-24 left-3 z-[35] flex items-center gap-1 rounded-full border border-animeo-border bg-white/95 p-1 text-[11px] font-bold text-animeo-dark shadow-sm md:bottom-4 md:left-[calc(var(--sidebar-width,260px)+0.75rem)]">
      <span className="px-2 text-animeo-muted">Dév.</span>
      <button type="button" onClick={() => onTest(1)} className="rounded-full px-2.5 py-1 hover:bg-animeo-soft">Tester notification chien</button>
      <button type="button" onClick={() => onTest(3)} className="rounded-full px-2.5 py-1 hover:bg-animeo-soft">× 3</button>
    </div>
  );
}
