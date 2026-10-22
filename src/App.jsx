import { useState, useEffect } from "react";
import "./App.css";
import QuoteCard from "./components/QuoteCard";
import QuoteForm from "./components/QuoteForm";
import ServiceEditor from "./components/ServiceEditor";

const sampleServices = [
  { id: "custom-t-shirt", name: "Custom T-shirt", price: 25 },
  { id: "custom-hoodie", name: "Custom Hoodie", price: 50 },
];
function clearQuote() {
  setQuote(null);
  setError("");
}
function App() {
  const [services, setServices] = useState(() => {
    const savedServices = localStorage.getItem("quoteflow-services");
    return savedServices ? JSON.parse(savedServices) : sampleServices;
  });
  useEffect(() => {
    localStorage.setItem("quoteflow-services", JSON.stringify(services));
  }, [services]);
  const [selectedServiceId, setSelectedServiceId] = useState(() => {
    const selctedService = localStorage.getItem(
      "quoteflow-selected-service-id",
    );
    return selctedService ? JSON.parse(selctedService) : selctedService;
  });
  useEffect(() => {
    localStorage.setItem(
      "quoteflow-selected-service-id",
      JSON.stringify(selectedServiceId),
    );
  }, [selectedServiceId]);
  const [request, setRequest] = useState(() => {
    const request = localStorage.getItem("quoteflow-request");
    return request ? JSON.parse(request) : request;
  });
  useEffect(() => {
    localStorage.setItem("quoteflow-request", JSON.stringify(request));
  }, [request]);
  const [quote, setQuote] = useState(() => {
    const quote = localStorage.getItem("quoteflow-quote");
    return quote ? JSON.parse(quote) : quote;
  });
  useEffect(() => {
    localStorage.setItem("quoteflow-quote", JSON.stringify(quote));
  }, [quote]);
  const [error, setError] = useState(() => {
    const error = localStorage.getItem("quoteflow-error");
    return error ? JSON.parse(error) : error;
  });
  useEffect(() => {
    localStorage.setItem("quoteflow-error", JSON.stringify(error));
  }, [error]);
  const [quantity, setQuantity] = useState(() => {
    const quantity = localStorage.getItem("quoteflow-selected-service");
    return quantity ? JSON.parse(quantity) : quantity;
  });
  useEffect(() => {
    localStorage.setItem("quoteflow-services", JSON.stringify(services));
  }, [services]);
  const [activeView, setActiveView] = useState(() => {
    const activeView = localStorage.getItem("quoteflow-selected-service");
    return activeView ? JSON.parse(activeView) : activeView;
  });
  useEffect(() => {
    localStorage.setItem("quoteflow-services", JSON.stringify(services));
  }, [services]);
  const [quoteRequests, setQuoteRquests] = useState([]);
  function clearQuote() {
    setQuote(null);
    setError("");
  }
  function handleServicesChange(nextServices) {
    setServices(nextServices);
    if (!nextServices.some((service) => service.id === selectedServiceId)) {
      setSelectedServiceId("");
    }
    clearQuote();
  }

  function handleGenerateQuote(event) {
    event.preventDefault();
    const service = services.find(
      (service) => service.id === selectedServiceId,
    );
    const count = Number(quantity);

    if (!service) {
      setError("Please select a service.");
      setQuote(null);
      return;
    }
    if (!Number.isSafeInteger(count) || count < 1 || count > 10000) {
      setError("Enter a whole-number quantity from 1 to 10,000.");
      setQuote(null);
      return;
    }
    function handleSubmitRequest() {
      if (!quote) return;
      const newRequest = {
        id: crypto.randomUUID(),
        ...quote,
        status: "pending",
      };
      setQuoteRquests((previousRequests) => [...previousRequests, newRequest]);
    }

    // Calculate in cents before converting the total back to dollars.
    const totalCents = Math.round(service.price * 100) * count;
    setQuote({
      name: service.name,
      request: request.trim(),
      quantity: count,
      price: service.price,
      total: totalCents / 100,
    });
    setError("");
  }

  return (
    <main>
      <header>
        <p className="eyebrow">SIMPLE SERVICE QUOTES</p>
        <h1>QuoteFlow</h1>
        <p>Your services. Your prices. A clear quote in seconds.</p>
      </header>
      <nav className="view-nav" aria-label="QuoteFlow-View">
        <button
          className={activeView === "business" ? "active" : ""}
          onClick={() => setActiveView("business")}
        >
          Business
        </button>

        <button
          className={activeView === "customer" ? "active" : ""}
          onClick={() => setActiveView("customer")}
        >
          Customer
        </button>
      </nav>
      <div className="layout">
        {activeView === "business" && (
          <ServiceEditor services={services} onChange={handleServicesChange} />
        )}

        {activeView === "customer" && (
          <>
            <section className="panel" aria-labelledby="customer-heading">
              <h2 id="customer-heading">Create a quote</h2>
              <p className="muted">
                Choose a service and tell us how many you need.
              </p>
            </section>
            <QuoteForm
              services={services}
              selectedServiceId={selectedServiceId}
              onServiceChange={(value) => {
                setSelectedServiceId(value);
                clearQuote();
              }}
              request={request}
              setRequest={(value) => {
                setRequest(value);
                clearQuote();
              }}
              quantity={quantity}
              setQuantity={(value) => {
                setQuantity(value);
                clearQuote();
              }}
              onGenerate={handleGenerateQuote}
            />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div aria-live="polite">{quote && <QuoteCard quote={quote} />}</div>
          </>
        )}
      </div>
      <footer>
        Prices in USD. Business services are saved in this browser.
      </footer>
    </main>
  );
}

export default App;
