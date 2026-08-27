import type { ReactNode } from "react";

export const bookingInputClassName = "h-12 w-full rounded-xl border border-[#d7e4e1] bg-white px-4 text-base font-semibold text-animeo-text outline-none transition placeholder:text-animeo-muted focus:border-animeo focus:ring-3 focus:ring-animeo/15";
export const bookingTextareaClassName = `${bookingInputClassName} h-auto min-h-28 resize-y py-3`;
export const bookingErrorInputClassName = "border-[#dba79b] focus:border-[#c2503f] focus:ring-[#c2503f]/15";

export function BookingField({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between gap-2 text-sm font-extrabold text-animeo-dark">
        <span>{label}{required ? <span className="ml-1 text-[#b65f43]">*</span> : null}</span>
        {error ? (
          <span className="flex items-center gap-1 text-xs font-bold text-[#c2503f]" role="alert">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
            {error}
          </span>
        ) : null}
      </span>
      {children}
      {hint && !error ? <span className="mt-1.5 block text-xs text-animeo-muted">{hint}</span> : null}
    </label>
  );
}

export function BookingActions({ onBack, nextLabel = "Continuer", nextDisabled = false, loading = false }: { onBack?: () => void; nextLabel?: string; nextDisabled?: boolean; loading?: boolean }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-7 flex gap-3 border-t border-[#e2ebe8] bg-white/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:justify-between sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
      {onBack ? <button type="button" onClick={onBack} disabled={loading} className="min-h-12 flex-1 rounded-[14px] border border-[#d2e0dd] px-5 py-3 text-sm font-extrabold text-animeo-dark disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none">Retour</button> : <span className="hidden sm:block" />}
      <button type="submit" disabled={nextDisabled || loading} className="flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-[14px] bg-animeo px-6 py-3 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(79,175,159,0.2)] transition hover:bg-[#459e90] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70 sm:flex-none">
        {loading ? <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/35 border-t-white" /> : null}
        {nextLabel}
      </button>
    </div>
  );
}

export function StepHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className="mb-6">
      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-animeo">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-black leading-tight text-animeo-dark sm:text-3xl">{title}</h2>
      {description ? <p className="mt-2 text-sm leading-6 text-animeo-muted sm:text-base">{description}</p> : null}
    </div>
  );
}
