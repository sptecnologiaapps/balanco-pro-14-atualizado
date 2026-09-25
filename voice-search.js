(()=>{
  'use strict';

  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;

  function normalizeText(value){
    return String(value||'')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\b(gramas?|gr)\b/g,'g')
      .replace(/\b(quilos?|quilogramas?)\b/g,'kg')
      .replace(/\b(unidades?)\b/g,'un')
      .replace(/[^a-z0-9]+/g,' ')
      .trim();
  }

  function voiceMatches(query){
    const q=normalizeText(query);
    if(!q||typeof db==='undefined'||!db.products)return [];
    const tokens=q.split(/\s+/).filter(Boolean);
    return Object.values(db.products)
      .map(p=>{
        const name=normalizeText(p.name);
        const code=normalizeText(p.code);
        const alt=normalizeText(p.altCode);
        let score=0;
        if(code===q||alt===q)score=100;
        else if(name===q)score=90;
        else if(name.includes(q))score=80;
        else if(tokens.length&&tokens.every(t=>name.includes(t)||code.includes(t)||alt.includes(t)))score=70;
        else if(tokens.length>1){
          const hits=tokens.filter(t=>name.includes(t)||code.includes(t)||alt.includes(t)).length;
          if(hits>=Math.ceil(tokens.length*.7))score=50+hits;
        }
        return {p,score};
      })
      .filter(x=>x.score>0)
      .sort((a,b)=>b.score-a.score||String(a.p.name||'').localeCompare(String(b.p.name||''),'pt-BR'))
      .slice(0,12)
      .map(x=>x.p);
  }

  function showNoVoiceResult(query){
    const box=document.getElementById('searchResults');
    if(!box)return;
    box.classList.remove('hidden');
    box.innerHTML='<div style="padding:12px;border:1px solid #ccd8db;border-radius:12px;background:#f8fbfb"><b>Nenhum produto encontrado por voz.</b><br><span class="muted">Ouvi: '+escapeHtml(query)+'. Tente falar novamente ou use a pesquisa manual.</span></div>';
  }

  function runVoiceSearch(query){
    const input=document.getElementById('manualCode');
    if(input)input.value=query;
    const results=voiceMatches(query);
    if(results.length&&typeof renderSearchResults==='function')renderSearchResults(results);
    else showNoVoiceResult(query);
  }

  function installProductConfirmation(){
    const original=window.renderSearchResults;
    if(typeof original!=='function'||original.__largeConfirmProduct)return;

    function enhancedRenderSearchResults(results){
      const input=document.getElementById('manualCode');
      const q=String(input?.value||'').trim();
      const list=Array.isArray(results)?results:[];
      const exact=list.filter(p=>String(p?.code||'').trim()===q||String(p?.altCode||'').trim()===q);

      if(q&&exact.length===1){
        const p=exact[0];
        const box=document.getElementById('searchResults');
        if(!box)return original(results);
        box.classList.remove('hidden');
        box.innerHTML='<div style="padding:14px;border:1px solid #cfe4e1;border-radius:14px;background:#f5fbfa">'+
          '<div class="muted" style="margin-bottom:4px">Produto encontrado pelo código informado</div>'+
          '<b style="font-size:18px">'+escapeHtml(p.name||'Produto')+'</b><br>'+
          '<span class="muted">Código interno: '+escapeHtml(p.code||'—')+' • Alterdata: '+escapeHtml(p.altCode||'—')+'</span>'+
          '<button class="primary" id="confirmExactProduct" style="display:block;width:100%;font-size:18px;padding:16px;margin-top:14px">✅ CONFIRMAR PRODUTO</button>'+
          '</div>';
        const confirmBtn=document.getElementById('confirmExactProduct');
        confirmBtn.onclick=()=>{
          if(typeof showCurrent==='function')showCurrent(p,db.counts[p.code]||0);
          box.classList.add('hidden');
          box.innerHTML='';
          if(input)input.value='';
          if(typeof toast==='function')toast('Produto confirmado');
        };
        return;
      }

      return original(results);
    }

    enhancedRenderSearchResults.__largeConfirmProduct=true;
    window.renderSearchResults=enhancedRenderSearchResults;
  }

  function installCurrentConfirmButton(){
    const current=document.getElementById('current');
    if(!current)return;

    const ensureButton=()=>{
      if(current.classList.contains('hidden')||!current.innerHTML.trim())return;
      if(current.querySelector('#finishCurrentProduct'))return;
      const btn=document.createElement('button');
      btn.id='finishCurrentProduct';
      btn.type='button';
      btn.className='primary';
      btn.style.cssText='display:block;width:100%;font-size:18px;padding:16px;margin-top:14px';
      btn.textContent='✅ CONFIRMAR PRODUTO';
      btn.addEventListener('click',()=>{
        current.classList.add('hidden');
        current.innerHTML='';
        const input=document.getElementById('manualCode');
        if(input){input.value='';input.focus();}
        const results=document.getElementById('searchResults');
        if(results){results.classList.add('hidden');results.innerHTML='';}
        if(typeof toast==='function')toast('Produto confirmado • pronto para o próximo');
      });
      current.appendChild(btn);
    };

    new MutationObserver(ensureButton).observe(current,{childList:true,subtree:false,attributes:true,attributeFilter:['class']});
    ensureButton();
  }

  function installBulkDelete(){
    const table=document.getElementById('productTable');
    const search=document.getElementById('productSearch');
    if(!table||!search||document.getElementById('bulkProductTools'))return;

    let bulkMode=false;
    const selected=new Set();

    const tools=document.createElement('div');
    tools.id='bulkProductTools';
    tools.style.cssText='margin:10px 0 12px';
    tools.innerHTML='<button class="secondary" id="bulkToggle" style="width:100%;padding:13px;font-weight:700">☑️ Selecionar vários</button>'+
      '<div id="bulkActions" class="hidden" style="margin-top:8px">'+
      '<div class="row"><button class="secondary" id="bulkSelectAll">☑️ Selecionar todos visíveis</button><button class="secondary" id="bulkCancel">Cancelar seleção</button></div>'+
      '<button class="danger" id="bulkDeleteBtn" disabled style="display:block;width:100%;padding:14px;margin-top:8px;font-weight:700">🗑️ Excluir selecionados (0)</button>'+
      '<p class="muted" style="margin:8px 0 0">A exclusão em lote remove os cadastros escolhidos. Contagens já registradas são preservadas.</p>'+
      '</div>';
    table.parentElement.insertBefore(tools,table);

    const toggle=tools.querySelector('#bulkToggle');
    const actions=tools.querySelector('#bulkActions');
    const selectAll=tools.querySelector('#bulkSelectAll');
    const cancel=tools.querySelector('#bulkCancel');
    const delBtn=tools.querySelector('#bulkDeleteBtn');

    function updateDeleteButton(){
      delBtn.disabled=selected.size===0;
      delBtn.textContent='🗑️ Excluir selecionados ('+selected.size+')';
    }

    function visibleCodes(){
      return [...table.querySelectorAll('[data-delete-code]')].map(b=>b.getAttribute('data-delete-code')).filter(Boolean);
    }

    function decorateRows(){
      const deleteButtons=[...table.querySelectorAll('[data-delete-code]')];
      deleteButtons.forEach(del=>{
        const code=del.getAttribute('data-delete-code');
        const row=del.parentElement?.parentElement;
        if(!row||row.querySelector('[data-bulk-code="'+CSS.escape(code)+'"]'))return;
        const label=document.createElement('label');
        label.dataset.bulkCode=code;
        label.style.cssText='display:none;align-items:center;gap:10px;padding:8px 10px;margin-bottom:8px;border:1px solid #cfe4e1;border-radius:10px;background:#f5fbfa;font-weight:700';
        label.innerHTML='<input type="checkbox" style="width:22px;height:22px;min-width:22px" '+(selected.has(code)?'checked':'')+'> Selecionar este produto';
        const cb=label.querySelector('input');
        cb.addEventListener('change',()=>{if(cb.checked)selected.add(code);else selected.delete(code);updateDeleteButton();});
        row.insertBefore(label,row.firstChild);
      });
      table.querySelectorAll('[data-bulk-code]').forEach(label=>label.style.display=bulkMode?'flex':'none');
      updateDeleteButton();
    }

    function setBulkMode(value){
      bulkMode=!!value;
      toggle.textContent=bulkMode?'☑️ Modo seleção ativo':'☑️ Selecionar vários';
      actions.classList.toggle('hidden',!bulkMode);
      if(!bulkMode)selected.clear();
      decorateRows();
    }

    toggle.addEventListener('click',()=>setBulkMode(!bulkMode));
    cancel.addEventListener('click',()=>setBulkMode(false));
    selectAll.addEventListener('click',()=>{
      const codes=visibleCodes();
      const allSelected=codes.length&&codes.every(c=>selected.has(c));
      codes.forEach(c=>{if(allSelected)selected.delete(c);else selected.add(c);});
      table.querySelectorAll('[data-bulk-code] input').forEach(cb=>{const code=cb.closest('[data-bulk-code]').dataset.bulkCode;cb.checked=selected.has(code);});
      updateDeleteButton();
    });
    delBtn.addEventListener('click',()=>{
      if(!selected.size)return;
      const n=selected.size;
      if(!confirm('Excluir '+n+' cadastro(s) de produto de uma vez? As contagens já registradas serão mantidas.'))return;
      selected.forEach(code=>{if(db.products?.[code])delete db.products[code];});
      selected.clear();
      setBulkMode(false);
      if(typeof save==='function')save();
      if(typeof toast==='function')toast(n+' produto(s) excluído(s)');
    });

    const observer=new MutationObserver(()=>decorateRows());
    observer.observe(table,{childList:true,subtree:true});
    search.addEventListener('input',()=>setTimeout(decorateRows,0));
    decorateRows();
  }

  function installVoiceSearch(){
    const input=document.getElementById('manualCode');
    const searchBtn=document.getElementById('readManual');
    if(!input||!searchBtn||document.getElementById('voiceSearch'))return;

    const voiceBtn=document.createElement('button');
    voiceBtn.id='voiceSearch';
    voiceBtn.type='button';
    voiceBtn.className='secondary';
    voiceBtn.textContent='🎙️ Buscar por voz';
    voiceBtn.setAttribute('aria-label','Buscar produto por voz');
    searchBtn.insertAdjacentElement('afterend',voiceBtn);

    const note=document.createElement('p');
    note.id='voiceSearchStatus';
    note.className='muted';
    note.style.margin='8px 0 0';
    note.textContent='Fale somente o nome do produto. A voz apenas pesquisa; não altera quantidades.';
    searchBtn.parentElement.insertAdjacentElement('afterend',note);

    if(!SpeechRecognition){
      voiceBtn.disabled=true;
      voiceBtn.textContent='🎙️ Voz indisponível';
      note.textContent='Este navegador não oferece reconhecimento de voz. O leitor e a pesquisa manual continuam funcionando normalmente.';
      return;
    }

    let recognition=null;
    let listening=false;

    function resetButton(){
      listening=false;
      voiceBtn.disabled=false;
      voiceBtn.textContent='🎙️ Buscar por voz';
    }

    voiceBtn.addEventListener('click',()=>{
      if(listening&&recognition){try{recognition.stop();}catch(e){}return;}
      recognition=new SpeechRecognition();
      recognition.lang='pt-BR';
      recognition.interimResults=false;
      recognition.maxAlternatives=1;
      recognition.continuous=false;
      listening=true;
      voiceBtn.textContent='🛑 Ouvindo...';
      note.textContent='Pode falar o nome do produto.';

      recognition.onresult=e=>{
        const spoken=String(e.results?.[0]?.[0]?.transcript||'').trim();
        if(!spoken){note.textContent='Não consegui entender. Tente novamente.';return;}
        note.textContent='Ouvi: “'+spoken+'”. Mostrando resultados.';
        runVoiceSearch(spoken);
      };
      recognition.onerror=e=>{
        const code=String(e.error||'');
        if(code==='not-allowed'||code==='service-not-allowed')note.textContent='Permita o uso do microfone no navegador para pesquisar por voz.';
        else if(code==='no-speech')note.textContent='Não ouvi nenhuma fala. Toque no microfone e tente novamente.';
        else note.textContent='Não foi possível reconhecer a voz. Use a pesquisa manual ou tente novamente.';
      };
      recognition.onend=resetButton;

      try{recognition.start();}
      catch(e){resetButton();note.textContent='Não foi possível iniciar o microfone. Tente novamente.';}
    });
  }

  function installEnhancements(){
    installProductConfirmation();
    installCurrentConfirmButton();
    installBulkDelete();
    installVoiceSearch();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installEnhancements);
  else installEnhancements();
})();
