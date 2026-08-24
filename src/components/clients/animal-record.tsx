import { Card } from "@/components/ui/card";
import type { Animal } from "@/data/clients";

type AnimalRecordProps = {
  animal: Animal;
};

export function AnimalRecord({ animal }: AnimalRecordProps) {
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-animeo-soft to-white p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className={`flex h-28 w-28 shrink-0 items-center justify-center rounded-3xl border-4 border-white bg-gradient-to-br text-6xl shadow-[0_8px_24px_rgba(24,59,69,0.1)] ${animal.avatarBackground}`} role="img" aria-label={`Photo fictive de ${animal.name}`}>
              {animal.avatar}
            </div>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-animeo">Fiche animal</p>
              <h2 className="mt-1 text-3xl font-black text-animeo-dark">{animal.name}</h2>
              <p className="mt-1 font-bold text-animeo-muted">{animal.species} · {animal.breed}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <AnimalInfo label="Âge" value={animal.age} />
                <AnimalInfo label="Poids" value={animal.weight} />
                <AnimalInfo label="Sexe" value={animal.sex} />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          <HealthInfo title="Antécédents" value={animal.history} />
          <HealthInfo title="Pathologies / sensibilités" value={animal.conditions} />
          <HealthInfo title="Traitements" value={animal.treatments} />
          <HealthInfo title="Notes" value={animal.notes} accent />
        </div>
      </Card>

      <ConsultationHistory animal={animal} />
    </div>
  );
}

function AnimalInfo({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-xl border border-white bg-white/80 px-3 py-2 text-xs shadow-sm">
      <strong className="text-animeo-muted">{label} :</strong>{" "}
      <span className="font-extrabold text-animeo-dark">{value}</span>
    </span>
  );
}

function HealthInfo({ title, value, accent = false }: { title: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-[#f1d89f] bg-[#fff9ec]" : "border-[#e2ece9] bg-animeo-bg"}`}>
      <h3 className={`text-xs font-extrabold uppercase tracking-[0.11em] ${accent ? "text-[#9a6a18]" : "text-animeo"}`}>{title}</h3>
      <p className="mt-2 text-sm font-semibold leading-relaxed text-animeo-dark">{value}</p>
    </div>
  );
}

function ConsultationHistory({ animal }: AnimalRecordProps) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[#e5eeeb] px-5 py-4 sm:px-6">
        <h2 className="text-lg font-extrabold text-animeo-dark">Historique des consultations</h2>
        <p className="mt-0.5 text-sm text-animeo-muted">Suivi propre à {animal.name}</p>
      </div>

      <div className="divide-y divide-[#edf2f0]">
        {animal.consultations.map((consultation) => (
          <article key={consultation.id} className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold text-animeo-dark">{consultation.date}</p>
                <p className="mt-1 font-extrabold text-animeo-dark">{consultation.service}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e4f5ef] px-2.5 py-1 text-[10px] font-black text-[#267668]">
                <span className="h-1.5 w-1.5 rounded-full bg-animeo" />
                {consultation.status}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${consultation.mode === "Cabinet" ? "bg-animeo-soft text-animeo-dark" : "bg-[#e8f1f4] text-[#315f6c]"}`}>
                {consultation.mode}
              </span>
              <span className="rounded-full bg-animeo-bg px-2.5 py-1 text-[10px] font-black text-animeo-dark">{consultation.price}</span>
            </div>

            <p className="mt-3 text-xs font-semibold leading-relaxed text-animeo-muted">{consultation.summary}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}
