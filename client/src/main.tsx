import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
// the default font is bundled with the app: a phone on a Wi-Fi without internet used to wait for fonts.googleapis.com (a blocking request) before showing anything
import '@fontsource/prompt/thai-300.css'; import '@fontsource/prompt/thai-400.css'; import '@fontsource/prompt/thai-500.css'; import '@fontsource/prompt/thai-600.css'; import '@fontsource/prompt/thai-700.css';
import '@fontsource/prompt/latin-300.css'; import '@fontsource/prompt/latin-400.css'; import '@fontsource/prompt/latin-500.css'; import '@fontsource/prompt/latin-600.css'; import '@fontsource/prompt/latin-700.css';
import './index.css';
import '@/store/theme';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </BrowserRouter>
  </React.StrictMode>,
);
