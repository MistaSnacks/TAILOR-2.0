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
    <label className={"dropzone" + (busy ? " busy" : "")}>
      <span className="big">{busy ? "Uploading…" : "Drop your cloth here"}</span>
      <span className="hint">{busy ? "reading the bytes" : "PDF · DOCX · TXT · click or drop"}</span>
      <input type="file" multiple hidden onChange={(e) => onFiles(e.target.files)} />
    </label>
  );
}
