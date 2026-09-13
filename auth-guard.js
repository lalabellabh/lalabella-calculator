/* Lalabella Supabase session guard. No Google Apps Script auth. */
(function(){
  'use strict';
  const here=location.pathname.split('/').pop()||'index.html';
  const publicPages=new Set(['login.html','index.html']);
  const login='login.html';
  document.documentElement.style.visibility='hidden';
  function load(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('Failed to load '+src));document.head.appendChild(s);});}
  async function boot(){
    try{
      if(!window.LALABELLA_SUPABASE) await load('supabase-config.js');
      if(!window.LalabellaSupabase) await load('supabase-client.js');
      if(!window.LalabellaAuth) await load('supabase-auth.js');
      const user=await window.LalabellaAuth.getUser();
      if(!user && !publicPages.has(here)){location.replace(login);return;}
      if(user){
        const profile=await window.LalabellaAuth.getProfile();
        if(!profile && !publicPages.has(here)){location.replace(login);return;}
        window.LALABELLA_USER=user;
        window.LALABELLA_PROFILE=profile||null;
        // NOVA compatibility bridge: the legacy NOVA UI still calls its old
        // URL internally. Redirect that request to the Supabase Edge Function
        // while preserving the existing Joyboy interface and voice behavior.
        if(here==='nova-command-center.html'){
          const originalFetch=window.fetch.bind(window);
          window.fetch=async function(input,init){
            const url=typeof input==='string'?input:(input&&input.url)||'';
            if(/script\\.google\\.com\\/macros\\/s\\//.test(url)){
              const sessionResult=await window.LalabellaAuth.getSession();
              const accessToken=sessionResult&&sessionResult.data&&sessionResult.data.session&&sessionResult.data.session.access_token;
              if(!accessToken) throw new Error('Supabase session expired. Please log in again.');
              const body=typeof init?.body==='string'?JSON.parse(init.body||'{}'):{};
              const endpoint=window.LALABELLA_SUPABASE.url+'/functions/v1/nova-api';
              return originalFetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+accessToken},body:JSON.stringify({message:body.message||new URL(url).searchParams.get('message')||'',session:body.session||{},context:body.context||{page:'NOVA Command Center',app:'Flower Tools'}}),signal:init?.signal});
            }
            return originalFetch(input,init);
          };
        }
      }
      document.documentElement.style.visibility='';
    }catch(e){
      console.error('[Lalabella] auth guard failed',e);
      if(!publicPages.has(here)) location.replace(login); else document.documentElement.style.visibility='';
    }
  }
  boot();
})();

function lalabellaCheckResponse(data){
  if(data&&typeof data==='object'&&!Array.isArray(data)&&'error' in data)throw new Error(data.error||'Unknown server error');
  return data;
}
(function(){
  try{
    const pending=sessionStorage.getItem('joyboyPendingSpeech');
    if(pending){sessionStorage.removeItem('joyboyPendingSpeech');window.addEventListener('load',()=>{try{speechSynthesis.speak(new SpeechSynthesisUtterance(pending));}catch(e){}});}
  }catch(e){}
})();