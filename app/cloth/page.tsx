"use client";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ClothUploader } from "../components/ClothUploader";
import { DocumentList } from "../components/DocumentList";

export default function ClothPage() {
  const documents = useQuery(api.documents.list);
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
      <h2 className="section-title">Bolts of cloth</h2>
      <DocumentList documents={documents ?? []} />
    </>
  );
}
