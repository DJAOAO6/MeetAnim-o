import type { Metadata } from "next";
import { DocumentsList } from "@/components/documents/documents-list";
import { getDocuments, getDocumentTemplates } from "@/lib/documents-actions";
import { requireUser } from "@/lib/auth/dal";
import { ModuleClosed } from "@/components/modules/module-closed";
import { hasModule } from "@/lib/modules";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const moduleUser = await requireUser();
  if (!hasModule(moduleUser.modules, "DOCUMENTS")) return <ModuleClosed moduleKey="DOCUMENTS" />;
  const [documents, templates] = await Promise.all([getDocuments(), getDocumentTemplates()]);

  return <DocumentsList documents={documents} templates={templates} />;
}
