/**
 * LALABELLA AUTH GUARD — FAST SESSION v2
 *
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

  function getStoredToken() {
    try {
      return sessionStorage.getItem('lalabellaToken') ||
             localStorage.getItem('lalabellaToken') || '';
    } catch (e) {
      return '';
    }
  }

  function getStoredUser() {
    try {
      return sessionStorage.getItem('lalabellaUser') ||
             localStorage.getItem('lalabellaUser') || '';
    } catch (e) {
      return '';
    }
  }

  function saveSession(token, userJson) {
    try {
      sessionStorage.setItem('lalabellaToken', token);
      if (userJson) sessionStorage.setItem('lalabellaUser', userJson);
    } catch (e) {}
  }

  function clearSession() {
    try {
      sessionStorage.removeItem('lalabellaToken');
      sessionStorage.removeItem('lalabellaUser');
      sessionStorage.removeItem(VERIFY_AT_KEY);
      sessionStorage.removeItem(VERIFY_TOKEN_KEY);
    } catch (e) {}
    try {
      localStorage.removeItem('lalabellaToken');
      localStorage.removeItem('lalabellaUser');
      localStorage.removeItem(VERIFY_AT_KEY);
      localStorage.removeItem(VERIFY_TOKEN_KEY);
    } catch (e) {}
  }

  function goToLogin() {
    if (location.pathname.endsWith('/index.html') || location.pathname === '/' || location.pathname === '') {
      return;
    }
    const next = location.pathname.split('/').pop() + location.search;
    location.replace('index.html?next=' + encodeURIComponent(next));
  }

  function setGlobals(token, userJson) {
    window.LALABELLA_TOKEN = token || '';
    try {
      window.LALABELLA_USER = userJson ? JSON.parse(userJson) : null;
    } catch (e) {
      window.LALABELLA_USER = null;
    }
  }

  function isFreshVerification(token) {
    try {
      const at = Number(sessionStorage.getItem(VERIFY_AT_KEY) || 0);
      const verifiedToken = sessionStorage.getItem(VERIFY_TOKEN_KEY) || '';
      return !!token &&
             token === verifiedToken &&
             at > 0 &&
             (Date.now() - at) < VERIFY_CACHE_MS;
    } catch (e) {
      return false;
    }
  }

  function markVerified(token) {
    try {
      sessionStorage.setItem(VERIFY_AT_KEY, String(Date.now()));
      sessionStorage.setItem(VERIFY_TOKEN_KEY, token);
    } catch (e) {}
  }

  async function verifyToken(token) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS) : null;

    try {
      const url = AUTH_API_URL +
        '?action=verifyToken&token=' + encodeURIComponent(token) +
        '&callerSecret=' + encodeURIComponent(AUTH_CALLER_SECRET);

      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });

      const data = await response.json().catch(() => null);

      // Only an explicit server-side invalid result is authoritative.
      // Network errors, malformed responses, and temporary backend
      // failures must NOT destroy a good remembered browser session.
      if (data && data.valid === false) {
        clearSession();
        setGlobals('', '');
        goToLogin();
        return false;
      }

      if (data && data.valid === true) {
        const userJson = data.user ? JSON.stringify(data.user) : getStoredUser();
        saveSession(token, userJson);
        setGlobals(token, userJson);
        markVerified(token);
        return true;
      }

      return true;
    } catch (e) {
      // Keep the session during temporary/network failures.
      return true;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  function tokenizeRequest(input, init) {
    let url = '';
    let options = init ? Object.assign({}, init) : {};

    if (typeof input === 'string') {
      url = input;
    } else if (input && typeof input.url === 'string') {
      url = input.url;
      if (!init) {
        try {
          options = {
            method: input.method,
            headers: new Headers(input.headers),
            body: input.body,
            mode: input.mode,
            credentials: input.credentials,
            cache: input.cache,
            redirect: input.redirect,
            referrer: input.referrer,
            referrerPolicy: input.referrerPolicy,
            integrity: input.integrity,
            keepalive: input.keepalive,
            signal: input.signal
          };
        } catch (e) {
          options = init ? Object.assign({}, init) : {};
        }
      }
    }

    const token = window.LALABELLA_TOKEN || getStoredToken();
    if (!token || !BACKEND_PATTERN.test(url) || url.indexOf(AUTH_API_URL) === 0) {
      return { input, options, changed: false };
    }

    // Do not mutate an already-tokenized URL.
    if (/[?&]token=/.test(url)) {
      return { input, options, changed: false };
    }

    const separator = url.indexOf('?') >= 0 ? '&' : '?';
    url += separator + 'token=' + encodeURIComponent(token);

    // For string URLs, preserve the simple fetch signature.
    if (typeof input === 'string') {
      return { input: url, options, changed: true };
    }

    // Request objects cannot be safely rewritten in-place. Rebuild one
    // while preserving its relevant properties, then let fetch handle it.
    try {
      const rebuilt = new Request(url, input);
      return { input: rebuilt, options: init ? Object.assign({}, init) : undefined, changed: true };
    } catch (e) {
      return { input, options, changed: false };
    }
  }

  // Install one global fetch wrapper so existing pages automatically get
  // the auth token on Google Apps Script API calls without every page
  // having to be edited individually.
  if (!window.__LALABELLA_FETCH_GUARD__) {
    const originalFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      const prepared = tokenizeRequest(input, init);
      return originalFetch(prepared.input, prepared.options);
    };
    window.__LALABELLA_FETCH_GUARD__ = true;
  }

  // Expose a small response helper for pages that want consistent backend
  // error handling without duplicating the same check.
  window.lalabellaCheckResponse = function (data) {
    if (data && data.error) {
      throw new Error(String(data.error));
    }
    return data;
  };

  const token = getStoredToken();

  // No remembered session: redirect immediately.
  if (!token) {
    setGlobals('', '');
    goToLogin();
    return;
  }

  // Restore the remembered session synchronously so the page can start
  // using the token immediately instead of waiting for a network round trip.
  setGlobals(token, getStoredUser());

  // A recent successful verification is enough for this tab/session.
  if (isFreshVerification(token)) {
    return;
  }

  // Verify in the background. The page is already allowed to render;
  // only an explicit valid:false response can invalidate the session.
  verifyToken(token);

  // If the tab was hidden for a while, re-verify when it becomes visible.
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }

    if (!window.LALABELLA_TOKEN) return;

    if (hiddenAt && (Date.now() - hiddenAt) > 60000) {
      hiddenAt = 0;
      verifyToken(window.LALABELLA_TOKEN);
    }
  });
})();
