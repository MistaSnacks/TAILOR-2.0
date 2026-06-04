"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Session = { name: string } | null;
type Ctx = { session: Session; signIn: (name: string) => void; signOut: () => void };

const SessionCtx = createContext<Ctx>({ session: null, signIn: () => {}, signOut: () => {} });

// Cosmetic, single-user "login" — no real auth (testing only). Persisted to localStorage.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("tailor.session") : null;
    if (raw) setSession(JSON.parse(raw));
    setReady(true);
  }, []);

  const signIn = (name: string) => {
    const s = { name: name.trim() || "Guest" };
    localStorage.setItem("tailor.session", JSON.stringify(s));
    setSession(s);
  };
  const signOut = () => {
    localStorage.removeItem("tailor.session");
    setSession(null);
  };

  return <SessionCtx.Provider value={{ session, signIn, signOut }}>{ready ? children : null}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);
