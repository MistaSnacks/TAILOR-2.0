"use client";
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

export function ClothUploader() {
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const recordDocument = useMutation(api.documents.recordDocument);
  const [busy, setBusy] = useState(false);

  async function onFiles(files: FileList | null) {
    if (!files) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const url = await generateUploadUrl();
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const { storageId } = await res.json();
        await recordDocument({ filename: file.name, mimeType: file.type, storageId });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <label
      style={{
        display: "inline-block",
        padding: 12,
        border: "1px dashed #888",
        borderRadius: 8,
        cursor: "pointer",
        margin: "12px 0",
      }}
    >
      {busy ? "Uploading…" : "Drop or choose your cloth (PDF / DOCX / TXT)"}
      <input type="file" multiple hidden onChange={(e) => onFiles(e.target.files)} />
    </label>
  );
}
