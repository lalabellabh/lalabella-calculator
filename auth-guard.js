/**
 * LALABELLA AUTH GUARD
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

  // ---------------------------------------------------------------
  // GLOBAL FETCH WRAPPER — rather than hand-editing every individual
  // fetch() call across 30+ pages (error-prone, easy to miss one),
  // this transparently attaches the current session token to every
  // outgoing request aimed at any of our own Apps Script backends
  // (script.google.com/macros/s/...), whatever shape that call takes:
  // plain GET query string, POST with a JSON body, or POST with a
  // URLSearchParams/form-encoded body. Calls to anything else (fonts,
  // OpenAI, other sites) are left completely untouched.
  // ---------------------------------------------------------------
  const originalFetch = window.fetch.bind(window);
  const BACKEND_PATTERN = /script\.google\.com\/macros\/s\//;

  window.fetch = function (input, init) {
    const token = window.LALABELLA_TOKEN
      || sessionStorage.getItem('lalabellaToken')
      || localStorage.getItem('lalabellaToken')
      || '';

    let url = typeof input === 'string' ? input : (input && input.url) || '';
    const isBackendCall = token && BACKEND_PATTERN.test(url);

    if (isBackendCall && !/[?&]token=/.test(url)) {
      const sep = url.includes('?') ? '&' : '?';
      url = url + sep + 'token=' + encodeURIComponent(token);
      if (typeof input === 'string') {
        input = url;
      } else {
        input = new Request(url, input);
      }
    }

    if (isBackendCall && init && init.body) {
      if (typeof init.body === 'string') {
        // Try JSON body first.
        let handled = false;
        try {
          const parsed = JSON.parse(init.body);
          if (parsed && typeof parsed === 'object' && !('token' in parsed)) {
            parsed.token = token;
            init = Object.assign({}, init, { body: JSON.stringify(parsed) });
            handled = true;
          }
        } catch (e) { /* not JSON — fall through */ }
        // Otherwise treat as form-encoded (URLSearchParams.toString() shape).
        if (!handled && !/[?&]token=/.test(init.body)) {
          init = Object.assign({}, init, { body: init.body + '&token=' + encodeURIComponent(token) });
        }
      } else if (init.body instanceof URLSearchParams) {
        if (!init.body.has('token')) init.body.append('token', token);
      }
    }

    return originalFetch(input, init).then(response => {
      // For calls to our own backends, peek at the JSON body (via a
      // clone, so the original response stream is left untouched for
      // whatever code actually called fetch) — if the backend
      // rejected the request as Unauthorized, that means the session
      // itself is the problem, not "the internet". Redirecting
      // straight to login here is both more honest (no more
      // misleading "check your connection" messages hiding an
      // expired/invalid token) and saves every individual page from
      // having to special-case this itself.
      if (isBackendCall) {
        response.clone().json().then(data => {
          if (data && data.error && /unauthorized/i.test(String(data.error))) {
            goToLoginPublic_();
          }
        }).catch(() => { /* not JSON, or already consumed — ignore */ });
      }
      return response;
    });
  };

  // goToLogin is defined further below as a plain function; this
  // thin wrapper lets the fetch interceptor above (which runs before
  // that definition executes) still reach it via closure once the
  // script has fully loaded.
  function goToLoginPublic_(){ goToLogin(); }

  function goToLogin() {
    sessionStorage.removeItem('lalabellaToken');
    sessionStorage.removeItem('lalabellaUser');
    window.location.href = 'index.html';
  }

  // Accept a token from this tab's own session, OR a "Remember me"
  // token saved in localStorage from a previous visit/page.
  const token = sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken');
  if (!token) {
    goToLogin();
    return;
  }

  // Synchronous-feeling gate: hide the page immediately while we
  // verify, so a flash of real content never shows before the
  // redirect happens for an invalid session.
  document.documentElement.style.visibility = 'hidden';

  // A single verifyToken call is a server-to-server request (this
  // page's backend calling the Auth backend) — on a shaky connection
  // that hop can fail even when the token is genuinely valid, which
  // would otherwise bounce someone back to login for no real reason.
  // One retry after a short pause absorbs that kind of blip; only a
  // second consecutive failure is treated as a real "not logged in".
  function verifyTokenWithRetry(tok, attempt){
    return fetch(AUTH_API_URL + '?action=verifyToken&token=' + encodeURIComponent(tok) + '&callerSecret=' + encodeURIComponent(AUTH_CALLER_SECRET))
      .then(r => r.json())
      .then(data => {
        if (!data.valid && attempt < 2) {
          return new Promise(resolve => setTimeout(resolve, 900)).then(() => verifyTokenWithRetry(tok, attempt + 1));
        }
        return data;
      });
  }

  verifyTokenWithRetry(token, 1)
    .then(data => {
      if (!data.valid) {
        goToLogin();
        return;
      }
      window.LALABELLA_TOKEN = token;
      window.LALABELLA_USER = data.user || null;
      // Keep sessionStorage in sync — this tab's other scripts and
      // any page it navigates to next both read from sessionStorage.
      sessionStorage.setItem('lalabellaToken', token);
      if (data.user) sessionStorage.setItem('lalabellaUser', JSON.stringify(data.user));
      document.documentElement.style.visibility = '';
    })
    .catch(() => {
      // Network hiccup — don't lock the user out over a temporary
      // connection issue; let the page load and its own API calls
      // will surface a clearer error if the token truly is bad.
      window.LALABELLA_TOKEN = token;
      document.documentElement.style.visibility = '';
    });

  // Re-verify whenever the tab regains focus — catches a session
  // that expired or was logged out elsewhere while this tab was in
  // the background.
  let wasHidden = false;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      wasHidden = true;
    } else if (wasHidden) {
      wasHidden = false;
      const t = sessionStorage.getItem('lalabellaToken');
      if (!t) { goToLogin(); return; }
      fetch(AUTH_API_URL + '?action=verifyToken&token=' + encodeURIComponent(t) + '&callerSecret=' + encodeURIComponent(AUTH_CALLER_SECRET))
        .then(r => r.json())
        .then(data => { if (!data.valid) goToLogin(); })
        .catch(() => {});
    }
  });
})();
