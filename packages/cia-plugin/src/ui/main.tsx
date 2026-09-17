import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/ui/App';
import './App.css';

const container = document.getElementById('app');
if (container) {
  createRoot(container).render(<App />);
}
