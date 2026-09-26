import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from 'src/App';
import 'src/styles/tokens.css';

// Served two ways: as clube.campuzz.com.br/ and as /clube/ on the CRM host.
// React Router renders nothing when the basename is not a prefix of the URL, so
// it is read from where the page actually is — and the trailing slash matters,
// since /clubes/:id would otherwise be mistaken for the /clube base.
const { pathname } = window.location;
const basename = pathname === '/clube' || pathname.startsWith('/clube/') ? '/clube' : '/';

const raiz = document.getElementById('root');

if (raiz === null) {
  throw new Error('O elemento #root não existe no HTML.');
}

createRoot(raiz).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
