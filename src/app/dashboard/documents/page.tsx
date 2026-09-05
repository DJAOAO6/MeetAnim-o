import type { Metadata } from "next";
import { DocumentsList } from "@/components/documents/documents-list";
import { getDocuments } from "@/lib/documents-actions";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage() {
  await requireUser();
  const documents = await getDocuments();

  return <DocumentsList documents={documents} />;
}
