"use client";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ClothUploader } from "../components/ClothUploader";
import { FormExplorer } from "../components/FormExplorer";

export default function FormPage() {
  const view = useQuery(api.form.formView);
  return (
    <main style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>The Form — your unified career profile</h1>
      <ClothUploader />
      <FormExplorer threads={view?.threads ?? []} skills={view?.skills ?? []} />
    </main>
  );
}
