import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocumentEditorView } from "@/components/documents/document-editor-view";
import { getDocument } from "@/lib/documents-actions";
import { requireUser } from "@/lib/auth/dal";

type DocumentPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: DocumentPageProps): Promise<Metadata> {
  const { id } = await params;
  const document = await getDocument(id);
  return { title: document ? document.title : "Document introuvable" };
}

export default async function DocumentPage({ params }: DocumentPageProps) {
  await requireUser();
  const { id } = await params;
  const document = await getDocument(id);

  if (!document) notFound();

  return <DocumentEditorView document={document} />;
}
