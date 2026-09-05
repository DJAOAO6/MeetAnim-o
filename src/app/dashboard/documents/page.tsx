import type { Metadata } from "next";
import { DocumentsList } from "@/components/documents/documents-list";
import { getDocuments, getDocumentTemplates } from "@/lib/documents-actions";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage() {
  await requireUser();
  const [documents, templates] = await Promise.all([getDocuments(), getDocumentTemplates()]);

  return <DocumentsList documents={documents} templates={templates} />;
}
