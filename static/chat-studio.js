'use strict';
(()=>{
 const papers={midnight:'Đêm xanh',lagoon:'Đầm phá',dusk:'Hoàng hôn',grove:'Rừng thông'};
 const photoCache=new Map();
 function storedPhoto(uid){
  if(!photoCache.has(uid)){
   let data='';
   try{data=localStorage.getItem('mtunz.paper.'+uid)||'';}catch{}
   photoCache.set(uid,/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data)?data:'');
  }
  return photoCache.get(uid);
 }
 window.applyChatPhoto=()=>{
  const thread=document.querySelector('.thread[data-paper]');
  if(!thread||!state.user)return;
  const data=storedPhoto(state.user.id);
  thread.style.backgroundImage=data?'linear-gradient(#08122599,#08122599),url('+data+')':'';
 };
 async function bitmap(file){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>6*1024*1024)
   throw Error('Chọn ảnh JPG, PNG hoặc WebP dưới 6 MB.');
  const image=new Image(),url=URL.createObjectURL(file);
  try{image.src=url;await image.decode();return image;}finally{URL.revokeObjectURL(url);}
 }
 function wallpaper(){
  const selected=state.user.chat_wallpaper||'midnight';
  const owner=state.user.id;
  let photo=storedPhoto(owner),generation=0,loading=false;
  modal({title:'Hình nền hội thoại',description:'Mẫu có sẵn đồng bộ theo tài khoản. Ảnh riêng chỉ lưu trong trình duyệt này.',confirm:'Lưu hình nền',
   content:'<fieldset class="paper-grid"><legend>Chọn mẫu</legend>'+Object.entries(papers).map(([id,name])=>
    `<label><input type="radio" name="chat-paper" value="${id}" ${!photo&&id===selected?'checked':''}><span class="paper-sample" data-paper="${id}"></span>${name}</label>`).join('')+`<label class="paper-local" ${photo?'':'hidden'}><input type="radio" name="chat-paper" value="photo" ${photo?'checked':''}><span class="paper-sample"></span>Ảnh riêng</label></fieldset><label class="studio-file">Chọn ảnh riêng<input type="file" data-paper-file accept="image/jpeg,image/png,image/webp"></label>`,
   handler:async host=>{
    const value=host.querySelector('[name="chat-paper"]:checked').value;
    if(loading)throw Error('Ảnh đang được thu nhỏ.');
    if(value==='photo'){
     try{localStorage.setItem('mtunz.paper.'+owner,photo);}catch{throw Error('Không đủ bộ nhớ trình duyệt cho ảnh này.');}
     photoCache.set(owner,photo);window.applyChatPhoto();return;
    }
    const saved=await api('/api/me/appearance',{method:'PATCH',data:{wallpaper:value}});
    if(state.user?.id===owner){
     try{localStorage.removeItem('mtunz.paper.'+owner);}catch{}
     photoCache.set(owner,'');state.user.chat_wallpaper=saved.wallpaper;window.applyChatPhoto();
     const thread=document.querySelector('.thread[data-paper]');if(thread)thread.dataset.paper=saved.wallpaper;
     toast('Đã lưu hình nền hội thoại.','ok');
    }
   }});
  const local=document.querySelector('.paper-local'),preview=local.querySelector('.paper-sample');
  if(photo)preview.style.backgroundImage='url('+photo+')';
  document.querySelector('[data-paper-file]').onchange=async e=>{
   const job=++generation;loading=true;
   try{
    const img=await bitmap(e.target.files[0]);
    if(job!==generation||!local.isConnected)return;
    const ratio=Math.min(1,1200/Math.max(img.width,img.height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.width*ratio));canvas.height=Math.max(1,Math.round(img.height*ratio));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    photo=canvas.toDataURL('image/jpeg',.76);local.hidden=false;
    preview.style.backgroundImage='url('+photo+')';local.querySelector('input').checked=true;
   }catch(err){toast(err.message,'error');}finally{if(job===generation)loading=false;}
  };
 }
 function sticker(){
  if(v6FeatureFlags.member_uploads===false){toast('Admin đã tạm dừng tải tệp và sticker mới.');return;}
  const chat=v4ChatKey(),owner=state.user.id;
  if(!chat)return;
  if(state.pendingAttachment||state.uploading){toast('Hãy gửi hoặc bỏ tệp đang đính kèm trước.');return;}
  const key='mtunz.stickers.'+owner;
  let saved=[];
  try{const data=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(data))saved=data.filter(x=>typeof x==='string'&&x.startsWith('data:image/png;base64,')).slice(0,8);}catch{}
  modal({title:'Xưởng sticker',description:'Vẽ bằng tay hoặc nhập chữ và emoji. Sticker sẽ được đính kèm để bạn xem lại trước khi gửi.',
   confirm:'Đính kèm sticker',content:`<div class="sticker-editor">
    <canvas width="320" height="320" aria-label="Bảng vẽ sticker"></canvas>
    <label class="studio-file">Dùng ảnh làm sticker<input type="file" data-sticker-file accept="image/jpeg,image/png,image/webp"></label>
    <label>Nội dung<input class="input" data-caption maxlength="36" placeholder="Nhập chữ hoặc emoji"></label>
    <div class="studio-tools"><label>Màu bút <input type="color" data-color value="#ab83ff"></label>
     <button type="button" class="btn ghost sm" data-clear>Xóa nét vẽ</button></div>
    <button type="button" class="btn ghost sm" data-save>Lưu vào bộ sưu tập trên máy</button>
    <div class="sticker-shelf" aria-label="Sticker đã lưu"></div></div>`,
   handler:async()=>{
    if(owner!==state.user?.id||chat!==v4ChatKey())throw Error('Hãy mở lại xưởng trong hội thoại muốn gửi.');
    if(state.pendingAttachment||state.uploading)throw Error('Hội thoại đang có tệp đính kèm.');
    if(!hasInk&&!caption.value.trim())throw Error('Hãy vẽ hoặc nhập nội dung cho sticker.');
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw Error('Trình duyệt chưa xuất được sticker.');
    await uploadSelected(new File([blob],'mtunz-sticker.png',{type:'image/png'}));
   }});
  const editor=document.querySelector('.sticker-editor'),canvas=editor.querySelector('canvas');
  const ctx=canvas.getContext('2d'),ink=document.createElement('canvas');ink.width=ink.height=320;
  const pen=ink.getContext('2d'),caption=editor.querySelector('[data-caption]'),color=editor.querySelector('[data-color]');
  let hasInk=false,pointer=null;
  function paint(){
   ctx.clearRect(0,0,320,320);ctx.drawImage(ink,0,0);
   const label=caption.value.trim();if(!label)return;
   ctx.font='bold 54px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
   ctx.strokeStyle='#172039';ctx.lineWidth=6;ctx.lineJoin='round';
   const y=hasInk?272:160;
   ctx.strokeText(label,160,y,290);ctx.fillStyle=color.value;ctx.fillText(label,160,y,290);
  }
  function point(e){const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)*320/r.width,(e.clientY-r.top)*320/r.height];}
  canvas.onpointerdown=e=>{
   if(pointer!==null||e.button!==0)return;
   pointer=e.pointerId;canvas.setPointerCapture(pointer);
   const [x,y]=point(e);pen.strokeStyle=pen.fillStyle=color.value;pen.lineWidth=9;pen.lineCap=pen.lineJoin='round';
   pen.beginPath();pen.arc(x,y,4.5,0,Math.PI*2);pen.fill();pen.beginPath();pen.moveTo(x,y);
   hasInk=true;paint();
  };
  canvas.onpointermove=e=>{if(pointer!==e.pointerId)return;pen.lineTo(...point(e));pen.stroke();paint();};
  canvas.onlostpointercapture=()=>{pointer=null;};
  let importSequence=0;
  editor.querySelector('[data-sticker-file]').onchange=async e=>{
   const job=++importSequence;
   try{
    const img=await bitmap(e.target.files[0]);if(!editor.isConnected||job!==importSequence)return;
    const scale=288/Math.max(img.width,img.height),w=img.width*scale,h=img.height*scale;
    pen.clearRect(0,0,320,320);pen.drawImage(img,(320-w)/2,(320-h)/2,w,h);hasInk=true;paint();
   }catch(err){toast(err.message,'error');}
  };
  caption.oninput=color.oninput=paint;
  editor.querySelector('[data-clear]').onclick=()=>{pen.clearRect(0,0,320,320);hasInk=false;paint();};
  function shelf(){
   const list=editor.querySelector('.sticker-shelf');list.replaceChildren();
   saved.forEach((src,index)=>{
    const b=document.createElement('button'),img=new Image();b.type='button';b.title='Dùng sticker '+(index+1);
    img.alt=b.title;img.src=src;b.append(img);list.append(b);
    b.onclick=()=>{if(!img.naturalWidth)return;pen.clearRect(0,0,320,320);pen.drawImage(img,0,0,320,320);hasInk=true;caption.value='';paint();};
   });
  }
  editor.querySelector('[data-save]').onclick=()=>{
   if(!hasInk&&!caption.value.trim()){toast('Sticker đang trống.');return;}
   const src=canvas.toDataURL('image/png'),next=[src,...saved.filter(item=>item!==src)].slice(0,8);
   try{localStorage.setItem(key,JSON.stringify(next));saved=next;shelf();toast('Đã lưu vào 8 sticker gần nhất.','ok');}
   catch{toast('Bộ nhớ trình duyệt đã đầy. Bạn vẫn có thể đính kèm sticker.');}
  };
  shelf();
 }
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-studio]');if(!b||!state.user||state.user.is_admin)return;
  if(b.dataset.studio==='wallpaper')wallpaper();
  if(b.dataset.studio==='sticker')sticker();
 });
})();
