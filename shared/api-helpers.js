/**
 * LALABELLA SHARED HELPERS
 * Common frontend JS patterns copy-pasted across multiple pages
 * (currency formatting, date formatting, simple fetch-and-parse).
 * This does NOT replace auth-guard.js — that stays exactly as-is and
 * still owns auth/token logic. This file is purely for the small
 * utility functions that keep getting re-written per page.
 *
 * HOW TO ADOPT (safe, one page at a time):
 * 1. Add this AFTER auth-guard.js in a page's <head>:
 *      <script src="shared/api-helpers.js"></script>
 * 2. In that page's own <script>, DELETE any local fmtBD/fmtDate/
 *    loadJSON function that duplicates one below, and call the
 *    shared version instead (same function names, same behavior —
 *    nothing else in the page needs to change).
 * 3. Test before moving to the next page.
 *
 * Nothing currently calls these functions until a page is updated to
 * include this file — adding it changes nothing on its own.
 */

/**
 * Formats a number as Bahraini Dinar currency, matching the exact
 * pattern already used independently in chocolate-calc.html,
 * initial-stock.html, and others: 3 decimal places + " BD" suffix.
 */
function fmtBD(n){
  return Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  }) + ' BD';
}

/**
 * Formats a date as "DD Mon YYYY" (e.g. "09 Sep 2026"), matching the
 * pattern already used independently across several pages. Returns
 * an em dash for empty/invalid input rather than "Invalid Date".
 */
function fmtDate(d){
  if(!d) return '—';
  const dt = new Date(d);
  if(isNaN(dt)) return String(d);
  return dt.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

/**
 * Fetches a URL and parses it as JSON, passing the result through
 * lalabellaCheckResponse() (from auth-guard.js) so a backend
 * {error: "..."} response throws a clear, specific error instead of
 * silently becoming malformed data that crashes a later .map()/
 * .filter() call. Requires auth-guard.js to already be loaded on the
 * page (for both the token-attaching fetch wrapper and
 * lalabellaCheckResponse itself).
 *
 * Usage: const items = await loadJSON(API_URL + '?action=getItems');
 */
async function loadJSON(url){
  const res = await fetch(url);
  const data = await res.json();
  return typeof lalabellaCheckResponse === 'function' ? lalabellaCheckResponse(data) : data;
}

/**
 * Cache-busting timestamp helper — every page independently does
 * `'&_ts=' + Date.now()` inline; this just names the pattern so new
 * code can call `cacheBust()` instead of re-deriving it.
 */
function cacheBust(){
  return Date.now();
}
