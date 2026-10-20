import { use, useState } from 'react'
import './App.css'
import QuoteCard from './components/QuoteCard'

function App() {
const [request,setRequest] =  useState("")
const [quote,setQuote] = useState("")
function handleGenerateQuote () {
  const cleanRequest = request.trim()
  if (cleanRequest === ""){
    alert("Please enter a request")
    return
  }
  setQuote(cleanRequest)
}
 return (
    <>
      <h1>QuoteFlow AI</h1>
      <p>Generate professional quotes with AI.</p>
      <textarea 
       value={request}
       onChange={e => setRequest(e.target.value)}
       placeholder='Describe What you need...'
       />
       <button 
       onClick={handleGenerateQuote}>Generate Quote</button>
      {quote !== "" && <QuoteCard quote={quote}/>}
    </>
  )
}

export default App
