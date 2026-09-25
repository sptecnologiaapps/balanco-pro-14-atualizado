(()=>{
  'use strict';

  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('#finishCurrentProduct');
    if(!btn)return;

    // O Confirmar passa a ser o responsável por gravar a quantidade digitada.
    // Bloqueia o comportamento antigo para não fechar a ficha antes de salvar.
    e.preventDefault();
    e.stopImmediatePropagation();

    const current=document.getElementById('current');
    const qtyInput=current?.querySelector('#editQty');
    if(!current||!qtyInput)return;

    const codeLine=[...current.querySelectorAll('.muted')]
      .map(el=>String(el.textContent||'').trim())
      .find(text=>text.startsWith('Código:'))||'';
    const code=codeLine.replace(/^Código:\s*/,'').trim();
    const value=String(qtyInput.value??'').trim();
    const n=Math.max(0,Math.floor(Number(value)));

    if(!code){
      if(typeof toast==='function')toast('Não consegui identificar o produto. Tente novamente.');
      return;
    }
    if(value===''||!Number.isFinite(n)){
      if(typeof toast==='function')toast('Informe uma quantidade válida.');
      qtyInput.focus();
      return;
    }

    if(n===0) delete db.counts[code];
    else db.counts[code]=n;

    if(n>0&&Array.isArray(db.history)&&!db.history.some(h=>String(h.code)===code)){
      db.history.unshift({code,time:new Date().toLocaleString('pt-BR')});
      db.history=db.history.slice(0,50);
    }

    if(typeof save==='function')save();

    current.classList.add('hidden');
    current.innerHTML='';
    const input=document.getElementById('manualCode');
    if(input){input.value='';input.focus();}
    const results=document.getElementById('searchResults');
    if(results){results.classList.add('hidden');results.innerHTML='';}
    if(typeof toast==='function')toast('Produto confirmado: '+n+' unidade(s)');
  },true);
})();
