import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "../LegalPage";

export const metadata: Metadata = {
  title: "Cookies and browser storage — ClearCheck",
  description: "What ClearCheck stores in your browser and why.",
};

const sections = [
  { id: "storage", label: "What we store" },
  { id: "checkout", label: "Stripe Checkout" },
  { id: "controls", label: "Your browser controls" },
];

export default function CookiesPage() {
  return (
    <LegalPage eyebrow="PRIVACY" title="Cookies and browser storage"
      intro="How the ClearCheck app uses browser storage to keep you signed in and remember your choices."
      sections={sections} updated="12 November 2026">
      <h2 id="storage">What we store</h2>
      <ul>
        <li><strong>Sign-in session.</strong> Supabase stores session information in your browser to keep you signed in across visits. Signing out clears the local session.</li>
        <li><strong>Email verification.</strong> The address you enter is kept in the current tab’s session storage so you can resend a verification email. It is cleared when verification completes in that tab or the tab’s session ends.</li>
        <li><strong>Appearance.</strong> When you choose light or dark mode, your browser remembers that choice until you change it or clear site data.</li>
        <li><strong>Screening history filters.</strong> The browser’s history entry can remember your filters so you can return to the same view.</li>
      </ul>
      <p>The ClearCheck app does not include advertising pixels or analytics scripts.</p>
      <h2 id="checkout">Stripe Checkout</h2>
      <p>Opening checkout or the billing portal takes you to Stripe. Stripe manages storage on its own pages.</p>
      <h2 id="controls">Your browser controls</h2>
      <p>You can clear ClearCheck’s site data in your browser settings. This removes your saved theme and signs you out of this browser. See the <Link href="/privacy">privacy notice</Link> for information about data saved to your workspace and how to request deletion.</p>
    </LegalPage>
  );
}
