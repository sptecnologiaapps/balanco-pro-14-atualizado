(()=>{
  'use strict';

  const state={online:navigator.onLine,firebase:null,auth:null,lastError:null};

  function short(v,max=220){
    const s=String(v??'').replace(/\s+/g,' ').trim();
    return s.length>max?s.slice(0,max-1)+'…':s;
  }

  function errorParts(err){
    return {
      code:short(err?.code||err?.name||'SEM_CODIGO',80),
      message:short(err?.message||err||'Erro sem descrição')
    };
  }

  function render(){
    const box=document.getElementById('firebaseDiagStatus');
    if(!box)return;
    const internet=state.online?'✅ Internet online':'📴 Sem internet';
    const firebase=state.firebase===true?'✅ Firebase conectado':state.firebase===false?'⚠️ Firebase desconectado':'⏳ Firebase verificando';
    const auth=state.auth?'✅ Conta autenticada':'⚠️ Conta não autenticada';
    box.innerHTML='<b>Diagnóstico da nuvem</b><br>'+internet+'<br>'+firebase+'<br>'+auth+
      (state.lastError?'<br><span style="color:#a15c00"><b>Último erro:</b> '+escapeHtml(state.lastError)+'</span>':'');
  }

  window.reportFirebaseError=function(err,origin='Firebase'){
    state.online=navigator.onLine;
    const {code,message}=errorParts(err);
    const text=!state.online
      ?'📴 Sem internet. Os dados continuam salvos neste aparelho.'
      :'⚠️ '+origin+' | '+code+' | '+message;
    state.lastError=text;
    try{console.error('[Balanço PRO] '+origin,{code,message,error:err});}catch(e){}
    const msg=document.getElementById('cloudMsg');
    if(msg)msg.textContent=text;
    render();
    return text;
  };

  function installPanel(){
    const cloud=document.getElementById('cloudBox');
    if(!cloud||document.getElementById('firebaseDiagStatus'))return;
    const wrap=document.createElement('div');
    wrap.style.cssText='margin-top:12px;padding-top:12px;border-top:1px solid #cfe4e1';
    wrap.innerHTML='<div id="firebaseDiagStatus" class="muted"></div>'+ 
      '<button type="button" class="secondary" id="firebaseDiagTest" style="margin-top:10px;width:100%">🔎 Testar conexão Firebase</button>';
    cloud.appendChild(wrap);
    wrap.querySelector('#firebaseDiagTest').addEventListener('click',async()=>{
      state.online=navigator.onLine;
      state.lastError=null;
      render();
      const out=document.getElementById('cloudMsg');
      if(!state.online){
        if(out)out.textContent='📴 Sem internet. O teste do Firebase não pode ser executado agora.';
        return;
      }
      if(typeof cloudUser==='undefined'||!cloudUser){
        state.auth=false;render();
        if(out)out.textContent='⚠️ Conta Firebase não autenticada. Entre na conta antes de testar.';
        return;
      }
      try{
        if(out)out.textContent='Testando leitura no Firebase...';
        await cloudDb.ref(cloudPath()).once('value');
        state.firebase=true;state.auth=true;state.lastError=null;render();
        if(out)out.textContent='✅ Firebase respondeu corretamente. Leitura da nuvem funcionando.';
      }catch(err){
        state.firebase=false;
        window.reportFirebaseError(err,'Teste Firebase');
      }
    });
    render();
  }

  function installFirebaseWatch(){
    try{
      if(typeof auth!=='undefined'){
        state.auth=!!auth.currentUser;
        auth.onAuthStateChanged(user=>{state.auth=!!user;render();});
      }
      if(typeof cloudDb!=='undefined'){
        cloudDb.ref('.info/connected').on('value',snap=>{
          state.firebase=snap.val()===true;
          state.online=navigator.onLine;
          render();
          const msg=document.getElementById('cloudMsg');
          if(!state.online){
            if(msg)msg.textContent='📴 Sem internet. Os dados continuam salvos neste aparelho.';
          }else if(state.firebase && msg && /Sem conexão no momento|Firebase está desconectado/i.test(msg.textContent||'')){
            msg.textContent='☁️ Firebase conectado. Pronto para sincronizar.';
          }else if(state.firebase===false && msg && !state.lastError){
            msg.textContent='⚠️ Internet online, mas o Firebase ainda não conectou.';
          }
        },err=>window.reportFirebaseError(err,'Monitor de conexão Firebase'));
      }
    }catch(err){window.reportFirebaseError(err,'Inicialização do diagnóstico Firebase');}
  }

  window.addEventListener('online',()=>{state.online=true;render();});
  window.addEventListener('offline',()=>{state.online=false;render();});

  function init(){installPanel();installFirebaseWatch();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
