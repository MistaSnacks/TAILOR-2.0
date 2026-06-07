import type { Doc, Id } from "../../convex/_generated/dataModel";

export function DocumentList({
  documents,
  onDelete,
}: {
  documents: Doc<"corpusDocuments">[];
  onDelete?: (id: Id<"corpusDocuments">) => void;
}) {
  if (documents.length === 0) {
    return (
      <div className="empty">
        <div className="mark">No documents yet.</div>
        <p>Upload some cloth above to begin.</p>
      </div>
    );
  }
  return (
    <div className="rows">
      {documents.map((doc) => (
        <div className="row" key={doc._id}>
          <span className={"badge " + doc.status}>{doc.status}</span>
          <span className="file">{doc.filename}</span>
          <span className="meta">
            {doc.mimeType || "unknown"}
            {doc.error ? ` · ${doc.error}` : ""}
          </span>
          {onDelete && (
            <button className="row-del" onClick={() => onDelete(doc._id)} title="Delete this document">
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
