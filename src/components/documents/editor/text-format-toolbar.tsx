"use client";

import type { Editor } from "@tiptap/react";
import { ColorPicker } from "@/components/documents/editor/color-picker";
import { FontPicker } from "@/components/documents/editor/font-picker";

export const TOOLBAR_HEIGHT = 38;

const FONT_SIZES = ["12px", "14px", "16px", "18px", "24px"];

/**
 * Barre de formatage flottante (étape 8) — affichée uniquement pendant
 * l'édition active d'un bloc de texte (voir EditableTextBlock dans
 * text-overlay.tsx), aux mêmes coordonnées non mises à l'échelle que la
 * surcouche. `onMouseDown` avec `preventDefault()` sur chaque contrôle :
 * un clic ne doit jamais voler le focus à l'éditeur Tiptap en dessous
 * (sinon `onBlur` sur EditorContent sortirait immédiatement du mode édition
 * à chaque clic sur un bouton de la barre).
 */
export function TextFormatToolbar({ editor, documentColors = [] }: { editor: Editor; documentColors?: string[] }) {
  function preventFocusSteal(event: React.MouseEvent) {
    event.preventDefault();
  }

  return (
    <div
      role="toolbar"
      aria-label="Mise en forme du texte"
      style={{ height: TOOLBAR_HEIGHT }}
      className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-1.5 shadow-sm"
    >
      <FontPicker value={(editor.getAttributes("textStyle").fontFamily as string | undefined) ?? ""} onChange={(cssVar) => editor.chain().focus().setFontFamily(cssVar).run()} />

      <Divider />

      <ToggleButton editor={editor} label="Gras" active={editor.isActive("bold")} onMouseDown={preventFocusSteal} onClick={() => editor.chain().focus().toggleBold().run()}>
        <span className="font-black">G</span>
      </ToggleButton>
      <ToggleButton editor={editor} label="Italique" active={editor.isActive("italic")} onMouseDown={preventFocusSteal} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <span className="italic">I</span>
      </ToggleButton>
      <ToggleButton editor={editor} label="Souligné" active={editor.isActive("underline")} onMouseDown={preventFocusSteal} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <span className="underline">S</span>
      </ToggleButton>
      <ToggleButton editor={editor} label="Barré" active={editor.isActive("strike")} onMouseDown={preventFocusSteal} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <span className="line-through">B</span>
      </ToggleButton>

      <Divider />

      <ToggleButton editor={editor} label="Liste à puces" active={editor.isActive("bulletList")} onMouseDown={preventFocusSteal} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <ListIcon ordered={false} />
      </ToggleButton>
      <ToggleButton editor={editor} label="Liste numérotée" active={editor.isActive("orderedList")} onMouseDown={preventFocusSteal} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListIcon ordered={true} />
      </ToggleButton>

      <Divider />

      <ToggleButton editor={editor} label="Aligner à gauche" active={editor.isActive({ textAlign: "left" })} onMouseDown={preventFocusSteal} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
        <AlignIcon variant="left" />
      </ToggleButton>
      <ToggleButton editor={editor} label="Centrer" active={editor.isActive({ textAlign: "center" })} onMouseDown={preventFocusSteal} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
        <AlignIcon variant="center" />
      </ToggleButton>
      <ToggleButton editor={editor} label="Aligner à droite" active={editor.isActive({ textAlign: "right" })} onMouseDown={preventFocusSteal} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
        <AlignIcon variant="right" />
      </ToggleButton>

      <Divider />

      <ColorPicker
        size="sm"
        label="Couleur du texte"
        value={(editor.getAttributes("textStyle").color as string | undefined) ?? "#183b45"}
        onChange={(color) => editor.chain().focus().setColor(color).run()}
        documentColors={documentColors}
      />

      <label className="flex items-center">
        <span className="sr-only">Taille du texte</span>
        <select
          onMouseDown={preventFocusSteal}
          defaultValue="14px"
          onChange={(event) => editor.chain().focus().setFontSize(event.target.value).run()}
          className="h-6 rounded border border-neutral-200 bg-white px-1 text-[11px] font-semibold text-neutral-700"
        >
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function ToggleButton({
  label,
  active,
  onMouseDown,
  onClick,
  children,
}: {
  editor: Editor;
  label: string;
  active: boolean;
  onMouseDown: (event: React.MouseEvent) => void;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onMouseDown={onMouseDown}
      onClick={onClick}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs transition ${active ? "bg-animeo-soft text-animeo-dark" : "text-neutral-600 hover:bg-neutral-100"}`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-neutral-200" />;
}

function ListIcon({ ordered }: { ordered: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-3.5 w-3.5">
      <path d="M9 6h11M9 12h11M9 18h11" />
      {ordered ? (
        <path d="M4.5 5.5v2M4.5 11.5v2M4.5 17.2v1.6M4 19h1" strokeWidth="1.4" />
      ) : (
        <>
          <circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}

function AlignIcon({ variant }: { variant: "left" | "center" | "right" }) {
  const lines = {
    left: ["M4 6h16", "M4 12h10", "M4 18h13"],
    center: ["M4 6h16", "M7 12h10", "M5.5 18h13"],
    right: ["M4 6h16", "M10 12h10", "M7 18h13"],
  }[variant];
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-3.5 w-3.5">
      {lines.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
