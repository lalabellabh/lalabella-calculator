/* Lalabella Supabase browser client. Public publishable key only. */
(function(){
  'use strict';
  const CONFIG=window.LALABELLA_SUPABASE;
  if(!CONFIG||!CONFIG.url||!CONFIG.publishableKey){console.error('[Lalabella] Supabase configuration is missing.');return;}
  let clientPromise;
  function loadSdk(){
    if(window.supabase&&typeof window.supabase.createClient==='function')return Promise.resolve(window.supabase);
    return new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-lalabella-supabase-sdk]');
      if(existing){existing.addEventListener('load',()=>resolve(window.supabase));existing.addEventListener('error',()=>reject(new Error('Supabase SDK failed to load')));return;}
      const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.min.js';script.async=true;script.dataset.lalabellaSupabaseSdk='true';
      script.onload=()=>window.supabase?resolve(window.supabase):reject(new Error('Supabase SDK is unavailable'));script.onerror=()=>reject(new Error('Supabase SDK failed to load'));document.head.appendChild(script);
    });
  }
  window.LalabellaSupabase={ready(){if(!clientPromise)clientPromise=loadSdk().then(sdk=>sdk.createClient(CONFIG.url,CONFIG.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}));return clientPromise;},async client(){return this.ready();}};
  // Compatibility alias used by migrated pages.
  window.sb=null;
  window.LalabellaSupabase.ready().then(c=>{window.sb=c;}).catch(()=>{});
})();