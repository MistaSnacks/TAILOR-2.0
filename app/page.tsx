"use client";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import { DocumentList } from "./components/DocumentList";

export default function Page() {
  const documents = useQuery(api.documents.list) ?? [];
  const create = useMutation(api.documents.create);
  const [filename, setFilename] = useState("");

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>TAILOR — your cloth</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!filename.trim()) return;
          await create({ filename, mimeType: "application/pdf" });
          setFilename("");
        }}
      >
        <input
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          placeholder="resume.pdf"
        />
        <button type="submit">Add document</button>
      </form>
      <p>Documents in your corpus:</p>
      <DocumentList documents={documents} />
    </main>
  );
}
