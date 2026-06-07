"use client";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ProfileView } from "../components/ProfileView";

export default function FormPage() {
  const p = useQuery(api.profile.getProfile);
  return (
    <>
      <div className="eyebrow">profile</div>
      <h1>The <em>Form</em></h1>
      <p className="lede">
        Your whole corpus, deduped and unified into one structured profile — contact, experiences
        (every bullet grouped under its role), skills, and education. Every Fitting is cut from this.
      </p>
      <ProfileView
        basics={p?.basics ?? null}
        experiences={p?.experiences ?? []}
        skills={p?.skills ?? []}
        education={p?.education ?? []}
      />
    </>
  );
}
