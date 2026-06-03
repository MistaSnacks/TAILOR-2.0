import type { Doc } from "../../convex/_generated/dataModel";

export function DocumentList({ documents }: { documents: Doc<"corpusDocuments">[] }) {
  if (documents.length === 0) {
    return <p>No documents yet.</p>;
  }
  return (
    <ul>
      {documents.map((doc) => (
        <li key={doc._id}>{doc.filename}</li>
      ))}
    </ul>
  );
}
