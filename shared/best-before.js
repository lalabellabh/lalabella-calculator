/* Best-before helper: the earliest expiry among the in-stock batches of the chocolates in a list.
   lbBB.auto(['Name', ...]) -> Promise<{ value:'YYYY-MM', name:'Chocolate', date:'YYYY-MM-DD' } | null> */
(function(){
  var cache = null;
  function rows(){
    if(!cache){
      cache = fetch(LB_CONFIG.CHOCOLATE_FAST_API + '?action=getEntries&_ts=' + Date.now())
        .then(function(r){ return r.json(); })
        .then(function(a){ return Array.isArray(a) ? a : []; })
        .catch(function(){ cache = null; return []; });
    }
    return cache;
  }
  function day(v){ var m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[1] + '-' + m[2] + '-' + m[3] : ''; }
  window.lbBB = {
    refresh: function(){ cache = null; },
    auto: function(names){
      var want = {}; (names || []).forEach(function(n){ want[String(n).trim().toLowerCase()] = 1; });
      if(!Object.keys(want).length) return Promise.resolve(null);
      return rows().then(function(list){
        var today = new Date().toISOString().slice(0, 10), best = null, bestOld = null;
        list.forEach(function(r){
          var n = String(r['Chocolate Name'] || '').trim().toLowerCase();
          if(!want[n] || !(Number(r['Current Stock']) > 0)) return;
          var d = day(r['Expiry Date']); if(!d) return;
          var hit = { value: d.slice(0, 7), name: r['Chocolate Name'], date: d };
          if(d >= today){ if(!best || d < best.date) best = hit; }
          else if(!bestOld || d < bestOld.date) bestOld = hit;
        });
        return best || bestOld;
      });
    }
  };
})();
