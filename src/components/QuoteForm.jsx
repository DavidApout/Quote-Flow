function QuoteForm({ services, selectedServiceId, onServiceChange, request, setRequest, quantity, setQuantity, onGenerate }) {
  const service = services.find(service => service.id === selectedServiceId)
  return (
    <form onSubmit={onGenerate}>
      <label htmlFor="service">Service</label>
      <select id="service" value={selectedServiceId} onChange={event => onServiceChange(event.target.value)} required>
        <option value="">Select a service</option>
        {services.map(service => <option key={service.id} value={service.id}>{service.name} — ${service.price.toFixed(2)} each</option>)}
      </select>
      {service && <p className="muted">Unit price: ${service.price.toFixed(2)}</p>}
      <label htmlFor="quantity">Quantity</label>
      <input id="quantity" type="number" min="1" max="10000" step="1" required value={quantity} onChange={event => setQuantity(event.target.value)} />
      <label htmlFor="request">Service details <span className="muted">(optional)</span></label>
      <textarea id="request" value={request} onChange={event => setRequest(event.target.value)} placeholder="Sizes, colors, or other details" maxLength={2000} />
      <p className="muted">Details do not change the listed price.</p>
      <button type="submit" disabled={services.length === 0}>Calculate quote</button>
      {services.length === 0 && <p className="muted">Add a business service to start.</p>}
    </form>
  )
}
export default QuoteForm
