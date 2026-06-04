import "./globals.css";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { SessionProvider } from "./SessionProvider";
import { AppShell } from "./components/AppShell";

export const metadata = {
  title: "TAILOR — the atelier",
  description: "Job-specific resumes, cut only from cloth you actually own.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConvexClientProvider>
          <SessionProvider>
            <AppShell>{children}</AppShell>
          </SessionProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
