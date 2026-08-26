import { Card } from "@/components/ui/card";
import { auditActionLabels, type AuditLogEntry } from "@/data/admin";

export function AuditLogTab({ entries }: { entries: AuditLogEntry[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[#e5eeeb] px-5 py-4 sm:px-6">
        <h2 className="text-lg font-extrabold text-animeo-dark">Journal d’audit</h2>
        <p className="mt-0.5 text-sm text-animeo-muted">Les {entries.length} derniers événements de sécurité et d’accès aux fiches clients.</p>
      </div>

      {entries.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead className="bg-[#fbfdfc] text-[11px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Compte</th>
                <th className="px-5 py-3">Action</th>
                <th className="px-5 py-3">Détail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f0]">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-5 py-3 text-xs font-semibold text-animeo-muted">{new Date(entry.createdAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className="px-5 py-3 text-sm font-bold text-animeo-dark">{entry.userLabel}</td>
                  <td className="px-5 py-3 text-sm font-semibold text-animeo-dark">{auditActionLabels[entry.action] ?? entry.action}</td>
                  <td className="px-5 py-3 text-xs text-animeo-muted">{entry.entityType ? `${entry.entityType} · ${entry.entityId}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-6 py-10 text-center text-sm font-semibold text-animeo-muted">Aucun événement enregistré pour le moment.</p>
      )}
    </Card>
  );
}
