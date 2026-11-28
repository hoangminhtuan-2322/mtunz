/* Fishing is mounted only when the member opens the game. Server owns rewards. */
const fishingView={owner:null,data:null,busy:false,error:'',result:'',rank:null,offset:0,timer:null,section:'bag',generation:0};
function fishingPage(){return memberHeader('mtunz Fishing','Một góc hồ bình yên · Xu ảo, không quy đổi tiền thật')+'<div class="main-body"><div id="fishing-root" class="fishing-root" aria-live="polite"></div></div>';}
function fishingActive(){return state.user&&!state.user.is_admin&&state.tab==='fishing'&&document.getElementById('fishing-root');}
function fishingClock(){return Date.now()+fishingView.offset;}
function fishingPhase(data,now){return !data?.cast||now>data.cast.expires_at?'idle':now<data.cast.bite_at?'wait':'bite';}
function mountFishing(){
 const root=fishingActive();
 if(!root){clearInterval(fishingView.timer);fishingView.timer=null;return;}
 if(fishingView.owner!==state.user.id){clearInterval(fishingView.timer);Object.assign(fishingView,{owner:state.user.id,data:null,busy:false,error:'',result:'',rank:null,timer:null,section:'bag',generation:fishingView.generation+1});}
 renderFishing();
 if(!fishingView.timer)fishingView.timer=setInterval(()=>{if(!fishingActive()||state.user.id!==fishingView.owner){clearInterval(fishingView.timer);fishingView.timer=null;return;}paintFishingClock();},100);
 if(!fishingView.data&&!fishingView.busy)void fishingRequest('read');
}
async function fishingRequest(action,body){
 if(fishingView.busy||!fishingActive())return;
 const owner=state.user.id,generation=fishingView.generation;
 const current=()=>state.user?.id===owner&&fishingView.generation===generation;
 fishingView.busy=true;fishingView.error='';renderFishing();
 try{
  const path='/api/fishing'+(action==='read'?'':'/'+action);
  const data=action==='read'||action==='ranking'?await api(path):await post(path,body||{});
  if(!current())return;
  if(action==='ranking'){fishingView.rank=data.ranking;}
  else {fishingView.data=data;fishingView.offset=data.server_now-Date.now();
   if(action==='cast')fishingView.result='';
   if(data.result){const fish=data.fish.find(f=>f.id===data.result.fish_id);fishingView.result=data.result.caught?'🎉 Bạn đã câu được '+fish.name+'!':data.result.reason==='early'?'Giật cần quá sớm!':'Cá đã thoát mất!';}
   if(action==='sell')fishingView.result='Đã bán cá, xu đã vào ví.';
   if(action==='upgrade')fishingView.result='Đã nâng cấp cần câu!';
   if(action==='daily')fishingView.result='Đã nhận 100 xu nhiệm vụ!';
  }
 }catch(e){if(current())fishingView.error=e.message||'Không thể kết nối.';}
 finally{if(current()){fishingView.busy=false;renderFishing();}}
}
function paintFishingClock(){
 const root=fishingActive();if(!root)return;
 const phase=fishingPhase(fishingView.data,fishingClock()),button=root.querySelector('[data-fish-play]'),scene=root.querySelector('.fish-scene'),status=root.querySelector('.fish-status');
 if(!button||!scene||!status)return;
 if(scene.dataset.phase!==phase){scene.dataset.phase=phase;button.textContent=phase==='idle'?'🎣 Thả câu':phase==='wait'?'Chờ cá cắn câu…':'⚡ GIẬT CẦN!';status.textContent=phase==='idle'?'Mặt hồ đang chờ bạn.':phase==='wait'?'Hãy chờ phao phát sáng.':'Cá cắn câu rồi!';}
 button.disabled=fishingView.busy||phase==='wait';
}
function renderFishing(){
 const root=fishingActive();if(!root)return;const v=fishingView,d=v.data;
 const err=v.error?'<div class="fish-alert" role="alert">'+esc(v.error)+'</div>':'';
 if(!d){root.innerHTML='<div class="fish-panel">'+err+'<p>Đang mở hồ câu cá…</p><button data-fish-action="read" class="fish-btn" '+(v.busy?'disabled':'')+'>Thử lại</button></div>';return;}
 const next=d.rods[d.level],rod=d.rods[d.level-1],disabled=v.busy?'disabled':'';
 const fishRows=d.fish.map(f=>{const n=d.bag[f.id]||0,seen=d.collection[f.id]||0;return v.section==='bag'?(n?'<div class="fish-item"><span class="fish-emoji">'+f.emoji+'</span><div><b>'+esc(f.name)+'</b><small>'+n+' con · '+f.value+' xu/con</small></div><button class="fish-small" data-fish-action="sell" data-fish-id="'+esc(f.id)+'" data-quantity="'+Math.min(n,1000)+'" '+disabled+'>Bán '+Math.min(n,1000)+'</button></div>':''):'<div class="fish-item '+(seen?'':'fish-locked')+'"><span class="fish-emoji">'+(seen?f.emoji:'?')+'</span><div><b>'+esc(f.name)+'</b><small>'+esc(({common:'Thường',uncommon:'Ít gặp',rare:'Hiếm',epic:'Sử thi',legendary:'Huyền thoại'})[f.rarity])+' · Cần cấp '+f.unlock+'</small></div><span>'+seen+'</span></div>';}).join('');
 root.innerHTML='<div class="fish-top"><div><small>MTUNZ GAMING</small><h1>Hồ Tĩnh Lặng</h1><p>Thả câu, chờ cá cắn và giật cần đúng lúc.</p></div><div class="fish-wallet">🪙 '+Number(d.coins).toLocaleString('vi-VN')+' xu</div></div>'+err+
 '<div class="fish-layout"><section><div class="fish-scene" data-phase=""><div class="fish-moon"></div><div class="fish-hills"></div><div class="fish-water"></div><div class="fish-dock"></div><div class="fish-line"></div><div class="fish-bobber"></div><div class="fish-scene-caption">HỒ TĨNH LẶNG · CẤP '+d.level+'</div></div><div class="fish-play"><p class="fish-status"></p><button class="fish-btn fish-main-btn" data-fish-play></button><p class="fish-result">'+esc(v.result||'Mỗi lần câu có thể mang đến một bất ngờ.')+'</p></div><div class="fish-panel"><b>Nhiệm vụ hôm nay</b><p>Câu '+Math.min(d.daily.caught,d.daily.target)+' / '+d.daily.target+' cá</p><progress value="'+Math.min(d.daily.caught,d.daily.target)+'" max="'+d.daily.target+'"></progress><button class="fish-small" data-fish-action="daily" '+(v.busy||d.daily.claimed||d.daily.caught<d.daily.target?'disabled':'')+'>'+(d.daily.claimed?'Đã nhận':'Nhận 100 xu')+'</button></div></section>'+
 '<section class="fish-panel"><small>CẦN CÂU · '+d.level+'/10</small><h2>'+esc(rod.name)+'</h2><p>'+d.caught+' cá đã câu · '+Object.keys(d.collection).length+'/'+d.fish.length+' loài</p>'+(next?'<button class="fish-btn" data-fish-action="upgrade" data-level="'+next.level+'" '+(v.busy||d.coins<next.price?'disabled':'')+'>Nâng cấp · '+next.price+' xu</button>':'<p>Đã đạt cấp tối đa!</p>')+
 '<div class="fish-tabs"><button data-fish-tab="bag" aria-pressed="'+(v.section==='bag')+'">Giỏ cá</button><button data-fish-tab="collection" aria-pressed="'+(v.section==='collection')+'">Bộ sưu tập</button><button data-fish-tab="rank" aria-pressed="'+(v.section==='rank')+'">Xếp hạng</button></div>'+
 (v.section==='rank'?(v.rank?.map(r=>'<div class="fish-item"><b>#'+r.rank+' '+esc(r.name)+'</b><span>'+r.caught+' cá · Cấp '+r.level+'</span></div>').join('')||'<p>Chưa có ngư thủ trong bảng.</p>')+'<button data-fish-action="ranking" class="fish-small" '+disabled+'>Làm mới</button>':fishRows||'<p>Giỏ đang trống. Thả câu để bắt đầu!</p>')+'</section></div>';
 paintFishingClock();
}
document.addEventListener('click',event=>{
 const root=fishingActive();if(!root)return;
 const b=event.target.closest('button');if(!b||!root.contains(b)||b.disabled)return;
 if(b.hasAttribute('data-fish-play')){
  const d=fishingView.data,phase=fishingPhase(d,fishingClock());
  if(phase==='idle')void fishingRequest('cast');else if(phase==='bite')void fishingRequest('reel',{token:d.cast.token});
 }else if(b.dataset.fishTab){fishingView.section=b.dataset.fishTab;renderFishing();if(b.dataset.fishTab==='rank')void fishingRequest('ranking');}
 else if(b.dataset.fishAction){const a=b.dataset.fishAction;if(a==='sell')void fishingRequest(a,{fish_id:b.dataset.fishId,quantity:Number(b.dataset.quantity)});else if(a==='upgrade')void fishingRequest(a,{level:Number(b.dataset.level)});else if(['read','daily','ranking'].includes(a))void fishingRequest(a);}
});
