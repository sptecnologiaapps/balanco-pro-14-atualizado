(()=>{
  'use strict';

  function parseImplied2(raw){
    const s=String(raw||'').trim();
    if(!s)return null;
    if(/[.,]/.test(s)){
      const n=Number(s.replace(/\./g,'').replace(',','.'));
      return Number.isFinite(n)?n:null;
    }
    if(!/^-?\d+$/.test(s))return null;
    const n=Number(s);
    return Number.isFinite(n)?n/100:null;
  }

  function findExistingKey(store,alterCode){
    if(!store||typeof store!=='object')return null;
    if(store[alterCode])return alterCode;
    return Object.keys(store).find(k=>String(store[k]?.altCode||'').trim()===alterCode)||null;
  }

  function parseFixedLine(line){
    const raw=String(line||'').replace(/\r$/,'');
    if(!raw.trim())return null;

    // Layout oficial validado em 25/09/2026:
    // 20 Código Principal + 80 Nome do Produto + 20 Qt. Estoque (2 casas decimais implícitas).
    if(raw.length>=101){
      const code=raw.slice(0,20).trim();
      const name=raw.slice(20,100).trim();
      const qtyRaw=raw.slice(100,120).trim();
      const stock=parseImplied2(qtyRaw);
      if(code&&name&&stock!==null)return {code,name,stock,kind:'fixed120'};
    }

    // Compatibilidade com o layout antigo: 6 dígitos no início e descrição.
    const m=raw.match(/^(\d{6})/);
    if(m){
      const code=m[1];
      const name=(raw.slice(18).trim()||raw.slice(6).trim());
      if(name)return {code,name,stock:null,kind:'legacy'};
    }
    return null;
  }

  async function importAlterdataFile(file,msg){
    msg.textContent='Lendo arquivo do Alterdata...';
    let text='';
    try{text=await file.text();}
    catch(e){msg.textContent='Não foi possível ler o arquivo.';return;}

    const lines=text.split(/\n/);
    const seen=new Map();
    let valid=0, duplicates=0, conflicts=0, archived=0, activeUpdated=0, created=0, ignored=0, withStock=0;

    if(typeof db==='undefined' || !db){msg.textContent='Banco local indisponível.';return;}
    if(!db.products||typeof db.products!=='object')db.products={};
    if(!db.archivedProducts||typeof db.archivedProducts!=='object')db.archivedProducts={};

    for(const line of lines){
      const item=parseFixedLine(line);
      if(!item){if(String(line||'').trim())ignored++;continue;}
      valid++;
      if(item.stock!==null)withStock++;

      const prior=seen.get(item.code);
      if(prior){
        if(prior.name===item.name && prior.stock===item.stock)duplicates++;
        else conflicts++;
        continue;
      }
      seen.set(item.code,item);

      const archivedKey=findExistingKey(db.archivedProducts,item.code);
      if(archivedKey){
        const old=db.archivedProducts[archivedKey]||{};
        db.archivedProducts[archivedKey]={...old,name:item.name,stock:item.stock,alterdataCode:item.code};
        archived++;
        continue;
      }

      const activeKey=findExistingKey(db.products,item.code);
      if(activeKey){
        const old=db.products[activeKey]||{};
        db.products[activeKey]={...old,name:item.name,stock:item.stock,alterdataCode:item.code};
        activeUpdated++;
      }else{
        db.products[item.code]={code:item.code,name:item.name,altCode:'',unit:'UN',stock:item.stock,alterdataCode:item.code};
        created++;
      }
    }

    if(!seen.size){
      msg.textContent='Nenhuma linha válida foi encontrada. Use o TXT exportado do inventário do Alterdata.';
      return;
    }

    try{
      if(typeof save==='function')save();
      else if(typeof KEY!=='undefined')localStorage.setItem(KEY,JSON.stringify(db));
    }catch(e){
      msg.textContent='O arquivo foi lido, mas não consegui salvar os dados neste aparelho.';
      return;
    }

    const unique=seen.size;
    msg.innerHTML='<b>Importação concluída.</b><br>'+unique+' produto(s) único(s) lido(s) • '+withStock+' com estoque do Alterdata'+
      (created?' • '+created+' novo(s)':'')+
      (activeUpdated?' • '+activeUpdated+' atualizado(s)':'')+
      (archived?' • '+archived+' arquivado(s) mantido(s) fora da busca':'')+
      (duplicates?' • '+duplicates+' duplicata(s) ignorada(s)':'')+
      (conflicts?' • '+conflicts+' conflito(s) de código mantido(s) para revisão':'')+
      (ignored?' • '+ignored+' linha(s) não reconhecida(s)':'')+'.';

    if(typeof toast==='function')toast('Estoque do Alterdata importado');
  }

  function install(){
    const old=document.getElementById('txtFile');
    const msg=document.getElementById('importMsg');
    if(!old||!msg||old.dataset.alterdataV2==='1')return;

    // Substitui o input para remover o leitor antigo sem tocar no restante do app.
    const input=old.cloneNode(true);
    input.dataset.alterdataV2='1';
    input.accept='.txt,text/plain';
    old.replaceWith(input);

    const card=input.closest('.card');
    const p=card?.querySelector('p');
    if(p)p.innerHTML='Importe o <b>TXT do inventário do Alterdata</b>. Não compacte em ZIP. Layout validado: Código Principal (20) + Nome do Produto (80) + Qt. Estoque (20/2). Produtos arquivados continuam arquivados.';

    input.addEventListener('change',()=>{
      const file=input.files?.[0];
      if(!file)return;
      if(!/\.txt$/i.test(file.name)){
        msg.textContent='Selecione o arquivo .TXT exportado pelo Alterdata. Não use ZIP.';
        input.value='';
        return;
      }
      importAlterdataFile(file,msg);
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);
  else install();
})();
