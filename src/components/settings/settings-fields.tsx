import Image from "next/image";
import type { ChangeEvent, ReactNode } from "react";

export const inputClassName = "h-11 w-full rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3.5 text-sm font-semibold text-animeo-dark outline-none transition placeholder:text-[#9aa7ac] focus:border-animeo focus:bg-white";
export const textareaClassName = `${inputClassName} h-auto min-h-28 resize-y py-3`;

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-animeo-muted">{hint}</span> : null}
    </label>
  );
}

export function Toggle({ checked, onChange, label, compact = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; compact?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`inline-flex items-center gap-2 rounded-xl font-extrabold transition ${compact ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"} ${checked ? "bg-animeo-soft text-animeo-dark" : "bg-[#f0f3f3] text-animeo-muted"}`}>
      <span className={`relative inline-flex h-5 w-9 rounded-full transition ${checked ? "bg-animeo" : "bg-[#b8c2c5]"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

export function SectionTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-xl font-black text-animeo-dark">{title}</h2>
        {description ? <p className="mt-1 text-sm text-animeo-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function ImagePicker({ label, value, onChange, shape = "round" }: { label: string; value: string; onChange: (value: string) => void; shape?: "round" | "square" }) {
  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" && onChange(reader.result);
    reader.readAsDataURL(file);
  }

  const isImage = value.startsWith("data:image") || value.startsWith("http://") || value.startsWith("https://");

  return (
    <div className="flex items-center gap-4 rounded-2xl bg-animeo-bg p-4">
      <div className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden bg-animeo-soft text-lg font-black text-animeo-dark ${shape === "round" ? "rounded-full" : "rounded-2xl"}`}>
        {isImage ? <Image src={value} alt="Aperçu local" width={64} height={64} unoptimized className="h-full w-full object-cover" /> : value}
      </div>
      <div>
        <p className="text-sm font-extrabold text-animeo-dark">{label}</p>
        <p className="mb-2 text-xs text-animeo-muted">JPG ou PNG · aperçu local</p>
        <label className="inline-flex cursor-pointer rounded-xl border border-animeo px-3 py-2 text-xs font-extrabold text-animeo transition hover:bg-animeo-soft">
          Choisir une image
          <input type="file" accept="image/png,image/jpeg" onChange={handleFile} className="sr-only" />
        </label>
      </div>
    </div>
  );
}
