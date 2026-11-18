/* Admin Clarity v1 — display-only enhancement; keep existing privileged handlers. */
(function(){
'use strict';
const q=(s,r=document)=>r.querySelector(s);
const all=(s,r=document)=>Array.from(r.querySelectorAll(s));
let last=null,scheduled=false;
const ready=()=>!!q('.admin-shell')&&typeof state!=='undefined'&&!!state.user?.is_admin;
function el(tag,cls,text){
 const x=document.createElement(tag);if(cls)x.className=cls;
 if(text!==undefined)x.textContent=String(text);return x;
}
function sidebar(shell){
 const nav=q('.admin-nav',shell);if(!nav||q('.admin-nav-group',nav))return;
 nav.setAttribute('role','navigation');nav.setAttribute('aria-label','Điều hướng quản trị');
 q(':scope > .nav-label',nav)?.remove();
 const footer=q('.admin-rail-footer',nav)||q('.nav-spacer',nav);
 const buttons=new Map(all(':scope > button[data-act="admin-tab"]',nav).map(b=>[b.dataset.tab,b]));
 const groups=[
 ['BẢNG ĐIỀU KHIỂN',['overview']],
 ['THÀNH VIÊN & CỘNG ĐỒNG',['registrations','users','groups','tickets','deletions']],
 ['VẬN HÀNH & BẢO MẬT',['broadcast','audit','security']]
 ];
 for(const [label,tabs]of groups){
  const group=el('div','admin-nav-group');group.append(el('div','admin-nav-group-label',label));
  const list=el('div','admin-nav-group-items');
  for(const t of tabs){if(buttons.has(t))list.append(buttons.get(t));}
  group.append(list);nav.insertBefore(group,footer||null);
 }
}
function priority(shell){
 if(state.adminTab!=='overview'||!state.adminData?.stats)return;
 const page=q('.admin-page',shell);if(!page||q('.admin-priority-strip',page))return;
 const s=state.adminData.stats,n=x=>Math.max(0,Number(x)||0);
 const jobs=[
 ['registrations','Chờ duyệt tài khoản',n(s.pending),'Kiểm tra đăng ký mới'],
 ['tickets','Hỗ trợ đang mở',n(s.tickets),'Trả lời các yêu cầu hỗ trợ'],
 ['deletions','Yêu cầu chờ xóa',n(s.deletion_pending),'Kiểm tra thời hạn xử lý']
 ];
 const box=el('section','admin-priority-strip');box.setAttribute('aria-label','Công việc cần chú ý');
 const heading=el('div','admin-priority-heading'),a=el('div');
 a.append(el('span','admin-section-kicker','TRUNG TÂM ĐIỀU HÀNH'),el('h2','', 'Việc cần chú ý'));
 const pending=jobs.reduce((sum,j)=>sum+j[2],0);
 heading.append(a,el('p','admin-priority-summary',pending?pending.toLocaleString('vi-VN')+' mục đang chờ theo dữ liệu hiện tại':'Không có mục chờ xử lý theo dữ liệu hiện tại'));box.append(heading);
 const grid=el('div','admin-priority-items');
 for(const [tab,label,count,desc]of jobs){
  const b=el('button','admin-priority-card');b.type='button';
  b.dataset.adminUi='go-'+tab;b.setAttribute('aria-label',label+': '+count+' mục, mở danh sách');
  const copy=el('span','admin-priority-copy');
  copy.append(el('b','',label),el('small','',desc));
  b.append(el('strong','admin-priority-number',count.toLocaleString('vi-VN')),copy,el('span','admin-priority-arrow','›'));
  grid.append(b);
 }
 box.append(grid);
 (q('.admin-quick-links',page)||q('.stats-grid',page))?.before(box);
}
function compactActions(shell){
 if(state.adminTab!=='users')return;
 for(const bar of all('.admin-page .data-table .table-actions',shell)){
  if(q('.admin-action-details',bar))continue;
  const buttons=all('button[data-act]',bar);
  const rest=buttons.filter(b=>!['admin-user-detail','admin-user-edit'].includes(b.dataset.act));
  if(!rest.length)continue;
  const details=el('details','admin-action-details'),summary=el('summary','','Thêm thao tác'),content=el('div','admin-action-extra');
  for(const b of rest)content.append(b);
  details.append(summary,content);bar.append(details);bar.classList.add('admin-action-compact');
 }
}
function clearFilters(shell){
 const panel=q('.admin-page .admin-list-tools',shell);
 if(!panel||q('.admin-reset-filter',panel))return;
 const controls=q('.filter-controls',panel);if(!controls)return;
 const input=q('[data-admin-filter="search"]',controls),select=q('[data-admin-filter="status"]',controls);
 if(input){input.placeholder='Lọc các mục đã tải...';input.title='Chỉ lọc những mục đã tải';}
 const reset=el('button','admin-reset-filter','Xóa bộ lọc');reset.type='button';controls.append(reset);
 const visible=()=>reset.hidden=!(input?.value.trim()||(select&&select.value!=='all'));
 controls.addEventListener('input',visible);controls.addEventListener('change',visible);
 reset.addEventListener('click',()=>{
  if(input){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));}
  if(select){select.value='all';select.dispatchEvent(new Event('change',{bubbles:true}));}
  visible();input?.focus();
 });
 visible();
}
function mount(){
 if(!ready())return;
 const shell=q('.admin-shell');
 if(shell===last&&shell.classList.contains('admin-upgrade-ready'))return;
 last=shell;sidebar(shell);compactActions(shell);priority(shell);clearFilters(shell);
 const eyebrow=q('.admin-header .eyebrow',shell);
 if(eyebrow)eyebrow.textContent='MTUNZ / KHÔNG GIAN QUẢN TRỊ';
 const cmd=q('.admin-workspace-top [data-admin-ui="commands"]',shell);
 if(cmd)cmd.textContent='Tìm mục · Ctrl K';
 shell.classList.add('admin-upgrade-ready');
}
const observer=new MutationObserver(()=>{
 if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;mount();});
});
function boot(){const root=q('#app');if(root)observer.observe(root,{childList:true,subtree:false});mount();}
document.addEventListener('DOMContentLoaded',boot);
if(document.readyState!=='loading')boot();
document.addEventListener('keydown',event=>{
 if(!ready()||!(event.ctrlKey||event.metaKey)||event.key.toLowerCase()!=='k')return;
 if(!event.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
 event.preventDefault();event.stopImmediatePropagation();
 q('.admin-workspace-top [data-admin-ui="commands"]')?.click();
},true);
})();