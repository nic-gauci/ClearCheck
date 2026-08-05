import Link from "next/link";
import AppHeader from "../../AppHeader";

export default function CheckoutCancelledPage(){
  return <main className="checkoutSuccessPage">
    <AppHeader variant="authenticated"/>
    <section className="checkoutSuccessShell cancelledCheckout">
      <span className="successIcon cancelled">×</span>
      <span className="authKicker">CHECKOUT CANCELLED</span>
      <h1>No payment was taken</h1>
      <p>Your account and current screening-credit balance have not changed. You can choose another plan or return to your workspace.</p>
      <div className="successActions"><Link href="/account?tab=billing">Try again</Link><Link href="/account">Return to account</Link></div>
    </section>
  </main>;
}
