function QuoteCard({ quote }) {
  return (
    <section className="quote" aria-labelledby="quote-heading">
      <p className="eyebrow">ESTIMATE</p>
      <h2 id="quote-heading">Quote preview</h2>
      <h3>{quote.name}</h3>
      {quote.request && <p className="details">{quote.request}</p>}
      <dl>
        <div><dt>Quantity</dt><dd>{quote.quantity}</dd></div>
        <div><dt>Unit price</dt><dd>{quote.price === null ? "To be confirmed" : `$${quote.price.toFixed(2)}`}</dd></div>
        <div className="total"><dt>Estimated total</dt><dd>{quote.total === null ? "Awaiting business pricing" : `$${quote.total.toFixed(2)}`}</dd></div>
      </dl>
      <p className="muted">Service price × quantity. Taxes and additional fees are not included.</p>
    </section>
  )
}
export default QuoteCard
