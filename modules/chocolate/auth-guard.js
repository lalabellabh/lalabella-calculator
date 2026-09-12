/* Lalabella module compatibility loader. */
(function(){
  document.write('<script src="../../auth-guard.js"><\/script>');
  document.addEventListener('click', function(e){
    const a=e.target&&e.target.closest?e.target.closest('a[href]'):null;
    if(!a) return;
    const raw=a.getAttribute('href')||'';
    if(!raw||raw[0]==='#'||/^(?:[a-z]+:|\/\/)/i.test(raw)) return;
    if(/\.html(?:[?#].*)?$/i.test(raw)) a.setAttribute('href','../../'+raw.replace(/^\.\//,''));
  },true);
})();
