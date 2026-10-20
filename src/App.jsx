import { useState } from 'react'
import './App.css'
import QuoteCard from './components/QuoteCard'
import QuoteForm from './components/QuoteForm'
import ServiceEditor from './components/ServiceEditor'

const sampleServices = [
  { id: 'custom-t-shirt', name: 'Custom T-shirt', price: 25 },
  { id: 'custom-hoodie', name: 'Custom Hoodie', price: 50 },
]

function App() {
  const [services, setServices] = useState(sampleServices)
  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [request, setRequest] = useState('')
  const [quote, setQuote] = useState(null)
  const [error, setError] = useState('')
  const [quantity, setQuantity] = useState(1)

  function clearQuote() {
    setQuote(null)
    setError('')
  }

  function handleServicesChange(nextServices) {
    setServices(nextServices)
    if (!nextServices.some(service => service.id === selectedServiceId)) {
      setSelectedServiceId('')
    }
    clearQuote()
  }

  function handleGenerateQuote(event) {
    event.preventDefault()
    const service = services.find(service => service.id === selectedServiceId)
    const count = Number(quantity)

    if (!service) {
      setError('Please select a service.')
      setQuote(null)
      return
    }
    if (!Number.isSafeInteger(count) || count < 1 || count > 10000) {
      setError('Enter a whole-number quantity from 1 to 10,000.')
      setQuote(null)
      return
    }

    // Calculate in cents before converting the total back to dollars.
    const totalCents = Math.round(service.price * 100) * count
    setQuote({
      name: service.name,
      request: request.trim(),
      quantity: count,
      price: service.price,
      total: totalCents / 100,
    })
    setError('')
  }

  return (
    <main>
      <header>
        <p className="eyebrow">SIMPLE SERVICE QUOTES</p>
        <h1>QuoteFlow</h1>
        <p>Your services. Your prices. A clear quote in seconds.</p>
      </header>
      <div className="layout">
        <ServiceEditor services={services} onChange={handleServicesChange} />
        <section className="panel" aria-labelledby="customer-heading">
          <h2 id="customer-heading">Create a quote</h2>
          <p className="muted">Choose a service and tell us how many you need.</p>
          <QuoteForm
            services={services}
            selectedServiceId={selectedServiceId}
            onServiceChange={value => {
              setSelectedServiceId(value)
              clearQuote()
            }}
            request={request}
            setRequest={value => {
              setRequest(value)
              clearQuote()
            }}
            quantity={quantity}
            setQuantity={value => {
              setQuantity(value)
              clearQuote()
            }}
            onGenerate={handleGenerateQuote}
          />
          {error && <p className="error" role="alert">{error}</p>}
          <div aria-live="polite">
            {quote && <QuoteCard quote={quote} />}
          </div>
        </section>
      </div>
      <footer>Prices in USD. This practice version keeps changes only until you refresh.</footer>
    </main>
  )
}

export default App
