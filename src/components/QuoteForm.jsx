function QuoteForm({ services, selectedServiceId, onServiceChange, request, setRequest, quantity, setQuantity, onGenerate, onGenerateAI, busy }) {
  const service = services.find(service => service.id === selectedServiceId)
  return (
    <form onSubmit={onGenerate}>
      <label htmlFor="service">Service</label>
      <select id="service" value={selectedServiceId} onChange={event => onServiceChange(event.target.value)} required>
        <option value="">Select a service</option><option value="custom">Custom request — business sets the price</option>
        {services.map(service => <option key={service.id} value={service.id}>{service.name} — ${service.price.toFixed(2)} each</option>)}
      </select>
      {service && <p className="muted">Unit price: ${service.price.toFixed(2)}</p>}
      <label htmlFor="quantity">Quantity</label>
      <input id="quantity" type="number" min="1" max="10000" step="1" required value={quantity} onChange={event => setQuantity(event.target.value)} />
      <label htmlFor="request">Service details <span className="muted">{selectedServiceId === "custom" ? "(required)" : "(optional)"}</span></label>
      <textarea required={selectedServiceId === "custom"} id="request" value={request} onChange={event => setRequest(event.target.value)} placeholder="Sizes, colors, or other details" maxLength={2000} />
      <p className="muted">All requests require business approval before acceptance.</p>
      <div className="actions">
        <button type="button" disabled={busy || !request.trim() || services.length === 0} onClick={onGenerateAI}>{busy ? 'Please wait…' : 'Draft with AI'}</button>
        <button type="submit" className="secondary">Preview manually</button>
      </div>
      <p className="muted">For an AI draft, describe one service and the quantity above. Your description is sent to OpenAI. Review the draft before submitting.</p>
      {services.length === 0 && <p className="muted">You can still submit a custom request.</p>}
    </form>
  )
}
export default QuoteForm
