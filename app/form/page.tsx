"use client";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { FormExplorer } from "../components/FormExplorer";

export default function FormPage() {
  const view = useQuery(api.form.formView);
  return (
    <>
      <div className="eyebrow">profile</div>
      <h1>The <em>Form</em></h1>
      <p className="lede">
        Your whole corpus, deduped and unified into one canonical profile — the dress form every
        Fitting is built on. Each thread traces back to the cloth it came from.
      </p>
      <FormExplorer threads={view?.threads ?? []} skills={view?.skills ?? []} />
    </>
  );
}
