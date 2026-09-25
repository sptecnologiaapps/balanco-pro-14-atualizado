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

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installVoiceSearch);
  else installVoiceSearch();
})();
