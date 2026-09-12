/* Lalabella module compatibility loader.
 * Keeps relocated module pages compatible with the existing root application.
 */
(function(){
  /* Load the real root auth guard before the rest of the module parses. */
  document.write('<script src="../../auth-guard.js"><\/script>');
  /* The copied pages still use the original root-relative URL assumptions. */
  document.write('<base href="../../">');

  function normalizeLink(a){
    if(!a) return;
    const raw=a.getAttribute('href') || '';
    if(!raw || raw[0]==='#' || /^(?:[a-z]+:|\/\/)/i.test(raw)) return;
    try{
      const resolved=new URL(raw, document.baseURI);
      if(resolved.origin===location.origin && /\.html(?:$|[?#])/i.test(resolved.pathname)){
        a.setAttribute('href', resolved.href);
      }
    }catch(_){ }
  }

  document.addEventListener('click', function(e){
    const a=e.target && e.target.closest ? e.target.closest('a[href]') : null;
    normalizeLink(a);
  }, true);

  /* Some module pages open their active <a> from a keyboard handler. */
  document.addEventListener('keydown', function(e){
    if(e.key!=='Enter') return;
    const active=document.querySelector('a.tool.active, a[aria-current="page"], a:focus');
    normalizeLink(active);
  }, true);

  document.addEventListener('DOMContentLoaded', function(){
    document.querySelectorAll('a[href]').forEach(normalizeLink);
    document.querySelectorAll('[onclick]').forEach(function(el){
      const raw=el.getAttribute('onclick') || '';
      if(raw.includes("window.location.href='index.html'") || raw.includes('window.location.href="index.html"')){
        el.setAttribute('onclick', raw
          .replace("window.location.href='index.html'", "window.location.href=new URL('index.html',document.baseURI).href")
          .replace('window.location.href="index.html"', "window.location.href=new URL('index.html',document.baseURI).href"));
      }
    });
  });
})();
