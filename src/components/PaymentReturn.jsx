import '../App.css';
export default function PaymentReturn() {
  const cancelled = new URLSearchParams(window.location.search).has('cancelled');
  return <main className="guest-shell"><section className="panel"><p className="eyebrow">QUOTEFLOW · PAYPAL SANDBOX</p><h1>{cancelled ? 'Checkout closed' : 'Return to your QuoteFlow tab'}</h1><p>{cancelled ? 'You can return to your request to resume checkout or check its status.' : 'Click “Complete sandbox payment” on your original request page. QuoteFlow will confirm the payment directly with PayPal.'}</p><p className="muted">This return page does not confirm payment. No real money is used in this demo.</p><p>You can close this tab. If you closed your request, reopen its private email link or sign in to QuoteFlow.</p></section></main>;
}
