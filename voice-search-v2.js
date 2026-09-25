(()=>{
  'use strict';

  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;

  function norm(v){
    return String(v||'')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\b(gramas?|gr)\b/g,'g')
      .replace(/\b(quilos?|quilogramas?)\b/g,'kg')
      .replace(/\b(unidades?)\b/g,'un')
      .replace(/[^a-z0-9]+/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function compact(v){return norm(v).replace(/\s+/g,'');}

  function levenshtein(a,b){
    a=String(a||'');b=String(b||'');
    if(a===b)return 0;
    if(!a.length)return b.length;
    if(!b.length)return a.length;
    let prev=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){
      const cur=[i];
      for(let j=1;j<=b.length;j++){
        cur[j]=Math.min(
          cur[j-1]+1,
          prev[j]+1,
          prev[j-1]+(a[i-1]===b[j-1]?0:1)
        );
      }
      prev=cur;
    }
    return prev[b.length];
  }

  function similarity(a,b){
    a=compact(a);b=compact(b);
    if(!a||!b)return 0;
    return 1-(levenshtein(a,b)/Math.max(a.length,b.length));
  }

  function isSubsequence(shorter,longer){
    shorter=compact(shorter);longer=compact(longer);
    if(shorter.length<5||shorter.length>=longer.length)return false;
    let i=0;
    for(const ch of longer){if(ch===shorter[i])i++;if(i===shorter.length)return true;}
    return false;
  }

  function fuzzyMatches(query){
    const q=norm(query);
    if(!q||typeof db==='undefined'||!db.products)return [];
    const qTokens=q.split(' ').filter(t=>t.length>=2);

    return Object.values(db.products).map(p=>{
      const name=norm(p.name);
      const code=norm(p.code);
      const alt=norm(p.altCode);
      const nameWords=name.split(' ').filter(Boolean);
      let score=0;

      if(code===q||alt===q)score=100;
      else if(name===q)score=98;
      else if(name.includes(q))score=92;
      else if(qTokens.length&&qTokens.every(t=>name.includes(t)||code.includes(t)||alt.includes(t)))score=86;
      else {
        const qMain=qTokens.filter(t=>t.length>=4);
        for(const token of qMain){
          for(const word of nameWords){
            const sim=similarity(token,word);
            if(sim>=0.78)score=Math.max(score,76+Math.round(sim*10));
            else if(isSubsequence(token,word)||isSubsequence(word,token))score=Math.max(score,74);
          }
        }
        const fullSim=similarity(q,name);
        if(fullSim>=0.76)score=Math.max(score,72+Math.round(fullSim*10));
      }
      return {p,score};
    })
    .filter(x=>x.score>0)
    .sort((a,b)=>b.score-a.score||String(a.p.name||'').localeCompare(String(b.p.name||''),'pt-BR'))
    .slice(0,12);
  }

  function renderVoice(query,candidates=[]){
    const all=[query,...candidates].map(v=>String(v||'').trim()).filter(Boolean);
    let bestQuery=all[0]||'';
    let best=[];
    for(const q of all){
      const r=fuzzyMatches(q);
      if(!best.length||(r[0]?.score||0)>(best[0]?.score||0)){
        bestQuery=q;
        best=r;
      }
    }

    const input=document.getElementById('manualCode');
    const note=document.getElementById('voiceSearchStatus');
    if(input)input.value=bestQuery;
    if(note)note.textContent='Ouvi: “'+bestQuery+'”. Busca aproximada ativada para nomes parecidos.';

    if(best.length&&typeof renderSearchResults==='function'){
      renderSearchResults(best.map(x=>x.p));
      return;
    }

    const box=document.getElementById('searchResults');
    if(box){
      box.classList.remove('hidden');
      box.innerHTML='<div style="padding:12px;border:1px solid #ccd8db;border-radius:12px;background:#f8fbfb"><b>Nenhum produto encontrado por voz.</b><br><span class="muted">Ouvi: '+escapeHtml(bestQuery)+'. Tente falar um pouco mais devagar ou use parte do nome.</span></div>';
    }
  }

  function install(){
    const old=document.getElementById('voiceSearch');
    const note=document.getElementById('voiceSearchStatus');
    if(!old||!note||old.dataset.voiceV2==='1')return false;

    const btn=old.cloneNode(true);
    btn.dataset.voiceV2='1';
    old.replaceWith(btn);

    if(!SpeechRecognition){
      btn.disabled=true;
      btn.textContent='🎙️ Voz indisponível';
      return true;
    }

    let recognition=null;
    let listening=false;
    let finished=false;
    let lastTranscript='';
    let alternatives=[];
    let silenceTimer=null;
    let hardTimer=null;

    function reset(){
      listening=false;
      btn.disabled=false;
      btn.textContent='🎙️ Buscar por voz';
      clearTimeout(silenceTimer);
      clearTimeout(hardTimer);
    }

    function finish(){
      if(finished)return;
      finished=true;
      try{recognition?.stop();}catch(e){}
      const spoken=lastTranscript.trim();
      reset();
      if(spoken)renderVoice(spoken,alternatives);
      else note.textContent='Não consegui entender. Toque no microfone e fale somente o nome do produto.';
    }

    btn.addEventListener('click',()=>{
      if(listening){finish();return;}

      recognition=new SpeechRecognition();
      recognition.lang='pt-BR';
      recognition.interimResults=true;
      recognition.maxAlternatives=3;
      recognition.continuous=true;

      listening=true;
      finished=false;
      lastTranscript='';
      alternatives=[];
      btn.textContent='🛑 Ouvindo...';
      note.textContent='Pode falar com calma. Vou esperar um pouco antes de encerrar.';

      recognition.onresult=e=>{
        const parts=[];
        const alts=[];
        for(let i=0;i<e.results.length;i++){
          const r=e.results[i];
          const top=String(r?.[0]?.transcript||'').trim();
          if(top)parts.push(top);
          for(let j=0;j<Math.min(3,r.length);j++){
            const t=String(r[j]?.transcript||'').trim();
            if(t)alts.push(t);
          }
        }
        lastTranscript=parts.join(' ').trim()||lastTranscript;
        alternatives=[...new Set([...alternatives,...alts])].slice(0,8);
        if(lastTranscript)note.textContent='Ouvindo: “'+lastTranscript+'” …';
        clearTimeout(silenceTimer);
        silenceTimer=setTimeout(finish,1300);
      };

      recognition.onerror=e=>{
        const code=String(e.error||'');
        if(code==='not-allowed'||code==='service-not-allowed')note.textContent='Permita o uso do microfone no navegador para pesquisar por voz.';
        else if(code==='no-speech')note.textContent='Não ouvi nenhuma fala. Tente novamente falando perto do aparelho.';
        else note.textContent='Não foi possível reconhecer a voz. Tente novamente.';
      };

      recognition.onend=()=>{
        if(finished)return;
        if(lastTranscript){setTimeout(finish,450);}
        else reset();
      };

      hardTimer=setTimeout(finish,6500);
      try{recognition.start();}
      catch(e){reset();note.textContent='Não foi possível iniciar o microfone. Tente novamente.';}
    });

    note.textContent='Fale somente o nome do produto. Agora a voz espera um pouco mais e aceita nomes parecidos.';
    return true;
  }

  let attempts=0;
  const timer=setInterval(()=>{
    attempts++;
    if(install()||attempts>40)clearInterval(timer);
  },100);
})();
