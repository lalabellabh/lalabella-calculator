/**
 * LALABELLA AUTH GUARD — FAST SESSION v4
 * Browser session gate for protected pages.
 * Browser carries only the user's session token.
 */
(function () {
  const AUTH_API_URL = 'https://script.google.com/macros/s/AKfycbxuH9jp_GYVK2VyEEvQiEiXVH58U3RBWV8p7i5Pu7plE1O2cDsFBgdVgEwLiV-On9w/exec';
  const BACKEND_PATTERN = /script\.google\.com\/macros\/s\//;
  const VERIFY_CACHE_MS = 30 * 60 * 1000;
  const VERIFY_TIMEOUT_MS = 8000;
  const VERIFY_AT_KEY = 'lalabellaVerifiedAt';
  const VERIFY_TOKEN_KEY = 'lalabellaVerifiedToken';

  function getToken() {
    try {
      return sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || '';
    } catch (e) { return ''; }
  }

  function getUserRaw() {
    try {
      return sessionStorage.getItem('lalabellaUser') || localStorage.getItem('lalabellaUser') || '';
    } catch (e) { return ''; }
  }

  function setGlobals(token, raw) {
    window.LALABELLA_TOKEN = token || '';
    try { window.LALABELLA_USER = raw ? JSON.parse(raw) : null; }
    catch (e) { window.LALABELLA_USER = null; }
  }

  function saveUser(user) {
    if (!user) return;
    const raw = JSON.stringify(user);
    try {
      sessionStorage.setItem('lalabellaUser', raw);
      localStorage.setItem('lalabellaUser', raw);
    } catch (e) {}
    window.LALABELLA_USER = user;
  }

  function clearSession() {
    ['lalabellaToken','lalabellaUser',VERIFY_AT_KEY,VERIFY_TOKEN_KEY].forEach(function (k) {
      try { sessionStorage.removeItem(k); } catch (e) {}
      try { localStorage.removeItem(k); } catch (e) {}
    });
    window.LALABELLA_TOKEN = '';
    window.LALABELLA_USER = null;
  }

  function goToLogin() {
    clearSession();
    if (location.pathname.endsWith('/index.html') || location.pathname === '/' || location.pathname === '') return;
    const next = location.pathname.split('/').pop() + location.search;
    location.replace('index.html?next=' + encodeURIComponent(next));
  }

  const token = getToken();
  const userRaw = getUserRaw();

  if (!token) {
    setGlobals('', '');
    goToLogin();
    return;
  }

  setGlobals(token, userRaw);

  function isFresh() {
    try {
      const verifiedToken = sessionStorage.getItem(VERIFY_TOKEN_KEY) || localStorage.getItem(VERIFY_TOKEN_KEY) || '';
      const at = Number(sessionStorage.getItem(VERIFY_AT_KEY) || localStorage.getItem(VERIFY_AT_KEY) || 0);
      return verifiedToken === token && at > 0 && Date.now() - at < VERIFY_CACHE_MS;
    } catch (e) { return false; }
  }

  function markVerified() {
    const now = String(Date.now());
    try {
      sessionStorage.setItem(VERIFY_TOKEN_KEY, token);
      sessionStorage.setItem(VERIFY_AT_KEY, now);
      localStorage.setItem(VERIFY_TOKEN_KEY, token);
      localStorage.setItem(VERIFY_AT_KEY, now);
    } catch (e) {}
  }

  const originalFetch = window.fetch.bind(window);

  async function verifyToken() {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, VERIFY_TIMEOUT_MS) : null;
    try {
      const url = AUTH_API_URL + '?action=verifySession&token=' + encodeURIComponent(token);
      const response = await originalFetch(url, {
        method: 'GET', cache: 'no-store', signal: controller ? controller.signal : undefined
      });
      const data = await response.json().catch(function () { return null; });
      if (data && data.valid === false) {
        clearSession();
        goToLogin();
        return false;
      }
      if (data && data.valid === true) {
        saveUser(data.user);
        markVerified();
      }
      return true;
    } catch (e) {
      return true;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  let authResolve;
  window.LALABELLA_AUTH_READY = new Promise(function (resolve) { authResolve = resolve; });

  function prepareRequest(input, init, currentToken) {
    let url = typeof input === 'string' ? input : (input && input.url) || '';
    let nextInput = input;
    let nextInit = init;
    const isBackend = !!currentToken && BACKEND_PATTERN.test(url);
    const isAuth = url.indexOf(AUTH_API_URL) === 0;

    if (isBackend && !isAuth && !/[?&]token=/.test(url)) {
      const sep = url.indexOf('?') >= 0 ? '&' : '?';
      const newUrl = url + sep + 'token=' + encodeURIComponent(currentToken);
      if (typeof input === 'string') nextInput = newUrl;
      else if (input && input.url) {
        try { nextInput = new Request(newUrl, input); } catch (e) {}
      }
    }

    if (isBackend && !isAuth && nextInit && typeof nextInit.body === 'string') {
      let body = nextInit.body;
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === 'object') {
          parsed.token = currentToken;
          body = JSON.stringify(parsed);
        }
      } catch (e) {
        if (!/[?&]token=/.test(body)) body += (body ? '&' : '') + 'token=' + encodeURIComponent(currentToken);
      }
      nextInit = Object.assign({}, nextInit, { body: body });
    } else if (isBackend && !isAuth && nextInit && nextInit.body instanceof URLSearchParams && !nextInit.body.has('token')) {
      const params = new URLSearchParams(nextInit.body);
      params.append('token', currentToken);
      nextInit = Object.assign({}, nextInit, { body: params });
    }

    return { input: nextInput, init: nextInit, isBackend: isBackend, isAuth: isAuth };
  }

  if (!window.__LALABELLA_FETCH_GUARD__) {
    window.fetch = function (input, init) {
      const currentToken = window.LALABELLA_TOKEN || getToken();
      const prepared = prepareRequest(input, init, currentToken);
      const send = function () { return originalFetch(prepared.input, prepared.init); };
      if (prepared.isBackend && !prepared.isAuth) return window.LALABELLA_AUTH_READY.then(send);
      return send();
    };
    window.__LALABELLA_FETCH_GUARD__ = true;
  }

  window.lalabellaCheckResponse = function (data) {
    if (data && typeof data === 'object' && !Array.isArray(data) && data.error) throw new Error(String(data.error));
    return data;
  };

  if (isFresh()) {
    authResolve(true);
    authResolve = null;
  } else {
    verifyToken().then(function () {
      if (authResolve) { authResolve(true); authResolve = null; }
    }).catch(function () {
      if (authResolve) { authResolve(true); authResolve = null; }
    });
  }

  let hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > 60000 && window.LALABELLA_TOKEN) {
      hiddenAt = 0;
      verifyToken();
    }
  });
})();
