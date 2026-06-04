"use client";
import { useState } from "react";
import { useSession } from "../SessionProvider";

export function Login() {
  const { signIn } = useSession();
  const [name, setName] = useState("Camren");

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="word">TAILO<b>R</b></div>
        <div className="sub">the atelier</div>
        <p className="creed">
          “A tailor alters the cloth you bring. They never weave fabric you don’t own.”
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            signIn(name);
          }}
        >
          <label htmlFor="name">Your name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <button className="btn" type="submit">Enter the atelier</button>
        </form>
        <p className="disclaimer">testing mode · no authentication · session stored locally</p>
      </div>
    </div>
  );
}
