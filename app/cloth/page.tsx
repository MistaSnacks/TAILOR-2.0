"use client";
import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ClothUploader } from "../components/ClothUploader";
import { DocumentList } from "../components/DocumentList";

export default function ClothPage() {
  const documents = useQuery(api.documents.list);
  const remove = useMutation(api.documents.deleteDocument);
  const reprocess = useAction(api.canonicalize.reprocessAll);
  const [rebuilding, setRebuilding] = useState(false);

  const onDelete = (id: Id<"corpusDocuments">) => {
    if (confirm("Delete this document and the threads tied only to it? The Form will re-derive.")) {
      remove({ documentId: id });
    }
  };

  const onRebuild = async () => {
    setRebuilding(true);
    try {
      await reprocess();
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <>
      <div className="eyebrow">corpus</div>
      <h1>The <em>Cloth</em></h1>
      <p className="lede">
        Every résumé, memo, and export you bring. Upload once; TAILOR reads all of it and weaves
        it into one Form. Files parse automatically a moment after upload.
      </p>
      <div style={{ marginTop: 24 }}>
        <ClothUploader />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "40px 0 16px", borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
        <h2 style={{ fontSize: 20 }}>Bolts of cloth</h2>
        <button className="btn btn-ghost" onClick={onRebuild} disabled={rebuilding}>
          {rebuilding ? "Rebuilding…" : "Rebuild Form"}
        </button>
      </div>
      <DocumentList documents={documents ?? []} onDelete={onDelete} />
    </>
  );
}
