(()=>{
  'use strict';

  const state={online:navigator.onLine,firebase:null,auth:null,lastError:null};
  const SAFE_PREFIX='~fb~';
  const FORBIDDEN=/[.#$\/\[\]]/;

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

  function encodeKey(key){
    key=String(key);
    if(!FORBIDDEN.test(key)&&!key.startsWith(SAFE_PREFIX))return key;
    const bytes=new TextEncoder().encode(key);
    let bin='';
    bytes.forEach(b=>bin+=String.fromCharCode(b));
    return SAFE_PREFIX+btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  function decodeKey(key){
    key=String(key);
    if(!key.startsWith(SAFE_PREFIX))return key;
    try{
      let b64=key.slice(SAFE_PREFIX.length).replace(/-/g,'+').replace(/_/g,'/');
      while(b64.length%4)b64+='=';
      const bin=atob(b64);
      const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }catch(e){return key;}
  }

  function encodeKeys(value){
    if(Array.isArray(value))return value.map(encodeKeys);
    if(value&&typeof value==='object'){
      const out={};
      Object.entries(value).forEach(([k,v])=>{out[encodeKey(k)]=encodeKeys(v);});
      return out;
    }
    return value;
  }

  function decodeKeys(value){
    if(Array.isArray(value))return value.map(decodeKeys);
    if(value&&typeof value==='object'){
      const out={};
      Object.entries(value).forEach(([k,v])=>{out[decodeKey(k)]=decodeKeys(v);});
      return out;
    }
    return value;
  }

  function safePayload(){
    return {db:encodeKeys(db),updatedAt:localUpdatedAt,keyFormat:'safe-v1'};
  }

  function render(){
    const box=document.getElementById('firebaseDiagStatus');
    if(!box)return;
    const internet=state.online?'✅ Internet online':'📴 Sem internet';
    const firebase=state.firebase===true?'✅ Firebase conectado':state.firebase===false?'⚠️ Firebase desconectado':'⏳ Firebase verificando';
    const authOk=state.auth?'✅ Conta autenticada':'⚠️ Conta não autenticada';
    box.innerHTML='<b>Diagnóstico da nuvem</b><br>'+internet+'<br>'+firebase+'<br>'+authOk+
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

  window.reportFirebaseSuccess=function(text){
    state.online=navigator.onLine;
    state.firebase=true;
    state.auth=!!cloudUser;
    state.lastError=null;
    const msg=document.getElementById('cloudMsg');
    if(msg)msg.textContent=text||'✅ Firebase sincronizado.';
    render();
  };

  async function safeCloudSaveV2(){
    if(!cloudUser)return;
    try{
      setCloudMsg('Verificando alterações na nuvem...');
      const ref=cloudDb.ref(cloudPath());
      const result=await ref.transaction(current=>{
        if(current&&Number(current.updatedAt||0)>localUpdatedAt)return;
        return safePayload();
      });
      if(result.committed){
        markPending(false);
        window.reportFirebaseSuccess('✅ Sincronizado automaticamente.');
      }else{
        const latest=result.snapshot.val();
        if(latest&&latest.db){
          localSafetyBackup();
          db=decodeKeys(latest.db);
          localUpdatedAt=Number(latest.updatedAt||Date.now());
          localStorage.setItem(KEY,JSON.stringify(db));
          localStorage.setItem(KEY+'_updatedAt',String(localUpdatedAt));
          markPending(false);
          refresh();
          window.reportFirebaseSuccess('✅ A nuvem tinha dados mais recentes; eles foram carregados neste aparelho.');
        }
      }
    }catch(err){
      markPending(true);
      window.reportFirebaseError(err,'Sincronização automática');
    }
  }

  async function syncCloudV2(){
    if(!cloudUser)return setCloudMsg('Entre na conta Firebase primeiro.');
    setCloudMsg('Sincronizando...');
    try{
      const snap=await cloudDb.ref(cloudPath()).once('value');
      const cloud=snap.val();
      if(!cloud){
        if(!hasData(db)){
          markPending(false);
          setCloudMsg('Não há dados na nuvem para receber. Abra o aparelho que contém os produtos e sincronize por ele.');
          return;
        }
        await cloudDb.ref(cloudPath()).set(safePayload());
        markPending(false);
        window.reportFirebaseSuccess('✅ Dados deste aparelho enviados para a nuvem.');
        return;
      }

      const cloudDbDecoded=cloud.db?decodeKeys(cloud.db):null;
      const cloudTime=Number(cloud.updatedAt||0);
      if((!hasData(db)&&hasData(cloudDbDecoded))||(cloudTime>localUpdatedAt&&cloudDbDecoded)){
        localSafetyBackup();
        db=cloudDbDecoded;
        localUpdatedAt=cloudTime;
        localStorage.setItem(KEY,JSON.stringify(db));
        localStorage.setItem(KEY+'_updatedAt',String(localUpdatedAt));
        markPending(false);
        refresh();
        window.reportFirebaseSuccess('✅ Dados mais recentes da nuvem carregados neste aparelho.');
      }else if(hasData(db)){
        const result=await cloudDb.ref(cloudPath()).transaction(current=>{
          if(current&&Number(current.updatedAt||0)>localUpdatedAt)return;
          return safePayload();
        });
        if(result.committed){
          markPending(false);
          window.reportFirebaseSuccess('✅ Dados deste aparelho enviados para a nuvem.');
        }else{
          const latest=result.snapshot.val();
          if(latest&&latest.db){
            localSafetyBackup();
            db=decodeKeys(latest.db);
            localUpdatedAt=Number(latest.updatedAt||Date.now());
            localStorage.setItem(KEY,JSON.stringify(db));
            localStorage.setItem(KEY+'_updatedAt',String(localUpdatedAt));
            markPending(false);
            refresh();
            window.reportFirebaseSuccess('✅ A nuvem tinha dados mais recentes; eles foram carregados neste aparelho.');
          }
        }
      }else{
        markPending(false);
        setCloudMsg('A nuvem não possui produtos para receber. Nenhum dado foi apagado.');
      }
    }catch(err){
      markPending(true);
      window.reportFirebaseError(err,'Sincronização Firebase');
    }
  }

  try{window.cloudPayload=safePayload;}catch(e){}
  try{window.safeCloudSave=safeCloudSaveV2;}catch(e){}
  try{window.syncCloud=syncCloudV2;}catch(e){}

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
        if(out)out.textContent='Testando leitura e gravação segura no Firebase...';
        await cloudDb.ref(cloudPath()).once('value');
        await safeCloudSaveV2();
        state.firebase=true;state.auth=true;state.lastError=null;render();
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
          }else if(state.firebase&&msg&&/Sem conexão no momento|Firebase está desconectado/i.test(msg.textContent||'')){
            msg.textContent='☁️ Firebase conectado. Pronto para sincronizar.';
          }else if(state.firebase===false&&msg&&!state.lastError){
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
