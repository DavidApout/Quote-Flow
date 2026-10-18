import { use, useState } from 'react'
import './App.css'

function App() {
const [request,setRequest] =  useState("")
function handleGenerateQuote () {
  const cleanRequest = request.trim()
  if (request.trim() === ""){
    alert("Please enter a request")
    return
  }
  alert(request.trim())
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
      <p>{request}</p>
    </>
  )
}

export default App
