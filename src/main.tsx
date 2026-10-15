import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import SurveyPage from './features/survey/SurveyPage'
import './styles.css'

// /survey is a public page: it opens without login and never touches the signed-in app.
const isSurvey = window.location.pathname.replace(/\/+$/, '') === '/survey'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isSurvey ? <SurveyPage /> : <App />}
  </React.StrictMode>
)
