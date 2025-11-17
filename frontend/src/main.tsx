import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import config from './config.ts';
import './index.css';

// Set CSS custom properties for background images
const root = document.documentElement;
root.style.setProperty('--image-base-url', config.IMAGE_BASE_URL);
root.style.setProperty('--login-background-image', `url('${config.IMAGE_BASE_URL}/login-images/login1.png') center center / cover no-repeat`);
root.style.setProperty('--register-background-image', `url('${config.IMAGE_BASE_URL}/login-images/charactercreate1.png') center center / cover no-repeat`);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);