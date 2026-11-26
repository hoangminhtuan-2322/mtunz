/* Fishing Life: all catches and balances come from the authenticated server. */
'use strict';
const fishingColors=['#9ca3af','#84cc16','#22c55e','#06b6d4','#3b82f6','#a855f7','#f59e0b','#ef4444','#ec4899','#d946ef'];
function fishArt(kind,id,large=false){const max=kind==='rod'?5:30;if(!Number.isInteger(id)||id<0||id>=max)return '';return '<img class="fish-art'+(large?' fish-art-large':'')+'" src="/static/fishing-art/'+kind+'-'+id+'.svg" alt="" width="80" height="50" decoding="async">';}
function fishingPage(){return memberHeader('Fishing Life','Một góc bình yên · Câu cá, khám phá, nâng cấp')+'<div class="main-body fishing-shell"><div id="fishing-game" >Đang tải hồ câu…</div></div>';}
function fishingMount(){
 const root=document.getElementById('fishing-game');if(!root||root.dataset.mounted)return;
 root.dataset.mounted='1';const uid=state.user?.id;root.dataset.owner=String(uid);let data=null,offset=0,busy=false,region=0,bait=0,panel='bag',error='',reward=null;
 const alive=()=>root.isConnected&&state.user?.id===uid&&state.tab==='fishing';
 const fmt=n=>Number(n).toLocaleString('vi-VN');
 const button=(action,label,id='',disabled=false)=>'<button type="button" data-fish="'+action+'" data-id="'+id+'" '+(disabled?'disabled':'')+'>'+esc(label)+'</button>';
 function draw(){
  if(!alive())return;
  if(!data){root.textContent=error||'Đang tải hồ câu…';if(error)root.insertAdjacentHTML('beforeend',button('refresh','Thử lại'));return;}
  const c=data.catalog,cast=data.cast;root.classList.toggle('fish-casting',!!cast);
  const mapOptions=c.maps.map((m,i)=>'<option value="'+i+'" '+(i===region?'selected ':'')+(data.rod<m.rod?'disabled':'')+'>'+esc(m.name)+(data.rod<m.rod?' · Cần nâng cấp':'')+'</option>').join('');
  const baitOptions=c.baits.map((m,i)=>'<option value="'+i+'" '+(i===bait?'selected':'')+'>'+esc(m.name)+' · '+fmt(m.price)+' vàng</option>').join('');
  const bag=data.bag.map(f=>'<div class="fish-row">'+fishArt('fish',f.species)+'<div><b style="color:'+fishingColors[f.tier]+'">'+esc(f.name)+'</b><small>'+esc(c.tiers[f.tier].name)+' · '+esc(c.mutations[f.mutation].name)+' · '+fmt(f.grams)+' g</small></div>'+button('sell','Bán '+fmt(f.value),f.id,busy)+'</div>').join('');
  const shop=c.rods.map((r,i)=>'<div class="fish-row">'+fishArt('rod',i)+'<div><b>'+esc(r.name)+'</b><small>May mắn ×'+r.luck+' · '+fmt(r.price)+' vàng</small></div>'+button('rod',i===data.rod?'Đang dùng':i<=data.owned_rod?'Trang bị':'Mua',i,busy||!!cast||i===data.rod||i>data.owned_rod+1||i>data.owned_rod&&data.gold<r.price)+'</div>').join('');
  const book=c.maps.map((m,i)=>'<h4>'+esc(m.name)+'</h4>'+m.fish.map((n,j)=>{const f=data.book.find(x=>x.species===i*10+j);return '<div class="fish-row">'+(f?fishArt('fish',i*10+j):'<span class="fish-unknown" aria-hidden="true">?</span>')+'<span style="color:'+fishingColors[j]+'">'+esc(f?n:'???')+' · '+esc(c.tiers[j].name)+'</span><small>'+ (f?fmt(f.record_grams)+' g · '+fmt(f.caught)+' con':'Chưa khám phá')+'</small></div>';}).join('')).join('');
  root.innerHTML='<section class="fish-hero"><div class="fish-top"><b>FISHING LIFE</b><span>🪙 '+fmt(data.gold)+' · Lv. '+fmt(data.level)+'</span></div><div class="fish-landscape" data-region="'+(cast?.region??region)+'"><img class="fish-scene" src="/static/fishing-art/scene-'+(cast?.region??region)+'.svg" alt="" width="960" height="420"><div class="fish-location">'+esc(c.maps[cast?.region??region].name)+'</div>'+(cast?'<div class="fish-float-anchor" aria-hidden="true"><i class="fish-ripple"></i><i class="fish-bobber"></i></div>':'')+'</div><div class="fish-picks"><label>Địa điểm<select id="fish-region" '+(cast?'disabled':'')+'>'+mapOptions+'</select></label><label>Mồi mỗi lượt<select id="fish-bait" '+(cast?'disabled':'')+'>'+baitOptions+'</select></label></div><p>'+esc(error||data.message||'Một buổi câu thật bình yên.')+'</p><div class="fish-status" id="fish-timing"></div><div class="fish-meter"><i id="fish-meter"></i></div><div class="fish-actions">'+(cast?button('tap',cast.step===0?'Giật cần':'Kéo cá',cast.id,busy)+button('cancel','Thu cần','',busy):button('cast','Thả cần','',busy))+'</div>'+(reward?'<div class="fish-reward" style="--fish-rarity:'+fishingColors[reward.tier]+'">'+fishArt('fish',reward.species,true)+'<div><small>'+esc(c.tiers[reward.tier].name)+' · '+esc(c.mutations[reward.mutation].name)+'</small><strong>'+esc(reward.name)+'</strong><span>'+fmt(reward.grams)+' g · '+fmt(reward.value)+' vàng</span></div></div>':'')+'</section><aside class="fish-side" aria-label="Kho cá và cửa hàng"><div class="fish-tabs">'+button('panel','Túi cá '+data.bag.length+'/'+data.bag_limit,'bag')+button('panel','Cửa hàng','shop')+button('panel','Sổ cá '+data.book.length+'/30','book')+button('refresh','↻','',busy)+'</div><section class="fish-list">'+(panel==='shop'?shop:panel==='book'?book:bag||'<p>Chưa có cá. Thả cần để bắt đầu!</p>')+'</section></aside>';
  root.querySelectorAll('[data-fish="panel"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===panel)));
  tick();
 }
 function tick(){
  if(!alive()){clearInterval(timer);return;}if(!data?.cast){root.classList.remove('fish-bite');return;}
  const c=data.cast,now=Date.now()+offset,status=root.querySelector('#fish-timing'),meter=root.querySelector('#fish-meter'),tap=root.querySelector('[data-fish="tap"]');
  const ready=now>=c.action_at&&now<=c.deadline;
  if(status){const label=now>c.deadline?'Cá có thể đã thoát — làm mới hoặc thu cần':ready?(c.step===0?'CÁ CẮN!':'KÉO NGAY · '+c.step+'/'+c.pulls):'Chờ tín hiệu · '+Math.max(0,(c.action_at-now)/1000).toFixed(1)+'s';if(status.textContent!==label)status.textContent=label;}
  if(meter){meter.style.width=(ready?Math.max(0,(c.deadline-now)/(c.deadline-c.action_at))*100:0)+'%';}
  root.classList.toggle('fish-bite',ready);
  if(tap){tap.disabled=busy||!ready;tap.classList.toggle('fish-ready',ready);}
 }
 async function load(action='state',body){
  if(busy||!alive())return;busy=true;error='';if(action==='cast'||action==='sell')reward=null;draw();
  try{const response=await api('/api/fishing/'+action,body===undefined?{}:{method:'POST',data:body});if(!alive())return;if(action==='tap'&&data&&response.caught>data.caught){const old=new Set(data.bag.map(f=>f.id));reward=response.bag.find(f=>!old.has(f.id))||null;}data=response;if(data.cast?.region!==undefined)region=data.cast.region;offset=response.server_ms-Date.now();if(data.rod<data.catalog.maps[region].rod)region=0;}
  catch(e){if(alive())error=e.message;}
  finally{busy=false;draw();}
 }
 root.addEventListener('change',e=>{if(e.target.id==='fish-region'){region=Number(e.target.value);draw();}if(e.target.id==='fish-bait')bait=Number(e.target.value);});
 root.addEventListener('click',e=>{
  const b=e.target.closest('[data-fish]');if(!b||b.disabled||!alive())return;const a=b.dataset.fish;
  if(a==='panel'){panel=b.dataset.id;draw();return;}
  if(a==='refresh'){load();return;}if(busy||!data)return;
  if(a==='cast')load('cast',{region,bait});
  if((a==='tap'||a==='cancel')&&data.cast)load(a,{cast_id:data.cast.id,step:data.cast.step});
  if(a==='sell')load('sell',{fish_id:b.dataset.id});
  if(a==='rod')load('rod',{rod:Number(b.dataset.id)});
 });
 const timer=setInterval(tick,100);load();
}
