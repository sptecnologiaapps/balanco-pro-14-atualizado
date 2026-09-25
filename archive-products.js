(()=>{
  'use strict';

  function ensureArchiveStore(){
    if(typeof db==='undefined')return false;
    if(!db.archivedProducts || typeof db.archivedProducts!=='object')db.archivedProducts={};
    if(!db.products || typeof db.products!=='object')db.products={};
    return true;
  }

  function enforceArchiveFence(){
    if(!ensureArchiveStore())return false;
    let changed=false;
    Object.keys(db.archivedProducts).forEach(code=>{
      if(db.products[code]){
        delete db.products[code];
        changed=true;
      }
    });
    if(changed){
      try{
        if(typeof KEY!=='undefined')localStorage.setItem(KEY,JSON.stringify(db));
        if(typeof markPending==='function')markPending(true);
      }catch(e){}
    }
    return changed;
  }

  function productMatches(p,q){
    if(!q)return true;
    const text=[p?.code,p?.altCode,p?.name].map(v=>String(v||'').toLowerCase()).join(' ');
    return text.includes(q);
  }

  function archivedCount(){
    return ensureArchiveStore()?Object.keys(db.archivedProducts).length:0;
  }

  function selectedCodes(){
    return [...document.querySelectorAll('#productTable [data-bulk-code] input:checked')]
      .map(cb=>cb.closest('[data-bulk-code]')?.dataset.bulkCode)
      .filter(Boolean);
  }

  function installArchiveUI(){
    enforceArchiveFence();
    const tools=document.getElementById('bulkProductTools');
    if(!tools)return false;
    if(document.getElementById('archiveSelectedBtn')){
      updateArchiveUI();
      return true;
    }

    const actions=tools.querySelector('#bulkActions');
    const deleteBtn=tools.querySelector('#bulkDeleteBtn');
    const toggle=tools.querySelector('#bulkToggle');
    if(!actions||!deleteBtn||!toggle)return false;

    const archivedToggle=document.createElement('button');
    archivedToggle.id='showArchivedBtn';
    archivedToggle.type='button';
    archivedToggle.className='secondary';
    archivedToggle.style.cssText='display:block;width:100%;padding:12px;margin-top:8px;font-weight:700';
    toggle.insertAdjacentElement('afterend',archivedToggle);

    const archiveBtn=document.createElement('button');
    archiveBtn.id='archiveSelectedBtn';
    archiveBtn.type='button';
    archiveBtn.className='secondary';
    archiveBtn.disabled=true;
    archiveBtn.style.cssText='display:block;width:100%;padding:14px;margin-top:8px;font-weight:700';
    deleteBtn.insertAdjacentElement('beforebegin',archiveBtn);

    const panel=document.createElement('div');
    panel.id='archivedProductsPanel';
    panel.className='hidden';
    panel.style.cssText='margin-top:10px;padding:12px;border:1px solid #d7e3e5;border-radius:12px;background:#f8fbfb';
    tools.insertAdjacentElement('afterend',panel);

    archiveBtn.addEventListener('click',()=>{
      const codes=selectedCodes();
      if(!codes.length)return;
      const n=codes.length;
      if(!confirm('Arquivar '+n+' produto(s)? Eles sairão da busca e do balanço, mas poderão ser restaurados depois.'))return;
      ensureArchiveStore();
      let moved=0;
      codes.forEach(code=>{
        const p=db.products[code];
        if(!p)return;
        db.archivedProducts[code]={...p,archivedAt:new Date().toISOString()};
        delete db.products[code];
        moved++;
      });
      if(typeof save==='function')save();
      const cancel=document.getElementById('bulkCancel');
      if(cancel)cancel.click();
      renderArchivedPanel();
      updateArchiveUI();
      if(typeof toast==='function')toast(moved+' produto(s) arquivado(s)');
    });

    archivedToggle.addEventListener('click',()=>{
      panel.classList.toggle('hidden');
      renderArchivedPanel();
      updateArchiveUI();
    });

    document.addEventListener('change',e=>{
      if(e.target.matches?.('#productTable [data-bulk-code] input'))updateArchiveUI();
    });

    const search=document.getElementById('productSearch');
    if(search)search.addEventListener('input',()=>{
      if(!panel.classList.contains('hidden'))renderArchivedPanel();
    });

    updateArchiveUI();
    return true;
  }

  function updateArchiveUI(){
    const count=archivedCount();
    const toggle=document.getElementById('showArchivedBtn');
    const panel=document.getElementById('archivedProductsPanel');
    if(toggle){
      const open=panel && !panel.classList.contains('hidden');
      toggle.textContent=(open?'📦 Ocultar arquivados':'📦 Ver arquivados')+' ('+count+')';
    }
    const archiveBtn=document.getElementById('archiveSelectedBtn');
    if(archiveBtn){
      const n=selectedCodes().length;
      archiveBtn.disabled=n===0;
      archiveBtn.textContent='📦 Arquivar selecionados ('+n+')';
    }
  }

  function renderArchivedPanel(){
    const panel=document.getElementById('archivedProductsPanel');
    if(!panel||panel.classList.contains('hidden')){updateArchiveUI();return;}
    ensureArchiveStore();
    const q=String(document.getElementById('productSearch')?.value||'').trim().toLowerCase();
    const arr=Object.values(db.archivedProducts)
      .filter(p=>productMatches(p,q))
      .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));

    panel.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">'+
      '<b>📦 Produtos arquivados</b><span class="muted">'+arr.length+' visível(is)</span></div>'+
      '<p class="muted" style="margin:0 0 10px">Arquivados não aparecem na busca normal nem entram em novos balanços. Você pode restaurar quando quiser.</p>'+
      (arr.length?arr.map(p=>'<div style="padding:9px 0;border-top:1px solid #e1eaec">'+
        '<b>'+escapeHtml(p.name||'Produto')+'</b><br><span class="muted">Código: '+escapeHtml(p.code||'—')+' • Alterdata: '+escapeHtml(p.altCode||'—')+'</span>'+
        '<button class="secondary" data-restore-code="'+escapeHtml(p.code)+'" style="display:block;width:100%;margin-top:7px">↩️ Restaurar produto</button></div>').join(''):
        '<div class="empty">Nenhum produto arquivado'+(q?' com esse filtro':'')+'.</div>');

    panel.querySelectorAll('[data-restore-code]').forEach(btn=>btn.addEventListener('click',()=>{
      const code=btn.getAttribute('data-restore-code');
      const p=db.archivedProducts?.[code];
      if(!p)return;
      if(db.products?.[code]){
        if(typeof toast==='function')toast('Este código já está ativo.');
        return;
      }
      const restored={...p};
      delete restored.archivedAt;
      db.products[code]=restored;
      delete db.archivedProducts[code];
      if(typeof save==='function')save();
      renderArchivedPanel();
      updateArchiveUI();
      if(typeof toast==='function')toast('Produto restaurado');
    }));
    updateArchiveUI();
  }

  function wrapRefresh(){
    const original=window.refresh;
    if(typeof original!=='function'||original.__archiveAware)return;
    function archiveAwareRefresh(){
      enforceArchiveFence();
      const result=original.apply(this,arguments);
      setTimeout(()=>{
        installArchiveUI();
        updateArchiveUI();
        const panel=document.getElementById('archivedProductsPanel');
        if(panel&&!panel.classList.contains('hidden'))renderArchivedPanel();
      },0);
      return result;
    }
    archiveAwareRefresh.__archiveAware=true;
    window.refresh=archiveAwareRefresh;
  }

  function init(){
    ensureArchiveStore();
    enforceArchiveFence();
    wrapRefresh();
    let attempts=0;
    const timer=setInterval(()=>{
      attempts++;
      if(installArchiveUI()||attempts>40)clearInterval(timer);
    },100);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();
