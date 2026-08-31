import type { ReactNode } from "react";

export type SimulatedMapPoint = {
  id: string;
  x: number;
  y: number;
  label: string;
  title: string;
  accent?: "green" | "orange" | "purple";
};

type SimulatedMapProps = {
  points: SimulatedMapPoint[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  heightClassName?: string;
  overlay?: ReactNode;
  // Sur une carte compacte (ex. mini-carte du tableau de bord), les noms de
  // ville sont trop rapprochés des puces de rendez-vous et finissent tronqués
  // dessous — AUDIT_COMPLET.md P3-33. Les masquer en dessous de cette taille
  // plutôt que tenter un évitement de collision générique, hors de portée ici.
  showLabels?: boolean;
};

const accentStyles = {
  green: "bg-animeo text-white",
  orange: "bg-animeo-accent text-animeo-dark",
  purple: "bg-[#8067b0] text-white",
};

export function SimulatedMap({ points, selectedId, onSelect, heightClassName = "h-[500px]", overlay, showLabels = true }: SimulatedMapProps) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-[#dbe7e3] bg-[#edf4ef] ${heightClassName}`}>
      <div className="absolute inset-y-0 left-[18%] w-[9%] -rotate-6 bg-[#dcecf1] opacity-90" />
      <div className="absolute left-[-8%] top-[24%] h-3 w-[72%] rotate-12 rounded-full bg-white/90 shadow-sm" />
      <div className="absolute left-[32%] top-[55%] h-3 w-[78%] -rotate-12 rounded-full bg-white/90 shadow-sm" />
      <div className="absolute left-[50%] top-[-12%] h-[125%] w-2 rotate-[28deg] rounded-full bg-white/80" />
      <div className="absolute left-[72%] top-[8%] h-[95%] w-2 -rotate-[18deg] rounded-full bg-white/80" />
      <div className="absolute left-[8%] top-[68%] h-1.5 w-[85%] -rotate-3 rounded-full bg-[#d6e4dc]" />
      <div className="absolute left-[42%] top-[12%] h-1.5 w-[48%] rotate-[18deg] rounded-full bg-[#d6e4dc]" />

      {showLabels ? (
        <>
          <MapLabel label="Le Havre" x="10%" y="38%" />
          <MapLabel label="Dieppe" x="67%" y="10%" />
          <MapLabel label="Montivilliers" x="29%" y="25%" />
        </>
      ) : null}

      <div className="absolute left-3 top-3 z-20 rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted shadow-sm backdrop-blur-sm">
        Carte simulée · aucune donnée Mapbox
      </div>

      {points.map((point) => {
        const selected = point.id === selectedId;
        return (
          <button
            key={point.id}
            type="button"
            onClick={() => onSelect?.(point.id)}
            title={point.title}
            aria-label={point.title}
            className={`absolute z-20 flex h-9 min-w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white px-2 text-xs font-black shadow-[0_6px_15px_rgba(24,59,69,0.22)] transition hover:scale-110 ${accentStyles[point.accent ?? "green"]} ${selected ? "scale-110 ring-4 ring-white/80" : ""}`}
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
          >
            {point.label}
          </button>
        );
      })}

      {overlay ? <div className="absolute bottom-4 right-4 z-30 w-[min(300px,calc(100%-2rem))]">{overlay}</div> : null}
    </div>
  );
}

function MapLabel({ label, x, y }: { label: string; x: string; y: string }) {
  return <span className="absolute text-[10px] font-black uppercase tracking-[0.12em] text-[#8da09a]" style={{ left: x, top: y }}>{label}</span>;
}
