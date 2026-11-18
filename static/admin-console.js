/* mtunz Admin Console: progressive enhancement. No credentials or private records stored. */
(function(){
 'use strict';
 const pageSize=15;
 const rememberedFilters=Object.create(null);
 let autoRefresh=false,commandOpen=false,scheduled=false,lastKnownShell=null;
 let sortState={tab:'',index:-1,reverse:false};
 const q=(s,root=document)=>root.querySelector(s);
 const all=(s,root=document)=>Array.from(root.querySelectorAll(s));
 const activeTab=()=>typeof state!=='undefined'?state.adminTab:'overview';
 const adminReady=()=>!!q('.admin-shell')&&typeof state!=='undefined'&&!!state.user?.is_admin;
 function make(tag,attrs={},text=''){
  const el=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));
  if(text)el.textContent=text;
  return el;
 }
 function button(label,action,extra={}){
  const b=make('button',{type:'button','data-admin-ui':action,...extra},label);
  return b;
 }
 function valueFor(tab){
  return rememberedFilters[tab]||(rememberedFilters[tab]={search:'',status:'all',page:0});
 }
 function fieldRows(tab){
  const container=q('.admin-page');
  if(!container)return [];
  if(tab==='tickets')return all('.ticket-list .ticket-item',container);
  if(tab==='audit')return all('.admin-page .audit-item',container);
  if(['users','registrations','deletions','groups'].includes(tab))return all('.admin-page .data-table tbody tr',container).filter(r=>r.querySelector('td')&&!r.querySelector('td.empty'));
  return [];
 }
 function tableStatus(tab,row){
  const text=row.textContent.toLocaleLowerCase('vi');
  if(tab==='registrations'){
   if(text.includes('chờ duyệt'))return 'pending';
   if(text.includes('đã duyệt'))return 'approved';
   if(text.includes('từ chối'))return 'denied';
   return 'other';
  }
  if(tab==='users'){
   if(text.includes('chờ xóa'))return 'pending';
   if(text.includes('đã cấm')||text.includes('đã khóa'))return 'restricted';
   return 'active';
  }
  if(tab==='tickets')return row.querySelector('.pill')?.textContent.trim().toLowerCase()==='mở'?'open':'closed';
  if(tab==='audit')return row.dataset.level||'info';
  return 'all';
 }
 function refreshList(){
  if(!adminReady())return;
  const tab=activeTab(),settings=valueFor(tab);
  const rows=fieldRows(tab);
  const search=settings.search.trim().toLocaleLowerCase('vi');
  const filtered=rows.filter(row=>(!search||row.textContent.toLocaleLowerCase('vi').includes(search))&&
   (settings.status==='all'||tableStatus(tab,row)===settings.status));
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  settings.page=Math.min(Math.max(0,settings.page),pages-1);
  const from=settings.page*pageSize;
  const visible=new Set(filtered.slice(from,from+pageSize));
  for(const row of rows)row.hidden=!visible.has(row);
  const pager=q('#admin-list-pager');
  const count=q('#admin-list-count');
  if(count)count.textContent=filtered.length+' / '+rows.length+' mục trong dữ liệu đã tải';
  if(pager){
   pager.replaceChildren();
   const back=button('Trước','prev',{disabled:settings.page===0?'true':undefined});
   const next=button('Sau','next',{disabled:settings.page>=pages-1?'true':undefined});
   back.disabled=settings.page===0;next.disabled=settings.page>=pages-1;
   pager.append(back,make('span',{},'Trang '+(settings.page+1)+' / '+pages),next);
  }
  const empty=q('#admin-filter-empty');
  if(empty)empty.hidden=filtered.length!==0;
 }
 function insertFilterPanel(){
  const tab=activeTab();
  if(!['users','registrations','deletions','groups','tickets','audit'].includes(tab))return;
  const rows=fieldRows(tab);
  if(!rows.length)return;
  const host=q('.admin-page');
  const anchor=tab==='tickets'?q('.admin-ticket-layout'):tab==='audit'?q('.admin-audit-card'):q('.admin-page .table-scroll');
  if(!anchor)return;
  const filter=valueFor(tab),tools=make('section',{class:'admin-list-tools','aria-label':'Tìm kiếm và lọc dữ liệu'});
  const controls=make('div',{class:'filter-controls'});
  const search=make('input',{class:'input',type:'search','aria-label':'Tìm trong danh sách đã tải',placeholder:'Tìm trong danh sách hiện tại...',autocomplete:'off','data-admin-filter':'search'});
  search.value=filter.search;
  if(tab!=='audit')controls.append(search); // Audit has server-wide search and date/action filters.
  let choices=null;
  if(tab==='registrations')choices=[['all','Tất cả trạng thái'],['pending','Chờ duyệt'],['approved','Đã duyệt'],['denied','Từ chối']];
  if(tab==='users')choices=[['all','Tất cả tài khoản'],['active','Hoạt động'],['restricted','Đã khóa / cấm'],['pending','Chờ xóa']];
  if(tab==='tickets')choices=[['all','Tất cả phiếu'],['open','Đang mở'],['closed','Đã đóng']];
  if(tab==='audit')choices=[['all','Mọi mức độ'],['high','Quan trọng'],['medium','Cần theo dõi'],['info','Thông thường']];
  if(choices){
   const select=make('select',{class:'select','aria-label':'Lọc trạng thái','data-admin-filter':'status'});
   for(const [val,label]of choices){const option=make('option',{value:val},label);select.append(option);}
   select.value=filter.status;controls.append(select);
  }
  const count=make('span',{class:'count-label',id:'admin-list-count'});
  tools.append(controls,count);
  const parent=anchor.parentElement;parent.insertBefore(tools,anchor);
  const pager=make('nav',{class:'admin-pager',id:'admin-list-pager','aria-label':'Chuyển trang danh sách'});
  anchor.after(pager);
  const empty=make('p',{class:'admin-muted-note',id:'admin-filter-empty',role:'status'},'Không có mục nào phù hợp với bộ lọc.');empty.hidden=true;pager.after(empty);
  if(tab==='audit'){
   controls.append(button('Xuất nhật ký CSV','export-audit'));
  }
  if(tab==='tickets')all('.ticket-list .ticket-item',host).forEach(item=>{
   item.tabIndex=0;item.setAttribute('role','button');item.setAttribute('aria-label','Mở phiếu hỗ trợ '+item.textContent.trim().slice(0,80));
  });
  if(['users','registrations','deletions','groups'].includes(tab)){
   all('thead th',anchor).forEach((th,index)=>{
    th.setAttribute('title','Nhấn để sắp xếp theo cột');
    th.style.cursor='pointer';th.tabIndex=0;th.dataset.sortIndex=String(index);
    th.setAttribute('aria-label','Nhấn Enter để sắp xếp theo '+th.textContent.trim());
   });
  }
  refreshList();
 }
 function navigate(tab){
  if(!adminReady()||typeof clickAction!=='function')return;
  const target=q('.admin-nav button[data-act="admin-tab"][data-tab="'+tab+'"]');
  if(target)target.click();
 }
 function buildTopBar(){
  if(!adminReady())return;
  const page=q('.admin-page'),shell=q('.admin-shell');if(!page||!shell||q('.admin-workspace-top'))return;
  shell.insertBefore(make('div',{class:'admin-menu-backdrop','data-admin-ui':'close-menu','aria-hidden':'true'}),page);
  const top=make('div',{class:'admin-workspace-top'});
  const left=make('div',{class:'worktop-left'});
  left.append(button('☰','menu',{class:'admin-mobile-toggle','aria-label':'Mở menu quản trị'}));
  left.append(make('span',{class:'work-label'},'MTUNZ  /  ADMIN CONSOLE'));
  left.append(make('span',{class:'admin-online'},'Phiên quản trị'));
  const right=make('div',{class:'worktop-right'});
  right.append(button('Tìm nhanh  ⌘K','commands',{'aria-keyshortcuts':'Control+K Meta+K'}));
  right.append(button('Làm mới','refresh'));
  right.append(button('Bảo mật','security'));
  const toggle=make('label',{class:'admin-muted-note'});
  const cb=make('input',{type:'checkbox',id:'admin-auto-refresh'});
  cb.checked=autoRefresh;toggle.append(cb,document.createTextNode(' Tự làm mới / 60 giây'));
  right.append(toggle);
  top.append(left,right);page.prepend(top);
  const heading=q('.admin-header',page);
  if(heading){
   const role=q('.admin-header>.pill',heading);
   if(role)role.classList.add('admin-role');
  }
  all('.admin-nav button[data-act="admin-tab"]',shell).forEach(btn=>{
   btn.setAttribute('aria-current',btn.classList.contains('active')?'page':'false');
  });
  const nav=q('.admin-nav',shell);
  const oldFooter=nav?.querySelector('.nav-spacer');
  if(oldFooter){const wrapper=make('div',{class:'admin-rail-footer'});oldFooter.replaceWith(wrapper);while(wrapper.nextElementSibling)wrapper.append(wrapper.nextElementSibling);}
  if(activeTab()==='overview'){
   const stats=state.adminData?.stats||{};
   const max=Math.max(1,Number(stats.max_users)||1);
   const used=Number(stats.total_users||0)+Number(stats.reserved_slots||0);
   const limit=q('form[data-form="admin-capacity"]',page);
   if(limit){
    const meter=make('div',{class:'admin-capacity-meter',role:'progressbar','aria-label':'Sử dụng hạn mức tài khoản','aria-valuenow':used,'aria-valuemax':max});
    const fill=make('span');fill.style.width=Math.min(100,100*used/max)+'%';meter.append(fill);limit.before(meter);
    limit.before(make('p',{class:'admin-muted-note'},used+' / '+max+' suất đã dùng hoặc giữ chỗ ('+Math.round(100*used/max)+'%).'));
   }
   const quick=make('section',{class:'admin-quick-links','aria-label':'Tác vụ nhanh'});
   for(const [name,tab] of [['Duyệt tài khoản','registrations'],['Quản lý người dùng','users'],['Trả lời hỗ trợ','tickets'],['Nhật ký hệ thống','audit'],['Trung tâm bảo mật','security']]){
    quick.append(button(name,'go-'+tab));
   }
   const cards=q('.stats-grid',page);if(cards)cards.before(quick);
  }
  if(activeTab()==='security'){
   const area=q('.admin-security',page);
   if(area){
    const banner=make('section',{class:'admin-alert-strip'},state.user.pin_length?'Đã kích hoạt PIN quản trị. Những thao tác cấp khôi phục và phát thông báo sẽ yêu cầu nhập lại mật khẩu và PIN.':'PIN quản trị chưa bật. Hãy kích hoạt PIN 6 chữ số để bảo vệ thao tác nhạy cảm.');
    area.before(banner);
   }
  }
  insertFilterPanel();
 }
 function closeCommands(){q('#admin-command-overlay')?.remove();commandOpen=false;}
 function showCommands(){
  if(!adminReady())return;
  if(commandOpen){closeCommands();return}
  commandOpen=true;
  const overlay=make('div',{id:'admin-command-overlay',class:'admin-command-overlay',role:'presentation'});
  const dialog=make('div',{class:'admin-command-dialog',role:'dialog','aria-modal':'true','aria-label':'Đi tới mục quản trị'});
  dialog.append(make('h2',{},'Điều hướng nhanh'));
  const input=make('input',{type:'search',placeholder:'Tìm mục quản trị...',class:'input',autocomplete:'off','aria-label':'Tìm mục'});
  dialog.append(input);
  const results=make('div',{class:'admin-command-results'});
  dialog.append(results);overlay.append(dialog);document.body.append(overlay);
  function draw(){
   results.replaceChildren();
   const term=input.value.trim().toLocaleLowerCase('vi');
   const tabs=typeof adminTabs!=='undefined'?adminTabs:[];
   for(const [id,_,label]of tabs.filter(x=>x[2].toLocaleLowerCase('vi').includes(term))){
    const b=button(label,'go-'+id);
    results.append(b);
   }
   if(!results.childElementCount)results.append(make('p',{class:'admin-muted-note'},'Không tìm thấy mục phù hợp.'));
  }
  input.addEventListener('input',draw);
  input.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();results.querySelector('button')?.focus();}else if(e.key==='Enter'){e.preventDefault();results.querySelector('button')?.click();}});
  draw();input.focus();
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeCommands();});
 }
 function exportAudit(){
  if(!adminReady()||activeTab()!=='audit')return;
  const entries=Array.isArray(state.adminData)?state.adminData:[];
  if(!entries.length)return;
  if(!window.confirm('Nhật ký quản trị có thể chứa dữ liệu nhạy cảm. Chỉ lưu CSV trên thiết bị tin cậy. Bạn có muốn tiếp tục?'))return;
  const safe=v=>{
   let s=String(v??'').replace(/\r?\n/g,' ');
   if(/^[\s]*[=+@\-]/.test(s))s="'"+s;
   return '"'+s.replace(/"/g,'""')+'"';
  };
  const lines=[['Mã sự kiện','Thời điểm Unix','ID quản trị','Tên quản trị','Hành động','Mức độ','Chi tiết'],...entries.map(x=>[x.id,x.created_at,x.admin_id,x.admin_username||'',x.action,x.severity||'info',x.detail])];
  const blob=new Blob(['\ufeff'+lines.map(line=>line.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=make('a',{href:url,download:'mtunz-admin-audit-'+new Date().toISOString().slice(0,10)+'.csv'});
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function mount(){
  if(!adminReady()){lastKnownShell=null;return;}
  const shell=q('.admin-shell');
  if(shell===lastKnownShell&&q('.admin-workspace-top'))return;
  lastKnownShell=shell;buildTopBar();
 }
 const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;mount();});});
 function bootstrap(){const root=q('#app');if(root)observer.observe(root,{childList:true,subtree:false});mount();}
 document.addEventListener('DOMContentLoaded',bootstrap);
 if(document.readyState!=='loading')bootstrap();
 document.addEventListener('click',e=>{
  const target=e.target.closest('[data-admin-ui]');if(!target)return;
  const action=target.dataset.adminUi;
  if(action==='menu'){q('.admin-shell')?.classList.toggle('admin-menu-open');return}
  if(action==='close-menu'){q('.admin-shell')?.classList.remove('admin-menu-open');return}
  if(action==='commands'){showCommands();return}
  if(action==='refresh'){if(typeof loadAdmin==='function')loadAdmin();return}
  if(action==='security'){navigate('security');return}
  if(action.startsWith('go-')){closeCommands();navigate(action.slice(3));return}
  if(action==='export-audit'){exportAudit();return}
  if(action==='prev'||action==='next'){const state=valueFor(activeTab());state.page+=action==='next'?1:-1;refreshList();}
 });
 document.addEventListener('click',e=>{
  const th=e.target.closest('.admin-shell th[data-sort-index]');if(!th)return;
  const tab=activeTab(),index=Number(th.dataset.sortIndex),table=th.closest('table');
  const body=table?.querySelector('tbody');if(!body)return;
  if(sortState.tab!==tab||sortState.index!==index)sortState={tab,index,reverse:false};else sortState.reverse=!sortState.reverse;
  const rows=all('tr',body);
  rows.sort((a,b)=>{
   const left=a.cells[index]?.textContent.trim()||'',right=b.cells[index]?.textContent.trim()||'';
   return (sortState.reverse?-1:1)*left.localeCompare(right,'vi',{numeric:true,sensitivity:'base'});
  });
  rows.forEach(x=>body.append(x));
  all('th',table).forEach(x=>x.removeAttribute('aria-sort'));
  th.setAttribute('aria-sort',sortState.reverse?'descending':'ascending');refreshList();
 });
 document.addEventListener('keydown',e=>{
  if(e.target.matches('.admin-shell th[data-sort-index]')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.target.click();return;}
  const ticket=e.target.closest?.('.ticket-item[data-act="admin-open-ticket"]');
  if(ticket&&(e.key==='Enter'||e.key===' ')){e.preventDefault();ticket.click();return;}
  if(e.key==='Escape'){closeCommands();q('.admin-shell')?.classList.remove('admin-menu-open');return;}
  if(!adminReady()||e.target.closest('input,select,textarea,[contenteditable="true"]'))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();showCommands();}
  if(e.key==='/'){e.preventDefault();q('.admin-list-tools input[type="search"]')?.focus();}
 });
 document.addEventListener('input',e=>{
  const kind=e.target.dataset.adminFilter;if(kind!=='search')return;
  const config=valueFor(activeTab());config.search=e.target.value;config.page=0;refreshList();
 });
 document.addEventListener('change',e=>{
  if(e.target.id==='admin-auto-refresh'){autoRefresh=e.target.checked;return;}
  if(e.target.dataset.adminFilter==='status'){const config=valueFor(activeTab());config.status=e.target.value;config.page=0;refreshList();}
 });
 setInterval(()=>{
  if(!autoRefresh||!adminReady()||document.hidden||document.activeElement?.closest('.admin-page form,.admin-list-tools'))return;
  if(typeof loadAdmin==='function')loadAdmin();
 },60000);
})();