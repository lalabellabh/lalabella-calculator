/**
 * LALABELLA AUTH GUARD — FAST SESSION v2

 * Include this on EVERY protected page, as early as possible in
 * <head> (before other scripts/content), so an unauthenticated
 * visitor is redirected before anything meaningful renders.
 *
 * What it does:
 * 1. Checks sessionStorage for a token.
 * 2. If missing, redirects to index.html immediately.
 * 3. If present, verifies it against the Auth backend — an expired
 *    or logged-out token is treated the same as no token at all.
 * 4. Exposes window.LALABELLA_TOKEN and window.LALABELLA_USER once
 *    verified, so the rest of the page's own scripts can read them
 *    (e.g. to append &token=... to their own API calls) without
 *    each page re-implementing this check.
 */
(function () {
  const AUTH_API_URL = 'https://script.google.com/macros/s/AKfycbxKYKjmEfD7NXNmC5P9acKvvrTbUf3GE061VoKMUb0l_miYPVJ_JbpiyG7Nrjs2y2b2/exec';
  const AUTH_CALLER_SECRET = 'Lalabella2026-AuthGate-9xK2mP7qR';
  const BACKEND_PATTERN = /script\.google\.com\/macros\/s\//;
  const VERIFY_CACHE_MS = 30 * 60 * 1000;
  const VERIFY_TIMEOUT_MS = 8000;
  const VERIFY_AT_KEY = 'lalabellaVerifiedAt';
  const VERIFY_TOKEN_KEY = 'lalabellaVerifiedToken';

  // ---------------------------------------------------------------
  // FAST SESSION BOOT
  // ---------------------------------------------------------------
  // Restore the remembered session synchronously. Protected pages
  // must not wait for Google Apps Script before rendering.
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
    } else {
      window.location.replace('index.html');
    }
  }

  // No token = genuinely unauthenticated. This is the only case that
  // redirects synchronously. A slow/failing server must never erase a
  // valid remembered login.
  if(!token){
    goToLogin();
    return;
  }

  // Make the session available immediately to every page script.
  // This is intentionally done BEFORE any background verification.
  window.LALABELLA_TOKEN = token;
  window.LALABELLA_USER = parseUser(userRaw);
  sessionStorage.setItem('lalabellaToken', token);
  if(userRaw) sessionStorage.setItem('lalabellaUser', userRaw);

  // ---------------------------------------------------------------
  // AUTHENTICATED API FETCH WRAPPER
  // ---------------------------------------------------------------
  // Keep the useful part of the old wrapper: attach the current token
  // to our Apps Script calls. Do NOT parse/clone every response. That
  // extra work happened on every API request and could make large pages
  // feel slower. Authentication validity is checked independently in
  // the background below.
  const originalFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    const currentToken = window.LALABELLA_TOKEN
      || sessionStorage.getItem('lalabellaToken')
      || localStorage.getItem('lalabellaToken')
      || '';

    if(!currentToken) return originalFetch(input, init);

    let url = typeof input === 'string' ? input : (input && input.url) || '';
    const isBackendCall = BACKEND_PATTERN.test(url);

    if(isBackendCall && !/[?&]token=/.test(url)){
      const sep = url.includes('?') ? '&' : '?';
      const nextUrl = url + sep + 'token=' + encodeURIComponent(currentToken);
      if(typeof input === 'string') input = nextUrl;
      else input = new Request(nextUrl, input);
    }

    if(isBackendCall && init && init.body){
      if(typeof init.body === 'string'){
        let handled = false;
        try{
          const parsed = JSON.parse(init.body);
          if(parsed && typeof parsed === 'object' && !('token' in parsed)){
            parsed.token = currentToken;
            init = Object.assign({}, init, {body: JSON.stringify(parsed)});
            handled = true;
          }
        }catch(e){}
        if(!handled && !/[?&]token=/.test(init.body)){
          init = Object.assign({}, init, {body: init.body + '&token=' + encodeURIComponent(currentToken)});
        }
      }else if(init.body instanceof URLSearchParams){
        if(!init.body.has('token')) init.body.append('token', currentToken);
      }
    }

    return originalFetch(input, init);
  };

  // ---------------------------------------------------------------
  // BACKGROUND VERIFICATION — NEVER BLOCK PAGE RENDER
  // ---------------------------------------------------------------
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
    const cachedToken = localStorage.getItem(VERIFY_TOKEN_KEY) || sessionStorage.getItem(VERIFY_TOKEN_KEY);
    const cachedAt = Number(localStorage.getItem(VERIFY_AT_KEY) || sessionStorage.getItem(VERIFY_AT_KEY) || 0);
    return cachedToken !== token || !cachedAt || (Date.now() - cachedAt) >= VERIFY_CACHE_MS;
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
        if(data && data.valid === false){
          // ONLY an explicit server-side invalid result can clear the
          // remembered session. Never treat an unexpected response
          // shape, empty response, or backend hiccup as logout.
          goToLogin();
          return;
        }
        // Unknown/malformed response: keep the existing session.
        // The page's own API request will report any real data problem.
      })
      .catch(() => {
        verificationInFlight = false;
        // Network/server timeout is NOT an authentication failure.
        // Keep the session and let the page's own API request show a
        // useful data/network error if necessary.
      });
  }

  // Page renders immediately. Verification happens in the background.
  verifyInBackground(false);

  // Re-check only when the tab has been away for a while, not on every
  // focus event. This avoids another verifyToken request during normal
  // navigation while still catching a genuinely expired session.
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

// ---------------------------------------------------------------
// Shared response-checking helper — every page's own fetch(...).json()
// calls can pass their result through this before treating it as
// real data. It throws a clear, specific error the moment the
// backend returned {error: "..."} instead of the expected array/
// object, so a page's own catch block can show the ACTUAL reason
// (Unauthorized, server error, etc.) instead of the response silently
// crashing a .filter()/.map() call and getting swallowed into a
// generic "check your connection" message.
// Usage: const items = lalabellaCheckResponse(await (await fetch(...)).json());
// ---------------------------------------------------------------
function lalabellaCheckResponse(data){
  if (data && typeof data === 'object' && !Array.isArray(data) && 'error' in data) {
    throw new Error(data.error || 'Unknown server error');
  }
  return data;
}

