import type { ReactNode } from "react";

export const bookingInputClassName = "h-12 w-full rounded-2xl border border-[#d7e4e1] bg-[#f8fbfa] px-4 text-base font-semibold text-animeo-dark outline-none transition placeholder:text-[#9ba7ab] focus:border-animeo focus:bg-white";
export const bookingTextareaClassName = `${bookingInputClassName} h-auto min-h-28 resize-y py-3`;

export function BookingField({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-extrabold text-animeo-dark">{label}{required ? <span className="ml-1 text-[#b65f43]">*</span> : null}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-animeo-muted">{hint}</span> : null}
    </label>
  );
}

export function BookingActions({ onBack, nextLabel = "Continuer", nextDisabled = false }: { onBack?: () => void; nextLabel?: string; nextDisabled?: boolean }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-7 flex gap-3 border-t border-[#e2ebe8] bg-white/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:justify-between sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
      {onBack ? <button type="button" onClick={onBack} className="min-h-12 flex-1 rounded-2xl border border-[#d2e0dd] px-5 py-3 text-sm font-extrabold text-animeo-dark sm:flex-none">Retour</button> : <span className="hidden sm:block" />}
      <button type="submit" disabled={nextDisabled} className="min-h-12 flex-[2] rounded-2xl bg-animeo px-6 py-3 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(79,175,159,0.2)] transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none">{nextLabel}</button>
    </div>
  );
}

export function StepHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="mb-6"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-animeo">{eyebrow}</p><h2 className="mt-2 text-2xl font-black leading-tight text-animeo-dark sm:text-3xl">{title}</h2><p className="mt-2 text-sm leading-6 text-animeo-muted sm:text-base">{description}</p></div>;
}
