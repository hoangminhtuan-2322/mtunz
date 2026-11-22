'use strict';

function openImageViewer(origin,url){
 const dialog=document.createElement('dialog');
 dialog.className='image-viewer';
 dialog.setAttribute('aria-labelledby','image-viewer-title');
 dialog.innerHTML=`<div class="image-viewer-shell">
   <header class="image-viewer-toolbar">
    <strong id="image-viewer-title">Xem ảnh</strong>
    <div class="image-viewer-actions">
     <button type="button" class="btn ghost sm" data-image-zoom="-1" aria-label="Thu nhỏ ảnh" disabled>−</button>
     <button type="button" class="btn ghost sm" data-image-zoom="1" aria-label="Phóng to ảnh" disabled>+</button>
     <a class="btn ghost sm" data-image-download download>Lưu ảnh</a>
     <button type="button" class="btn primary sm" data-image-close>Đóng</button>
    </div>
   </header>
   <div class="image-viewer-stage"><div class="image-viewer-canvas"><img hidden alt=""><p role="status">Đang tải ảnh…</p></div></div>
  </div>`;
 const image=dialog.querySelector('img'),stage=dialog.querySelector('.image-viewer-stage');
 const status=dialog.querySelector('[role="status"]'),close=dialog.querySelector('[data-image-close]');
 const zoomOut=dialog.querySelector('[data-image-zoom="-1"]'),zoomIn=dialog.querySelector('[data-image-zoom="1"]');
 const download=dialog.querySelector('[data-image-download]');
 const originalImage=origin.querySelector('img');
 const filename=originalImage?.alt||origin.dataset.imageName||'Ảnh đính kèm';
 image.alt=filename;
 dialog.querySelector('#image-viewer-title').textContent=filename;
 download.href=url.pathname+'?download=1';
 download.download=originalImage?.alt||origin.dataset.imageName||'';
 let zoom=1,pinch=null;
 function size(){
  if(!image.naturalWidth)return;
  const x=(stage.scrollLeft+stage.clientWidth/2)/Math.max(stage.clientWidth,stage.scrollWidth);
  const y=(stage.scrollTop+stage.clientHeight/2)/Math.max(stage.clientHeight,stage.scrollHeight);
  const width=Math.min(image.naturalWidth,stage.clientWidth-24,(stage.clientHeight-24)*image.naturalWidth/image.naturalHeight);
  image.style.width=Math.max(1,Math.round(width*zoom))+'px';
  stage.scrollLeft=stage.scrollWidth*x-stage.clientWidth/2;
  stage.scrollTop=stage.scrollHeight*y-stage.clientHeight/2;
  zoomOut.disabled=zoom<=1;
  zoomIn.disabled=zoom>=4;
 }
 // Only intercept two-finger touch gestures, so ordinary one-finger
 // scrolling/panning remains native on small screens.
 stage.addEventListener('touchstart',event=>{
  if(event.touches.length!==2||!image.naturalWidth){pinch=null;return;}
  const [a,b]=event.touches;
  pinch={distance:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),zoom};
 },{passive:true});
 stage.addEventListener('touchmove',event=>{
  if(!pinch||event.touches.length!==2||!image.naturalWidth)return;
  const [a,b]=event.touches,dist=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
  if(!pinch.distance)return;
  const next=Math.max(1,Math.min(4,pinch.zoom*dist/pinch.distance));
  if(Math.abs(next-zoom)>.01){zoom=next;size();}
  event.preventDefault();
 },{passive:false});
 stage.addEventListener('touchend',event=>{if(event.touches.length<2)pinch=null;},{passive:true});
 stage.addEventListener('touchcancel',()=>{pinch=null;},{passive:true});
 stage.addEventListener('wheel',event=>{
  if(!event.ctrlKey||!image.naturalWidth)return;
  event.preventDefault();
  zoom=Math.max(1,Math.min(4,zoom+(event.deltaY<0?.25:-.25)));
  size();
 },{passive:false});
 close.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',event=>{
  if(event.target===dialog){dialog.close();return;}
  const button=event.target.closest('[data-image-zoom]');
  if(button){
   zoom=Math.max(1,Math.min(4,zoom+Number(button.dataset.imageZoom)*0.5));
   size();
  }
 });
 image.addEventListener('load',()=>{
  image.hidden=false;
  status.hidden=true;
  size();
 });
 image.addEventListener('error',()=>{
  status.textContent='Ảnh không còn khả dụng hoặc không tải được.';
  download.hidden=true;
 });
 dialog.addEventListener('close',()=>{
  window.removeEventListener('resize',size);
  dialog.remove();
  if(origin.isConnected)origin.focus({preventScroll:true});
 },{once:true});
 document.body.append(dialog);
 dialog.showModal();
 close.focus({preventScroll:true});
 window.addEventListener('resize',size);
 image.src=url.pathname;
}

document.addEventListener('click',event=>{
 const origin=event.target.closest('a[data-image-viewer]');
 if(!origin||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
 const url=new URL(origin.href,location.href);
 if(url.origin!==location.origin||!/^\/api\/attachments\/\d+$/.test(url.pathname))return;
 if(typeof HTMLDialogElement==='undefined'||!HTMLDialogElement.prototype.showModal)return;
 event.preventDefault();
 openImageViewer(origin,url);
});
