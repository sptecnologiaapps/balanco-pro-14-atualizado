(()=>{
  'use strict';
  document.addEventListener('click',e=>{
    const confirmBtn=e.target.closest?.('#finishCurrentProduct');
    if(!confirmBtn)return;
    const qty=document.getElementById('editQty');
    const saveQty=document.getElementById('saveQty');
    if(!qty||!saveQty)return;
    const value=String(qty.value??'').trim();
    if(value==='')return;
    saveQty.click();
  },true);
})();
