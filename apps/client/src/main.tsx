import { friendlyErrors } from '@sims/contracts';
import { StrictMode } from 'react';
import { z } from 'zod';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import './styles/index.css';

// Plain-English validation messages, the same as the server sends.
z.config({ customError: friendlyErrors });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
