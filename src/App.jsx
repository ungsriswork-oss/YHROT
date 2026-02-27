import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import PharmacistPage from './pages/PharmacistPage';
import TechnicianPage from './pages/TechnicianPage';
import AssistantPage from './pages/AssistantPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/pharmacist" element={<PharmacistPage />} />
        <Route path="/technician" element={<TechnicianPage />} />
        <Route path="/assistant" element={<AssistantPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
