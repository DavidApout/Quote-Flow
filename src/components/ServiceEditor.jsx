import { useState } from "react";

function ServiceEditor({ services, onChange }) {
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");

  function resetForm() {
    setEditingId(null);
    setName("");
    setPrice("");
    setError("");
  }

  function handleSave(event) {
    event.preventDefault();
    const cleanName = name.trim();
    const amount = Number(price);
    if (
      !cleanName ||
      price.trim() === "" ||
      !Number.isFinite(amount) ||
      amount < 0 ||
      amount > 1000000
    ) {
      setError("Enter a service name and a price from $0 to $1,000,000.");
      return;
    }
    if (
      services.some(
        (service) =>
          service.id !== editingId &&
          service.name.toLowerCase() === cleanName.toLowerCase(),
      )
    ) {
      setError("A service with this name already exists.");
      return;
    }
    const service = {
      id: editingId ?? crypto.randomUUID(),
      name: cleanName,
      price: Math.round(amount * 100) / 100,
    };
    onChange(
      editingId
        ? services.map((item) => (item.id === editingId ? service : item))
        : [...services, service],
    );
    resetForm();
  }

  return (
    <section className="panel" aria-labelledby="business-heading">
      <h2 id="business-heading">Business services</h2>
      <p className="muted">
        Set the services and unit prices your customers can choose.
      </p>
      <ul className="services">
        {services.map((service) => (
          <li key={service.id}>
            <div>
              <strong>{service.name}</strong>
              <p className="muted">${service.price.toFixed(2)} / unit</p>
            </div>
            <div className="actions">
              <button
                type="button"
                className="secondary"
                aria-label={`Edit ${service.name}`}
                onClick={() => {
                  setEditingId(service.id);
                  setName(service.name);
                  setPrice(String(service.price));
                  setError("");
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className="secondary"
                aria-label={`Remove ${service.name}`}
                onClick={() => {
                  onChange(services.filter((item) => item.id !== service.id));
                  if (editingId === service.id) resetForm();
                }}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={handleSave}>
        <h3>{editingId ? "Edit service" : "Add a service"}</h3>
        <label htmlFor="service-name">Service name</label>
        <input
          id="service-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={100}
        />
        <label htmlFor="service-price">Unit price (USD)</label>
        <input
          id="service-price"
          type="number"
          min="0"
          max="1000000"
          step="0.01"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          required
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="submit">
            {editingId ? "Save changes" : "Add service"}
          </button>
          {editingId && (
            <button type="button" className="secondary" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
export default ServiceEditor;
