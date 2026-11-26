/* Fishing Life: all catches and balances come from the authenticated server. */
'use strict';
const fishingColors=['#9ca3af','#84cc16','#22c55e','#06b6d4','#3b82f6','#a855f7','#f59e0b','#ef4444','#ec4899','#d946ef'];
function fishingPage(){return memberHeader('Fishing Life','Một góc bình yên · Câu cá, khám phá, nâng cấp')+'<div class="main-body fishing-shell"><div id="fishing-game" aria-live="polite">Đang tải hồ câu…</div></div>';}
function fishingMount(){
 const root=document.getElementById('fishing-game');if(!root||root.dataset.mounted)return;
 root.dataset.mounted='1';const uid=state.user?.id;let data=null,offset=0,busy=false,region=0,bait=0,panel='bag',error='';
 const alive=()=>root.isConnected&&state.user?.id===uid&&state.tab==='fishing';
 const fmt=n=>Number(n).toLocaleString('vi-VN');
 const button=(action,label,id='',disabled=false)=>'<button type="button" data-fish="'+action+'" data-id="'+id+'" '+(disabled?'disabled':'')+'>'+esc(label)+'</button>';
 function draw(){
  if(!alive())return;
  if(!data){root.textContent=error||'Đang tải hồ câu…';if(error)root.insertAdjacentHTML('beforeend',button('refresh','Thử lại'));return;}
  const c=data.catalog,cast=data.cast;
  const mapOptions=c.maps.map((m,i)=>'<option value="'+i+'" '+(i===region?'selected ':'')+(data.rod<m.rod?'disabled':'')+'>'+esc(m.name)+(data.rod<m.rod?' · Cần nâng cấp':'')+'</option>').join('');
  const baitOptions=c.baits.map((m,i)=>'<option value="'+i+'" '+(i===bait?'selected':'')+'>'+esc(m.name)+' · '+fmt(m.price)+' vàng</option>').join('');
  const bag=data.bag.map(f=>'<div class="fish-row"><div><b style="color:'+fishingColors[f.tier]+'">🐟 '+esc(f.name)+'</b><small>'+esc(c.tiers[f.tier].name)+' · '+esc(c.mutations[f.mutation].name)+' · '+fmt(f.grams)+' g</small></div>'+button('sell','Bán '+fmt(f.value),f.id,busy)+'</div>').join('');
  const shop=c.rods.map((r,i)=>'<div class="fish-row"><div><b>'+esc(r.name)+'</b><small>May mắn ×'+r.luck+' · '+fmt(r.price)+' vàng</small></div>'+button('rod',i===data.rod?'Đang dùng':i<=data.owned_rod?'Trang bị':'Mua',i,busy||!!cast||i===data.rod||i>data.owned_rod+1||i>data.owned_rod&&data.gold<r.price)+'</div>').join('');
  const book=c.maps.map((m,i)=>'<h4>'+esc(m.name)+'</h4>'+m.fish.map((n,j)=>{const f=data.book.find(x=>x.species===i*10+j);return '<div class="fish-row"><span style="color:'+fishingColors[j]+'">'+esc(f?n:'???')+' · '+esc(c.tiers[j].name)+'</span><small>'+ (f?fmt(f.record_grams)+' g · '+fmt(f.caught)+' con':'Chưa khám phá')+'</small></div>';}).join('')).join('');
  root.innerHTML='<section class="fish-hero"><div class="fish-top"><b>FISHING LIFE</b><span>🪙 '+fmt(data.gold)+' · Lv. '+fmt(data.level)+'</span></div><div class="fish-landscape"><svg viewBox="0 0 360 150" aria-hidden="true"><circle cx="282" cy="31" r="19" fill="#f9dba5"/><path d="M0 82L60 26L125 83L202 38L260 82L320 44L360 79V150H0Z" fill="#416b6b"/><path d="M0 92L73 59L143 91L230 65L300 94L360 70V150H0Z" fill="#66948b"/><rect y="94" width="360" height="56" fill="#367785"/><path d="M5 112h78m115 7h99M92 139h90m99-7h63" stroke="#9bd4cf" stroke-width="2" opacity=".6"/><path d="M0 128h91l-11 22H0Z" fill="#826b57"/><path d="M42 124Q91 8 168 51" fill="none" stroke="#e7c69b" stroke-width="3"/><path d="M168 51v69" stroke="#f1e6c8"/><ellipse cx="168" cy="120" rx="4" ry="7" fill="#f5a49a"/><ellipse cx="168" cy="125" rx="18" ry="4" fill="none" stroke="#c1e4d9"/></svg></div><div class="fish-picks"><label>Địa điểm<select id="fish-region" '+(cast?'disabled':'')+'>'+mapOptions+'</select></label><label>Mồi mỗi lượt<select id="fish-bait" '+(cast?'disabled':'')+'>'+baitOptions+'</select></label></div><p>'+esc(error||data.message||'Một buổi câu thật bình yên.')+'</p><div class="fish-status" id="fish-timing" role="status"></div><div class="fish-meter"><i id="fish-meter"></i></div><div class="fish-actions">'+(cast?button('tap',cast.step===0?'Giật cần':'Kéo cá',cast.id,busy)+button('cancel','Thu cần','',busy):button('cast','Thả cần','',busy))+'</div></section><div class="fish-tabs">'+button('panel','Túi cá '+data.bag.length+'/'+data.bag_limit,'bag')+button('panel','Cửa hàng','shop')+button('panel','Sổ cá '+data.book.length+'/30','book')+'</div><section class="fish-list">'+(panel==='shop'?shop:panel==='book'?book:bag||'<p>Chưa có cá. Thả cần để bắt đầu!</p>')+'</section>';
  tick();
 }
 function tick(){
  if(!alive()){clearInterval(timer);return;}if(!data?.cast)return;
  const c=data.cast,now=Date.now()+offset,status=root.querySelector('#fish-timing'),meter=root.querySelector('#fish-meter'),tap=root.querySelector('[data-fish="tap"]');
  const ready=now>=c.action_at&&now<=c.deadline;
  if(status)status.textContent=now>c.deadline?'Cá có thể đã thoát — làm mới hoặc thu cần':ready?(c.step===0?'CÁ CẮN!':'KÉO NGAY · '+c.step+'/'+c.pulls):'Chờ tín hiệu · '+Math.max(0,(c.action_at-now)/1000).toFixed(1)+'s';
  if(meter){meter.style.width=(ready?Math.max(0,(c.deadline-now)/(c.deadline-c.action_at))*100:0)+'%';}
  if(tap)tap.disabled=busy||!ready;
 }
 async function load(action='state',body){
  if(busy||!alive())return;busy=true;error='';draw();
  try{const response=await api('/api/fishing/'+action,body===undefined?{}:{method:'POST',data:body});if(!alive())return;data=response;offset=response.server_ms-Date.now();if(data.rod<data.catalog.maps[region].rod)region=0;}
  catch(e){if(alive())error=e.message;}
  finally{busy=false;draw();}
 }
 root.addEventListener('change',e=>{if(e.target.id==='fish-region')region=Number(e.target.value);if(e.target.id==='fish-bait')bait=Number(e.target.value);});
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
