"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSession } from "../SessionProvider";
import { Login } from "./Login";

const NAV = [
  { href: "/", label: "Atelier", sub: "workspace" },
  { href: "/cloth", label: "The Cloth", sub: "corpus" },
  { href: "/form", label: "The Form", sub: "profile" },
  { href: "/patterns", label: "Patterns", sub: "jobs" },
  { href: "/fittings", label: "Fittings", sub: "resumes" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { session, signOut } = useSession();
  const pathname = usePathname();

  if (!session) return <Login />;

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <div className="word">TAILO<b>R</b></div>
          <div className="sub">the atelier</div>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={isActive(pathname, item.href) ? "active" : ""}>
              <span className="label">{item.label}</span>
              <span className="sub">{item.sub}</span>
            </Link>
          ))}
        </nav>
        <div className="rail-foot">
          <div className="rail-user">
            <div className="avatar">{session.name.charAt(0).toUpperCase()}</div>
            <div className="who">
              {session.name}
              <small>testing</small>
            </div>
            <button className="signout" onClick={signOut}>exit</button>
          </div>
        </div>
      </aside>
      <main className="canvas">
        <div className="page" key={pathname}>
          {children}
        </div>
      </main>
    </div>
  );
}
