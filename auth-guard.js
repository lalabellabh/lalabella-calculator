/**
 * LALABELLA AUTH GUARD — FAST SESSION v2
 *
 * Shared protected-page session bootstrap.
 * A remembered token is restored synchronously; server verification runs
 * in the background and never blocks normal page rendering.
 */
(function () {
  const AUTH_API_URL = 'https://script.google.com/macros/s/AKfycbxKYKjmEfD7NXNmC5P9acKvvrTbUf3GE061VoKMUb0l_miYPVJ_JbpiyG7Nrjs2y2b2/exec';
  const AUTH_CALLER_SECRET = 'Lalabella2026-AuthGate-9xK2mP7qR';
  const BACKEND_PATTERN = /script\.google\.com\/macros\/s\//;
  const VERIFY_CACHE_MS = 30 * 60 * 1000;
  const VERIFY_TIMEOUT_MS = 8000;
  const VERIFY_AT_KEY = 'lalabellaVerifiedAt';
  const VERIFY_TOKEN_KEY = 'lalabellaVerifiedToken';

  const token = sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || '';
  const userRaw = sessionStorage.getItem('lalabellaUser') || localStorage.getItem('lalabellaUser') || '';

  function parseUser(raw){
    if(!raw) return null;
    try { return JSON.parse(raw); } catch(e) { return null; }
  }

  function clearSession(){
    sessionStorage.removeItem('lalabellaToken');
    sessionStorage.removeItem('lalabellaUser');
    sessionStorage.removeItem(VERIFY_TOKEN_KEY);
    sessionStorage.removeItem(VERIFY_AT_KEY);
    localStorage.removeItem('lalabellaToken');
    localStorage.removeItem('lalabellaUser');
    localStorage.removeItem(VERIFY_TOKEN_KEY);
    localStorage.removeItem(VERIFY_AT_KEY);
  }

  function goToLogin(){
    clearSession();
    if(!location.pathname.endsWith('/index.html') && !location.pathname.endsWith('/')) {
      window.location.replace('index.html');
    }
  }

  // No token = genuinely unauthenticated.
  if(!token){
    goToLogin();
    return;
  }

  // Restore the remembered session immediately so page scripts can use it.
  window.LALABELLA_TOKEN = token;
  window.LALABELLA_USER = parseUser(userRaw);
  sessionStorage.setItem('lalabellaToken', token);
  if(userRaw) sessionStorage.setItem('lalabellaUser', userRaw);

  // Add the authenticated session token to application Google Apps Script
  // calls that don't already carry one. Do NOT inspect/clone every response.
  const originalFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    const currentToken = window.LALABELLA_TOKEN
      || sessionStorage.getItem('lalabellaToken')
      || localStorage.getItem('lalabellaToken')
      || '';

    let url = typeof input === 'string' ? input : (input && input.url) || '';
    const isBackendCall = !!currentToken && BACKEND_PATTERN.test(url);
    const isAuthCall = url.indexOf(AUTH_API_URL) === 0;

    if(isBackendCall && !isAuthCall && !/[?&]token=/.test(url)){
      const sep = url.includes('?') ? '&' : '?';
      const newUrl = url + sep + 'token=' + encodeURIComponent(currentToken);
      if(typeof input === 'string') input = newUrl;
      else if(input && input.url) input = new Request(newUrl, input);
    }

    return originalFetch(input, init);
  };

  function verifyToken(tok){
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
    const url = AUTH_API_URL
      + '?action=verifyToken&token=' + encodeURIComponent(tok)
      + '&callerSecret=' + encodeURIComponent(AUTH_CALLER_SECRET);
    return originalFetch(url, {signal: controller.signal})
      .then(r => r.json())
      .finally(() => clearTimeout(timer));
  }

  function markVerified(data){
    if(data && data.user){
      const raw = JSON.stringify(data.user);
      window.LALABELLA_USER = data.user;
      sessionStorage.setItem('lalabellaUser', raw);
      localStorage.setItem('lalabellaUser', raw);
    }
    sessionStorage.setItem(VERIFY_TOKEN_KEY, token);
    sessionStorage.setItem(VERIFY_AT_KEY, String(Date.now()));
    localStorage.setItem(VERIFY_TOKEN_KEY, token);
    localStorage.setItem(VERIFY_AT_KEY, String(Date.now()));
  }

  function needsVerify(){
    const cachedToken = sessionStorage.getItem(VERIFY_TOKEN_KEY) || localStorage.getItem(VERIFY_TOKEN_KEY) || '';
    const cachedAt = Number(sessionStorage.getItem(VERIFY_AT_KEY) || localStorage.getItem(VERIFY_AT_KEY) || 0);
    return cachedToken !== token || !cachedAt || (Date.now() - cachedAt > VERIFY_CACHE_MS);
  }

  let verificationInFlight = false;
  function verifyInBackground(force){
    if(verificationInFlight) return;
    if(!force && !needsVerify()) return;
    verificationInFlight = true;
    verifyToken(token)
      .then(data => {
        verificationInFlight = false;
        if(data && data.valid === true){
          markVerified(data);
          return;
        }
        // ONLY an explicit invalid result can clear the remembered session.
        if(data && data.valid === false){
          goToLogin();
        }
        // Unknown/malformed response: keep the current session.
      })
      .catch(() => {
        verificationInFlight = false;
        // Network/server timeout is NOT an authentication failure.
      });
  }

  verifyInBackground(false);

  let hiddenAt = 0;
  document.addEventListener('visibilitychange', function(){
    if(document.hidden){
      hiddenAt = Date.now();
    }else if(hiddenAt && Date.now() - hiddenAt > 60 * 1000){
      hiddenAt = 0;
      verifyInBackground(true);
    }
  });
})();

function lalabellaCheckResponse(data){
  if (data && typeof data === 'object' && !Array.isArray(data) && 'error' in data) {
    throw new Error(data.error || 'Unknown server error');
  }
  return data;
}
