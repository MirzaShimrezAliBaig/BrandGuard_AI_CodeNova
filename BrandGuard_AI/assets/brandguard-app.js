(() => {
'use strict';
const $ = id => document.getElementById(id);
const STORAGE='brandguard_round2_v1';
const riskyExample='Our platform guarantees a 40% increase in productivity and is the fastest solution available in the market. Our revolutionary AI powered system is 100% secure and works for every business.';
const cleanExample='BrandGuard helps teams review content against approved brand guidelines and product information. It brings content checks and reviewer decisions into one clear workflow.';
const defaultKnowledge=window.BrandGuardEngine.DEFAULT_KNOWLEDGE.map(x=>({...x}));
let state={knowledge:defaultKnowledge,history:[],approvals:[],activity:[],settings:{human:true,evidence:true,terms:true,readability:true,visual:true,externalAI:false},current:null,visualFile:null,visualData:null};
let activeWorkspaceId=null, activeWorkspaceRole=null;
function persist(){try{const snapshot={...state};if(activeWorkspaceId){snapshot.knowledge=[];if(backendInfo.teamReviewPersistenceEnabled){snapshot.history=[];snapshot.approvals=[];snapshot.activity=[];snapshot.current=null;}}localStorage.setItem(STORAGE,JSON.stringify(snapshot));}catch(e){}}
function loadState(){try{const saved=JSON.parse(localStorage.getItem(STORAGE)||'null');if(saved&&typeof saved==='object'){state={...state,...saved,settings:{...state.settings,...saved.settings}};}}catch(e){}}
function log(event,title,detail){state.activity.unshift({event,title,detail,time:new Date().toLocaleString()});state.activity=state.activity.slice(0,150);persist();renderActivity();if(activeWorkspaceId&&!['Human decision recorded','Sent for human review'].includes(event))saveCloudAudit(event,title,detail).catch(()=>{});}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

/* ===== BrandGuard UI layer: helpers ===== */
const ico=(n,c='')=>`<svg class="i ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const RUN_BTN_HTML='Run BrandGuard Review '+ico('arrow');
const fmtDate=iso=>{const d=new Date(iso);return isNaN(d)?'—':d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})};
const RISK_KEY=l=>({Critical:'critical',High:'high',Medium:'medium',Low:'low'}[l]||'low');
const CATS=['Brand guideline','Approved fact','Approved claim','Preferred terminology','Restricted terminology','Approved visual asset','Accessibility rule'];
const initials=s=>String(s||'?').replace(/@.*/,'').split(/[\s._-]+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('')||'?';
const capitalize=s=>s?s[0].toUpperCase()+s.slice(1):'';
const kpi=(l,v,f)=>`<div class="card kpi"><div class="kpi-label">${l}</div><div class="kpi-value">${v}</div><div class="kpi-foot">${f}</div></div>`;
const emptyState=(icon,title,text)=>`<div class="chart-empty">${ico(icon)}<strong>${title}</strong><span>${text}</span></div>`;
function setBadge(el,variant,text){if(!el)return;el.className='badge '+variant;if(text!==undefined)el.textContent=text;}
const isOpen=a=>!['Approved','Rejected'].includes(a.status);

/* toasts */
function toast(msg,type){
  const region=$('toast');
  if(!type){type=/failed|not saved|not submitted|error/i.test(msg)?'error':/^(enter|add |run |keep |use a|image must|only |your workspace role|content changed|this item has already)|could not/i.test(msg)?'warn':'success';}
  const el=document.createElement('div');el.className='toast '+type;
  el.innerHTML=ico(type==='error'?'err':type==='warn'?'alert':'ok')+'<span></span><button type="button" aria-label="Dismiss">'+ico('x','sm')+'</button>';
  el.querySelector('span').textContent=msg;
  const close=()=>{el.classList.add('out');setTimeout(()=>el.remove(),220)};
  el.querySelector('button').addEventListener('click',close);
  region.appendChild(el);while(region.children.length>3)region.firstChild.remove();
  setTimeout(close,type==='error'?5600:3400);
}

/* modals */
let lastFocus=null;
function openModal(id){lastFocus=document.activeElement;const m=$(id);m.classList.add('show');setTimeout(()=>{const f=m.querySelector('textarea:not([disabled]),input:not([disabled]),select,button');if(f)f.focus()},30);}
function closeModal(id){$(id).classList.remove('show');if(lastFocus&&lastFocus.focus)lastFocus.focus();}
function confirmDialog({title,message,confirmLabel='Confirm',danger=true}){
  return new Promise(resolve=>{
    $('confirmTitle').textContent=title;$('confirmMsg').textContent=message;
    const ok=$('confirmOk');ok.textContent=confirmLabel;ok.className='btn '+(danger?'danger solid':'primary');
    $('confirmIcon').className='m-ico '+(danger?'danger':'');
    const done=v=>{ok.onclick=null;$('confirmCancel').onclick=null;closeModal('confirmModal');resolve(v)};
    ok.onclick=()=>done(true);$('confirmCancel').onclick=()=>done(false);
    openModal('confirmModal');
  });
}
document.addEventListener('keydown',e=>{
  const m=document.querySelector('.modal-backdrop.show');
  if(!m){if(e.key==='Escape')closeNav();return;}
  if(e.key==='Escape'){if(m.id==='confirmModal')$('confirmCancel').click();else closeModal(m.id);return;}
  if(e.key==='Tab'){const f=[...m.querySelectorAll('button:not([disabled]),input:not([disabled]),select,textarea')].filter(x=>x.offsetParent!==null);if(!f.length)return;const first=f[0],last=f[f.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}
});
document.addEventListener('click',e=>{const t=e.target;if(t.classList&&t.classList.contains('modal-backdrop')){if(t.id==='confirmModal')$('confirmCancel').click();else closeModal(t.id);}});

/* sidebar */
function closeNav(){document.body.classList.remove('nav-open')}
function setSidebar(collapsed){document.documentElement.setAttribute('data-sb',collapsed?'collapsed':'expanded');try{localStorage.setItem('brandguard_sidebar_v1',collapsed?'collapsed':'expanded')}catch(e){}}
$('menuBtn').addEventListener('click',()=>document.body.classList.add('nav-open'));
$('sbBackdrop').addEventListener('click',closeNav);
$('sidebarToggle').addEventListener('click',()=>setSidebar(true));
$('sidebarExpand').addEventListener('click',()=>setSidebar(false));

function go(page){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+page));document.querySelectorAll('.nav button').forEach(b=>{const on=b.dataset.page===page;b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});const label={review:'Review Content',vault:'Knowledge Vault',approvals:'Approval Queue',insights:'Governance Insights',activity:'Audit Trail',team:'Team Workspace',settings:'Settings'}[page]||page;$('crumbName').textContent=label;document.title=label+' | BrandGuard AI';closeNav();if(page==='review'){renderReviewStats();renderPolicyPack();}if(page==='vault')renderVault();if(page==='approvals')renderApprovals();if(page==='insights')renderInsights();if(page==='activity')renderActivity();if(page==='settings'){syncSettings();renderSystemStatus();updateWorkspaceChrome();}if(page==='team')renderTeam();window.scrollTo({top:0,behavior:'smooth'});}
document.addEventListener('click',e=>{const b=e.target.closest('.nav button[data-page]');if(b){e.preventDefault();go(b.dataset.page);}});
$('helpBtn').addEventListener('click',()=>openModal('guideModal'));$('guideClose').addEventListener('click',()=>closeModal('guideModal'));
$('contentInput').addEventListener('input',()=>{$('charCount').textContent=$('contentInput').value.length.toLocaleString()+' characters'});
$('loadRisky').addEventListener('click',()=>{ $('contentTitle').value='Spring product campaign';$('contentType').value='Advertisement';$('contentInput').value=riskyExample;$('charCount').textContent=$('contentInput').value.length+' characters';toast('Risky example loaded. Run the review to inspect findings.');});
$('loadClean').addEventListener('click',()=>{ $('contentTitle').value='BrandGuard product introduction';$('contentType').value='Social media post';$('contentInput').value=cleanExample;$('charCount').textContent=$('contentInput').value.length+' characters';toast('Clean example loaded. Run the review to check it.');});
$('visualFile').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];state.visualFile=f||null;if(!f){$('imagePreview').style.display='none';state.visualData=null;return;}if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>5*1024*1024){$('imagePreview').style.display='none';return;}const url=URL.createObjectURL(f);$('imagePreview').src=url;$('imagePreview').style.display='block';});
function addFinding(arr,o){arr.push({id:o.id||('f'+Math.random().toString(36).slice(2,8)),severity:o.severity||'medium',category:o.category,title:o.title,rule:o.rule,problem:o.problem,evidence:o.evidence,source:o.source,fix:o.fix,confidence:o.confidence||90,matched:o.matched||''});}
function analyze(text,visual){return window.BrandGuardEngine.analyzeContent(text,{knowledge:state.knowledge,settings:state.settings,visual});}
function scoreFor(f){return f.reduce((n,x)=>n+({critical:46,high:33,medium:17,low:7}[x.severity]||0),0);}
async function runReview(){const text=$('contentInput').value.trim();if(!text){toast('Add content or load an example before running the review.');$('contentInput').focus();return;}if(text.length>14000){toast('Keep this review under 14,000 characters.');return;}const title=$('contentTitle').value.trim()||'Untitled content';const type=$('contentType').value;const btn=$('runReviewBtn');btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Reviewing content…';showSkeleton(true);renderPipeline('running');$('resultState').className='tag amber';$('resultState').textContent='Analysis in progress';let result=null,serverFallbackReason='';try{if(backendInfo.teamReviewPersistenceEnabled || (backendInfo.hostedAIAgentsAvailable && state.settings.externalAI && activeWorkspaceId)){const response=await fetch('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,content:text,contentType:type,workspaceId:activeWorkspaceId||null,knowledge:activeWorkspaceId?undefined:state.knowledge,settings:state.settings,visual:state.visualData?{name:state.visualData.name,brandShare:state.visualData.brandShare||0}:null,allowExternalAI:!!state.settings.externalAI})});if(response.ok){result=await response.json();}else{const err=await response.json().catch(()=>({}));throw new Error(err.error||'The review service could not be reached.');}}}catch(error){serverFallbackReason=String(error.message||'Server review unavailable.');console.warn('Backend review fallback:',serverFallbackReason);}if(!result){result=analyze(text,state.visualData);result.analysisMode='Local evidence-linked specialist rules';result.retrievalMethod='BM25 lexical relevance over approved knowledge';result.externalAIUsed=false;if(serverFallbackReason)result.aiFallbackReason='Server review service unavailable; local specialist rules were used instead. '+serverFallbackReason;}const record={id:'BG-'+Date.now().toString().slice(-7),title,type,text,findings:result.findings||[],agents:result.agents||[],retrievedSources:result.retrievedSources||[],governance:result.governance||{},analysisMode:result.analysisMode||'Evidence-linked specialist rules',externalAIUsed:!!result.externalAIUsed,reviewProof:result.reviewProof||null,score:result.score??scoreFor(result.findings||[]),riskLevel:result.riskLevel||'Low',status:'Review required',created:result.reviewedAt||new Date().toISOString(),visual:state.visualData?{name:state.visualData.name,size:state.visualData.size,type:state.visualData.type,preview:state.visualData.preview||null}:null};state.current=record;state.history.unshift(record);state.history=state.history.slice(0,100);persist();renderResult(record);log('Content reviewed',title,`${record.findings.length} finding(s) · ${record.riskLevel} risk · ${record.analysisMode}`);renderInsights();if(activeWorkspaceId){try{await saveCloudReview(record);}catch(e){toast('Review saved locally; cloud sync failed: '+e.message);}}btn.disabled=false;btn.innerHTML=RUN_BTN_HTML;requestAnimationFrame(()=>$('resultsCard').scrollIntoView({behavior:'smooth',block:'start'}));}

/* ===== Review page: stats, policy pack, workflow, results ===== */
function renderReviewStats(){
  const el=$('reviewStats');const total=state.history.length;
  if(!total){el.classList.add('hidden');return;}
  const all=state.history.flatMap(r=>r.findings||[]);
  const avg=Math.round(state.history.reduce((s,r)=>s+(r.score||0),0)/total);
  const pending=state.approvals.filter(isOpen).length;
  el.innerHTML=kpi('Reviews run',total,'In this workspace')+kpi('Findings detected',all.length,'Across all reviews')+kpi('Average risk score',avg+'/100','Based on reviewed items')+kpi('Pending approvals',pending,'Awaiting human decision');
  el.classList.remove('hidden');
}
function renderPolicyPack(){
  const rows=CATS.map(c=>{const e=state.knowledge.filter(k=>k.category===c);if(!e.length)return '';const vs=[...new Set(e.map(k=>k.version).filter(Boolean))];return `<div class="policy-item"><span>${escapeHtml(c)}<small>${e.length} record${e.length===1?'':'s'}</small></span>${vs.length?`<span class="ver">v${vs.map(escapeHtml).join(', v')}</span>`:''}</div>`}).join('');
  $('policyPack').innerHTML=rows||'<p class="helper">No approved knowledge records. Add entries in the Knowledge Vault.</p>';
  const s=state.settings;
  const line=(on,t)=>`<div class="check-line ${on?'':'off'}">${ico(on?'check':'x')}<span>${t}${on?'':' (off)'}</span></div>`;
  $('policyChecks').innerHTML=line(true,'Claims &amp; facts')+line(true,'Brand voice')+line(!!s.terms,'Terminology')+line(!!s.readability,'Accessibility &amp; readability')+line(!!s.visual,'Visual identity')+line(!!s.human,'Human approval gate');
}
function renderPipeline(mode,status){
  const steps=[['Content received','Draft and optional asset accepted'],['Evidence retrieved','Approved knowledge ranked by relevance'],['Specialist checks','Six specialist checks run'],['Governance score','Risk score and publication gate'],['Human decision','Approve, request changes or reject']];
  let st=['','','','',''];
  if(mode==='running')st=['done','active','','',''];
  else if(mode==='done'){st=['done','done','done','done','active'];if(['Approved','Rejected','Changes requested'].includes(status))st[4]='done';}
  let sub=steps[4][1];
  if(mode==='done')sub=({'Approved':'Approved by a human reviewer','Rejected':'Rejected by a human reviewer','Changes requested':'Changes requested by a human reviewer','Pending approval':'In the approval queue','Changes made · re-review required':'Re-run the review before approval'}[status])||'Awaiting a human reviewer';
  $('analysisPipeline').innerHTML=steps.map((s,i)=>`<li class="step ${st[i]}"><span class="step-dot">${st[i]==='done'?ico('check'):(st[i]==='active'&&mode==='running')?'<span class="spinner"></span>':i+1}</span><div><strong>${s[0]}</strong><small>${i===4?sub:s[1]}</small></div></li>`).join('');
}
function showSkeleton(on){$('resultsSkeleton').classList.toggle('hidden',!on);if(on){$('emptyResults').classList.add('hidden');$('reviewResults').classList.add('hidden');}}
function resetResultsView(){showSkeleton(false);$('emptyResults').classList.remove('hidden');$('reviewResults').classList.add('hidden');setBadge($('resultState'),'gray','Awaiting content');renderPipeline('idle');renderReviewStats();}
$('newReviewBtn').addEventListener('click',()=>{$('contentTitle').value='';$('contentInput').value='';$('charCount').textContent='0 characters';$('contentType').selectedIndex=0;$('visualFile').value='';$('imagePreview').style.display='none';state.visualFile=null;state.visualData=null;state.current=null;persist();resetResultsView();go('review');$('contentTitle').focus();toast('Ready for a new review. Your review history is unchanged.');});

function renderResult(r){
  showSkeleton(false);
  $('emptyResults').classList.add('hidden');$('reviewResults').classList.remove('hidden');
  const SEVR={critical:0,high:1,medium:2,low:3};const f=(r.findings||[]).slice().sort((a,b)=>(SEVR[a.severity]??4)-(SEVR[b.severity]??4));const hasF=f.length>0;
  setBadge($('resultState'),hasF?'err':'ok',hasF?'Analysis complete':'No configured issues detected');
  /* risk gauge */
  const key=RISK_KEY(r.riskLevel);const C=2*Math.PI*40;const score=Math.min(100,Math.max(0,Number(r.score)||0));
  $('riskPanel').className='panel risk-panel risk-'+key;
  $('scoreRing').innerHTML=`<svg class="gauge" viewBox="0 0 96 96" role="img" aria-label="Risk score ${score} out of 100"><circle class="g-bg" cx="48" cy="48" r="40"/><circle class="g-fg" cx="48" cy="48" r="40" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C*(1-score/100)).toFixed(1)}"/></svg><div class="g-num"><b id="scoreNumber">${score}</b><small>/ 100</small></div>`;
  $('riskLabel').textContent=r.riskLevel==='Critical'?'Critical risk detected':r.score>=60?'High risk detected':r.score>=25?'Some changes recommended':'Low risk';
  $('riskSummary').textContent=hasF?'Review the findings and resolve or acknowledge them before publication.':'No configured issue was detected. Human review is still required before publication.';
  setBadge($('overallStatus'),(r.riskLevel==='Critical'||r.riskLevel==='High')?'err':hasF?'warn':'ok',r.governance?.publicationGate||(hasF?'Human review recommended':'Human approval still required'));
  const sc=['critical','high','medium','low'].map(k=>[k,f.filter(x=>x.severity===k).length]).filter(x=>x[1]);
  $('sevCounts').innerHTML=sc.length?sc.map(([k,n])=>`<span class="sev ${k}">${n} ${k[0].toUpperCase()+k.slice(1)}</span>`).join(''):'<span class="sev passed">Passed</span>';
  $('findingCount').textContent=f.length;
  $('reviewStatusText').textContent=r.status==='Approved'?'Approved by human reviewer.':r.status==='Changes requested'?'Changes requested by human reviewer.':'Human reviewer required before publication.';
  $('sendReviewBtn').textContent=r.status==='Pending approval'?'In approval queue':'Send for human review';
  $('sendReviewBtn').disabled=r.status==='Pending approval'||r.status==='Approved';
  /* findings */
  $('findingList').innerHTML=hasF?f.map((x,i)=>{
    const k=['critical','high','medium','low'].includes(x.severity)?x.severity:'medium';const open=i===0||k==='critical'||k==='high';
    const gap=x.evidenceStatus==='gap';
    return `<article class="finding ${k} ${open?'open':''} ${x.acknowledged?'acked':''}" data-finding="${escapeHtml(x.id)}">
      <div class="finding-head" role="button" tabindex="0" aria-expanded="${open}">
        <span class="sev ${k}">${k[0].toUpperCase()+k.slice(1)}</span>
        <div class="finding-title"><strong>${escapeHtml(x.title)}</strong><small>${escapeHtml(x.category)} · ${escapeHtml(x.rule)}</small></div>
        <span class="ack-slot">${x.acknowledged?'<span class="sev ack">Acknowledged</span>':''}</span>
        ${ico('chev-down','chev')}
      </div>
      <div class="finding-body"><dl class="kv">
        <div><dt>Detected issue</dt><dd>${escapeHtml(x.title)}${x.matched?` — <mark>“${escapeHtml(x.matched)}”</mark>`:''}</dd></div>
        <div><dt>Explanation</dt><dd>${escapeHtml(x.problem)}</dd></div>
        <div class="evidence"><dt>Supporting evidence</dt><dd><p>${escapeHtml(x.evidence)}</p><div class="ev-meta">${gap?'<span class="badge warn">Evidence gap · human verification required</span>':'<span class="badge ok">Matched to approved knowledge</span>'}${state.settings.evidence?`<span class="badge gray">Confidence ${escapeHtml(x.confidence)}%</span>`:''}</div></dd></div>
        <div><dt>Source reference</dt><dd class="src-ref"><span>${escapeHtml(x.source)}</span>${x.sourceId?`<code>ID ${escapeHtml(x.sourceId)}</code>`:''}</dd></div>
        <div class="fixbox"><dt>Suggested correction</dt><dd>${escapeHtml(x.fix)}</dd></div>
      </dl>
      <div class="finding-actions"><button class="btn small primary apply-fix" data-id="${escapeHtml(x.id)}">${ico('check','sm')} Apply fix</button><button class="btn small ignore-finding" data-id="${escapeHtml(x.id)}" ${x.acknowledged?'disabled':''}>Acknowledge</button><button class="btn small view-source" data-source="${escapeHtml(x.source)}" data-sourceid="${escapeHtml(x.sourceId||'')}">${ico('vault','sm')} View rule in vault</button></div></div>
    </article>`}).join(''):`<div class="passed-state">${ico('ok','xl')}<div><span class="sev passed" style="margin-bottom:6px">Passed</span><strong>No configured issues detected</strong><p>Still send this content to a human reviewer before treating it as approved.</p></div></div>`;
  document.querySelectorAll('.finding-head').forEach(h=>{const toggle=()=>{const a=h.closest('.finding');a.classList.toggle('open');h.setAttribute('aria-expanded',a.classList.contains('open')?'true':'false')};h.addEventListener('click',toggle);h.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}})});
  document.querySelectorAll('.apply-fix').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();applyFix(b.dataset.id)}));
  document.querySelectorAll('.ignore-finding').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();ackFinding(b.dataset.id)}));
  document.querySelectorAll('.view-source').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const k=state.knowledge.find(z=>z.id===b.dataset.sourceid);go('vault');if(k){vaultState.q=k.title||k.category;vaultState.cat='';$('vaultSearch').value=vaultState.q;renderVault();toast('Showing the cited source in the knowledge vault.');}else toast('Find the cited source in the knowledge vault.');}));
  /* visual */
  const vr=$('visualResult');if(r.visual){vr.classList.remove('hidden');vr.innerHTML=`<strong>Visual asset check · ${escapeHtml(r.visual.name)}</strong>Image attached for local review. The prototype checks the registered filename pattern and samples the approved navy/teal palette; this is a coarse heuristic, not AI logo recognition or proof of rights/approval. Check the expanded finding for sample details.`;}else vr.classList.add('hidden');
  /* specialist checks */
  $('agentPanel').innerHTML=(r.agents||[]).map(a=>{const n=a.findingsCount||0;const cls=n?(a.status==='Flagged'?'flagged':'review'):'';const sev=n?(a.status==='Flagged'?'high':'medium'):'passed';
    return `<div class="agent-tile ${cls}"><div class="agent-top"><strong>${escapeHtml(a.name)}</strong><span class="sev ${sev}">${n?escapeHtml(n+' finding'+(n===1?'':'s')):'Passed'}</span></div><p>${escapeHtml(a.summary||a.description||'Specialist check complete')}</p><div class="agent-foot"><span>${escapeHtml(a.mode||'Specialist check')}</span><span>${a.confidence===null||a.confidence===undefined?'':'Confidence <b>'+escapeHtml(a.confidence)+'%</b>'}</span></div></div>`}).join('');
  /* governance */
  const g=r.governance||{};
  $('governancePanel').innerHTML=`<h3>Governance decision</h3><div class="gov-grid"><div class="gov-cell"><small>Risk level</small><strong>${escapeHtml(g.riskLevel||r.riskLevel||'Low')} · ${escapeHtml((g.score??r.score)+'/100')}</strong></div><div class="gov-cell"><small>Publication gate</small><strong>${escapeHtml(g.publicationGate||'Human review recommended')}</strong></div><div class="gov-cell"><small>Findings</small><strong>${escapeHtml(String(g.findingCount??f.length))}</strong></div><div class="gov-cell"><small>Evidence gaps</small><strong>${escapeHtml(String(g.evidenceGaps??f.filter(x=>x.evidenceStatus==='gap').length))}</strong></div></div><div class="gov-note"><p>${escapeHtml(g.recommendation||'Human approval remains the final decision.')}</p><p><b>Analysis:</b> ${escapeHtml(r.analysisMode||'Evidence-linked specialist rules')}${r.externalAIUsed?' · Hosted AI used with user consent':''}</p>${r.aiFallbackReason?`<p><b>Fallback:</b> ${escapeHtml(r.aiFallbackReason)}</p>`:''}</div>`;
  /* evidence */
  const sources=r.retrievedSources||[];
  $('retrievalPanel').innerHTML=`<h3>Evidence retrieved <span class="badge blue">${sources.length} source${sources.length===1?'':'s'}</span></h3><p class="helper">Ranked using BM25 lexical relevance over approved knowledge. This build does not use vector embeddings.</p>${sources.length?`<div class="retrieval-list">${sources.slice(0,6).map(x=>`<div class="retrieval-item"><strong>${escapeHtml(x.title||x.category||'Knowledge item')}</strong><small>${escapeHtml(x.category||'Approved knowledge')} · ${escapeHtml(x.source||'Workspace source')}${x.version?' · v'+escapeHtml(x.version):''}</small><div class="rel"><div class="rel-track"><span style="width:${Math.max(4,Math.min(100,x.relevance||0))}%"></span></div><span>${Math.round(x.relevance||0)}% relevance</span></div><p>${escapeHtml((x.text||'').slice(0,190))}${(x.text||'').length>190?'…':''}</p></div>`).join('')}</div>`:'<p class="helper">No matching approved knowledge item was retrieved. Findings that need evidence will be marked as an evidence gap.</p>'}`;
  renderPipeline('done',r.status);
  renderReviewStats();
}

function applyFix(id){const r=state.current;if(!r)return;const f=r.findings.find(x=>x.id===id);if(!f)return;let before=$('contentInput').value;let after=before;if(f.matched&&before.includes(f.matched))after=before.replace(f.matched,f.fix);else if(f.category==='Terminology'&&/users/i.test(before))after=before.replace(/\busers\b/gi,'teams').replace(/\bAI powered\b/gi,'AI-powered');else if(f.category==='Brand voice'&&f.matched)after=before.replace(f.matched,'practical');else if(f.category==='Claims & facts'&&f.matched)after=before.replace(f.matched,'Designed to support teams with content review and brand-governance workflows.');if(after===before){toast('Suggested text could not be placed automatically. Copy the correction from the finding.');return;}$('contentInput').value=after;$('charCount').textContent=after.length+' characters';r.text=after;r.status='Changes made · re-review required';log('Suggested fix applied',r.title,f.rule);renderPipeline('done',r.status);toast('Suggested correction applied. Run the review again before approval.');$('reviewStatusText').textContent='Content changed. Re-run the review before sending for approval.';$('sendReviewBtn').disabled=true;$('sendReviewBtn').textContent='Re-review required';}
function ackFinding(id){if(!state.current)return;const f=state.current.findings.find(x=>x.id===id);if(!f)return;f.acknowledged=true;const el=document.querySelector(`[data-finding="${CSS.escape(id)}"]`);if(el){el.classList.add('acked');const slot=el.querySelector('.ack-slot');if(slot)slot.innerHTML='<span class="sev ack">Acknowledged</span>';const b=el.querySelector('.ignore-finding');if(b)b.disabled=true;}log('Finding acknowledged',state.current.title,f.rule);persist();toast('Finding acknowledged. It remains visible in the review record.');}
$('runReviewBtn').addEventListener('click',runReview);
$('saveDraftBtn').addEventListener('click',()=>{if(!state.current){toast('Run a review first.');return;}state.current.status='Draft saved';persist();log('Draft saved',state.current.title,'Saved locally; not approved for publication.');toast('Draft saved locally. It is not approved for publication.');});
$('sendReviewBtn').addEventListener('click',async()=>{if(!state.current){toast('Run a review first.');return;}if($('contentInput').value.trim()!==state.current.text){toast('Content changed after the review. Run the review again first.');return;}if(state.current.status==='Pending approval'||state.current.status==='Approved'){toast('This item has already been submitted.');return;}const record=state.current,exists=state.approvals.find(a=>a.id===record.id),previous=record.status,btn=$('sendReviewBtn');btn.disabled=true;btn.textContent='Submitting…';record.status='Pending approval';record.comment='';if(activeWorkspaceId){try{if(!record.cloudSaved)await saveCloudReview(record);await saveCloudDecision(record);}catch(e){record.status=previous;btn.disabled=false;btn.textContent='Send for human review';toast('The item was not submitted to the cloud queue: '+e.message);return;}}if(!exists)state.approvals.unshift({...record,comment:'',decision:''});persist();log('Sent for human review',record.title,'Added to the reviewer queue with the attached visual asset.');renderResult(record);renderApprovals();renderNavCount();btn.disabled=true;btn.textContent='In human review queue';go('approvals');toast(backendInfo.teamReviewPersistenceEnabled?'Sent to the shared human approval queue.':'Sent to the local human review queue. In a connected workspace, this same request is synced to authorised reviewers.');});
function renderNavCount(){const n=state.approvals.filter(isOpen).length;const b=$('approvalNavCount');b.textContent=n;b.classList.toggle('hidden',!n);renderReviewStats();}

/* ===== Knowledge Vault ===== */
const vaultState={q:'',cat:''};
const catClass=c=>({'Restricted terminology':'restricted','Preferred terminology':'preferred','Approved claim':'claim','Approved fact':'fact','Approved visual asset':'visual','Accessibility rule':'access','Brand guideline':'brand'}[c]||'');
const canEditKnowledge=()=>!activeWorkspaceId||['owner','admin'].includes(activeWorkspaceRole);
function renderVault(){
  const q=vaultState.q.trim().toLowerCase();
  const list=state.knowledge.filter(k=>(!vaultState.cat||k.category===vaultState.cat)&&(!q||[k.title,k.category,k.text,k.source].join(' ').toLowerCase().includes(q)));
  const n=c=>state.knowledge.filter(k=>k.category===c).length;
  $('vaultCategories').innerHTML=`<button class="fchip ${!vaultState.cat?'active':''}" data-cat="">All <b>${state.knowledge.length}</b></button>`+CATS.map(c=>`<button class="fchip ${vaultState.cat===c?'active':''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)} <b>${n(c)}</b></button>`).join('');
  $('vaultCount').textContent=`${list.length} of ${state.knowledge.length} entr${state.knowledge.length===1?'y':'ies'}`;
  const edit=canEditKnowledge();
  $('vaultRows').innerHTML=list.length?list.map(k=>{const title=k.title&&k.title!==k.category?k.title:k.category;
    return `<tr><td class="cell-main"><div class="t-title">${escapeHtml(title)}</div><div class="t-clip">${escapeHtml(k.text)}</div></td><td data-label="Category"><span class="cat-badge ${catClass(k.category)}">${escapeHtml(k.category)}</span></td><td data-label="Source">${escapeHtml(k.source||'Workspace entry')}</td><td data-label="Version" class="ver nowrap">${k.version?'v'+escapeHtml(k.version):'—'}</td><td data-label="Status" class="nowrap"><span class="badge ok">${escapeHtml(k.status||'Approved')}</span></td><td class="cell-actions"><div class="t-actions">${edit?`<button class="btn small" data-act="edit" data-id="${escapeHtml(k.id)}" aria-label="Edit ${escapeHtml(title)}">${ico('pencil','sm')} Edit</button><button class="btn small danger" data-act="delete" data-id="${escapeHtml(k.id)}" aria-label="Delete ${escapeHtml(title)}">${ico('trash','sm')} Delete</button>`:'<span class="muted" style="font-size:12.5px">View only</span>'}</div></td></tr>`}).join(''):`<tr class="empty-row"><td colspan="6">${state.knowledge.length?'No entries match your search or filter.':'No approved knowledge entries yet. Add the first entry to start reviewing against your own rules.'}</td></tr>`;
  $('addKnowledgeBtn').classList.toggle('hidden',!edit);
}
$('vaultSearch').addEventListener('input',e=>{vaultState.q=e.target.value;renderVault();});
$('vaultCategories').addEventListener('click',e=>{const b=e.target.closest('[data-cat]');if(!b)return;vaultState.cat=b.dataset.cat;renderVault();});
$('vaultRows').addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;if(b.dataset.act==='edit')editKnowledge(b.dataset.id);else if(b.dataset.act==='delete')deleteKnowledge(b.dataset.id);});
function openKnowledge(k){openModal('knowledgeModal');$('knowledgeModal').dataset.editId=k?.id||'';$('modalTitle').textContent=k?'Edit knowledge entry':'Add knowledge entry';$('knowledgeCategory').value=k?.category||'Approved fact';$('knowledgeTitle').value=k?.title&&k.title!==k.category?k.title:'';$('knowledgeText').value=k?.text||'';$('knowledgeSource').value=k?.source||'';setTimeout(()=>$('knowledgeText').focus(),40);}
function editKnowledge(id){const k=state.knowledge.find(x=>x.id===id);if(k)openKnowledge(k)}
async function deleteKnowledge(id){
  const k=state.knowledge.find(x=>x.id===id);if(!k)return;
  if(!canEditKnowledge()){toast('Only workspace owners and admins can edit approved knowledge.');return;}
  const ok=await confirmDialog({title:'Delete knowledge entry?',message:'“'+(k.title||k.category)+'” will be removed from the vault and will no longer be used as evidence in new reviews. This cannot be undone.',confirmLabel:'Delete entry',danger:true});
  if(!ok)return;
  if(activeWorkspaceId&&backendInfo.teamWorkspaceEnabled){try{await apiCall('/api/knowledge?workspace_id='+encodeURIComponent(activeWorkspaceId)+'&client_id='+encodeURIComponent(k.id),{method:'DELETE'});}catch(e){toast('Cloud knowledge delete failed: '+e.message);return;}}
  state.knowledge=state.knowledge.filter(x=>x.id!==id);persist();renderVault();renderPolicyPack();
  log('Knowledge entry deleted',k.category,k.title||String(k.text||'').slice(0,90));
  toast('Knowledge entry deleted.');
}
$('addKnowledgeBtn').addEventListener('click',()=>{if(activeWorkspaceId&&!['owner','admin'].includes(activeWorkspaceRole)){toast('Only workspace owners and admins can edit approved knowledge.');return;}openKnowledge(null)});
$('cancelKnowledgeBtn').addEventListener('click',()=>closeModal('knowledgeModal'));
$('saveKnowledgeBtn').addEventListener('click',()=>{const category=$('knowledgeCategory').value,text=$('knowledgeText').value.trim(),source=$('knowledgeSource').value.trim(),title=$('knowledgeTitle').value.trim()||category;if(!text){toast('Enter the approved rule or information.');$('knowledgeText').focus();return;}const id=$('knowledgeModal').dataset.editId;let item;if(id){item=state.knowledge.find(x=>x.id===id);if(item)Object.assign(item,{category,text,source,title,status:'Approved'});if(item&&activeWorkspaceId)saveCloudKnowledge(item,true).catch(e=>toast('Cloud knowledge update failed: '+e.message));}else{item={id:'k'+Date.now(),category,text,source,title,status:'Approved'};state.knowledge.push(item);if(activeWorkspaceId)saveCloudKnowledge(item,false).catch(e=>toast('Cloud knowledge save failed: '+e.message));}persist();closeModal('knowledgeModal');renderVault();renderPolicyPack();log(id?'Knowledge entry updated':'Knowledge entry added',category,source||text.slice(0,90));toast('Knowledge vault updated. New reviews will use this entry where supported.');});


/* ===== Approval Queue ===== */
const apprFilter={s:'all'};
const STATUS_BADGE={'Pending approval':'warn','Approved':'ok','Rejected':'err','Changes requested':'blue'};
const reviewerName=()=>teamUser?.name||teamUser?.email||'Workspace owner';
const riskBadge=a=>(a.findings||[]).length?`<span class="sev ${RISK_KEY(a.riskLevel)}">${escapeHtml(a.riskLevel||'Low')}</span>`:'<span class="sev passed">Passed</span>';
function renderApprovals(){
  const all=state.approvals;const st=a=>a.status||'Pending approval';const cnt=s=>all.filter(a=>st(a)===s).length;
  const open=all.filter(isOpen).length;
  $('queueSummary').textContent=open+' pending decision'+(open===1?'':'s');
  $('approvalStats').innerHTML=kpi('Awaiting decision',open,'Pending or changes requested')+kpi('Approved',cnt('Approved'),'Human approved')+kpi('Changes requested',cnt('Changes requested'),'Returned to author')+kpi('Rejected',cnt('Rejected'),'Not cleared for publication');
  const FIL=[['all','All'],['Pending approval','Pending'],['Changes requested','Changes requested'],['Approved','Approved'],['Rejected','Rejected']];
  $('approvalFilter').innerHTML=FIL.map(([k,l])=>`<button class="fchip ${apprFilter.s===k?'active':''}" data-s="${escapeHtml(k)}">${l} <b>${k==='all'?all.length:cnt(k)}</b></button>`).join('');
  const list=apprFilter.s==='all'?all:all.filter(a=>st(a)===apprFilter.s);
  $('approvalCount').textContent=`${list.length} of ${all.length} item${all.length===1?'':'s'}`;
  $('approvalRows').innerHTML=list.length?list.map(a=>{const final=['Approved','Rejected'].includes(a.status);const s=st(a);
    return `<tr><td class="cell-main"><button class="t-title" style="background:none;border:0;padding:0;text-align:left;color:var(--accent-2);font-weight:500;font-size:13.5px" data-act="view" data-id="${escapeHtml(a.id)}">${escapeHtml(a.title)}</button><div class="t-sub">${escapeHtml(a.type)} · ${(a.findings||[]).length} finding(s) · ${escapeHtml(a.id)}</div></td><td data-label="Risk level" class="nowrap">${riskBadge(a)} <span class="t-sub" style="margin-left:4px">${escapeHtml(a.score)}/100</span></td><td data-label="Submitted" class="nowrap">${fmtDate(a.created)}</td><td data-label="Status" class="nowrap"><span class="badge ${STATUS_BADGE[s]||'gray'}">${escapeHtml(s)}</span></td><td data-label="Reviewer">${a.reviewer?escapeHtml(a.reviewer):(final?'—':'<span class="muted">Unassigned</span>')}</td><td class="cell-actions"><div class="t-actions">${final?`<button class="btn small" data-act="view" data-id="${escapeHtml(a.id)}">${ico('eye','sm')} View decision</button>`:`<button class="btn small success" data-act="Approved" data-id="${escapeHtml(a.id)}">${ico('check','sm')} Approve</button><button class="btn small warn" data-act="Changes requested" data-id="${escapeHtml(a.id)}">${ico('message','sm')} Request changes</button><button class="btn small danger" data-act="Rejected" data-id="${escapeHtml(a.id)}">${ico('x','sm')} Reject</button>`}</div></td></tr>`}).join(''):`<tr class="empty-row"><td colspan="6"><div class="table-empty"><div class="empty-icon">${ico('approvals','lg')}</div><strong style="display:block;color:var(--text)">${all.length?'No items with this status':'No items in the approval queue'}</strong><span>${all.length?'Choose another filter to see more items.':'Run a content review and select “Send for human review” to create an approval item.'}</span></div></td></tr>`;
  renderNavCount();
}
$('approvalFilter').addEventListener('click',e=>{const b=e.target.closest('[data-s]');if(!b)return;apprFilter.s=b.dataset.s;renderApprovals();});
$('approvalRows').addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;openDecision(b.dataset.id,b.dataset.act==='view'?null:b.dataset.act);});
let decisionCtx=null;
function openDecision(id,action){
  const a=state.approvals.find(x=>x.id===id);if(!a)return;
  const final=['Approved','Rejected'].includes(a.status);decisionCtx={id,action:action||null};
  $('decisionTitle').textContent=final?'Decision record':action==='Approved'?'Approve content':action==='Rejected'?'Reject content':action==='Changes requested'?'Request changes':'Review decision';
  $('decisionSub').textContent=final?'This item has a recorded human decision.':'Review the findings, add a comment and record the outcome.';
  const cats=(a.findings||[]).map(x=>x.category).filter((v,i,arr)=>arr.indexOf(v)===i).join(', ')||'No rule violations detected';
  $('decisionSummary').innerHTML=`<div class="row"><div><div class="t-title">${escapeHtml(a.title)}</div><div class="t-sub">${escapeHtml(a.type)} · ${escapeHtml(a.id)}</div></div><div>${riskBadge(a)} <span class="t-sub">${escapeHtml(a.score)}/100</span></div></div><div><div class="label" style="margin-bottom:2px">Automated checks</div><div class="excerpt">${escapeHtml(cats)}</div></div><div><div class="label" style="margin-bottom:2px">Submitted content</div><div class="excerpt">${escapeHtml(String(a.text||'').slice(0,320))}${String(a.text||'').length>320?'…':''}</div></div>${a.visual?.preview?`<div class="review-asset"><img src="${a.visual.preview}" alt="Submitted visual asset"><div><b>Visual asset attached</b><small>${escapeHtml(a.visual.name||'Attached image')}</small></div></div>`:''}`;
  $('decisionForm').classList.toggle('hidden',final);$('decisionNote').classList.toggle('hidden',!final);
  if(final)$('decisionNote').innerHTML=`${ico('info')}<span><b>Decision note:</b> ${escapeHtml(a.comment||'No comment added.')}${a.reviewer?` · ${escapeHtml(a.reviewer)}`:''}</span>`;
  $('decisionComment').value=a.comment||'';
  $('decisionHint').textContent=(action==='Approved'&&a.score<60)?'Optional for low-risk content.':(!action&&a.score<60)?'A comment is required unless you are approving low-risk content.':'A comment is required to record this decision.';
  const cls={'Approved':['success','Approve'],'Changes requested':['warn solid','Request changes'],'Rejected':['danger solid','Reject']};
  $('decisionActions').innerHTML=final?'<button class="btn" data-close>Close</button>':action?`<button class="btn" data-close>Cancel</button><button class="btn ${cls[action][0]}" data-do="${escapeHtml(action)}">${cls[action][1]}</button>`:`<button class="btn" data-close>Cancel</button><button class="btn warn" data-do="Changes requested">Request changes</button><button class="btn danger" data-do="Rejected">Reject</button><button class="btn success" data-do="Approved">Approve</button>`;
  openModal('decisionModal');
  if(!final)setTimeout(()=>$('decisionComment').focus(),40);
}
$('decisionActions').addEventListener('click',async e=>{
  if(e.target.closest('[data-close]')){closeModal('decisionModal');return;}
  const b=e.target.closest('[data-do]');if(!b||!decisionCtx)return;
  const all=[...$('decisionActions').querySelectorAll('button')];all.forEach(x=>x.disabled=true);
  const ok=await decide(decisionCtx.id,b.dataset.do,$('decisionComment').value.trim());
  all.forEach(x=>x.disabled=false);
  if(ok)closeModal('decisionModal');
});

async function decide(id,action,commentArg){if(activeWorkspaceId&&!['owner','admin','reviewer'].includes(activeWorkspaceRole)){toast('Your workspace role cannot record approval decisions.');return false;}const a=state.approvals.find(x=>x.id===id);if(!a)return false;const comment=typeof commentArg==='string'?commentArg.trim():'';if((action!=='Approved'||a.score>=60)&&!comment){toast(a.score>=60&&action==='Approved'?'Add an approval justification for high-risk content.':'Add a reviewer comment explaining the decision.');return false;}if(activeWorkspaceId){try{await saveCloudDecision(a,action,comment);}catch(e){toast('Decision was not saved to the workspace: '+e.message);return false;}}a.status=action;a.comment=comment;a.reviewer=reviewerName();a.decidedAt=new Date().toISOString();const h=state.history.find(x=>x.id===id);if(h)h.status=action;if(state.current?.id===id){state.current.status=action;$('reviewStatusText').textContent=action==='Approved'?'Approved by human reviewer.':'Human reviewer decision: '+action+'.';$('sendReviewBtn').disabled=true;}if(state.current?.id===id)renderPipeline('done',action);persist();log('Human decision recorded',a.title,action+(comment?' · '+comment:''));renderApprovals();renderNavCount();toast('Human decision recorded: '+action+'.');return true;}

/* ===== Governance Insights (all charts are computed from real review history) ===== */
function hbars(rows,total){const max=Math.max(1,...rows.map(r=>r[1]));return `<div class="hbars">${rows.map(([l,n])=>`<div><div class="hbar-top"><span>${escapeHtml(l)}</span><b>${n}${total?` <span class="muted" style="font-weight:400">(${Math.round(n/total*100)}%)</span>`:''}</b></div><div class="hbar-track"><span style="width:${n/max*100}%"></span></div></div>`).join('')}</div>`;}
function topBy(list,keyFn,limit){const m=new Map();list.forEach(x=>{const k=keyFn(x);if(!k)return;m.set(k,(m.get(k)||0)+1)});return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,limit);}
function renderInsights(){
  const hist=state.history,all=hist.flatMap(r=>r.findings||[]);
  const pending=state.approvals.filter(isOpen).length,total=hist.length;
  const avg=total?Math.round(hist.reduce((s,r)=>s+(r.score||0),0)/total):0;
  $('insightStats').innerHTML=[['Items reviewed',total,'In this workspace'],['Findings detected',all.length,'Configured rule matches'],['Average risk score',avg+'/100','Based on reviewed items'],['Pending approvals',pending,'Awaiting human decision']].map(x=>kpi(x[0],x[1],x[2])).join('');
  /* review activity */
  const days=[];for(let i=13;i>=0;i--){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);days.push(d)}
  const counts=days.map(d=>hist.filter(r=>{const t=new Date(r.created);return !isNaN(t)&&t.toDateString()===d.toDateString()}).length);
  const peak=Math.max(...counts);
  $('chartActivity').innerHTML=peak?`<div class="cols">${days.map((d,i)=>`<div class="col ${counts[i]?'':'zero'}" data-tip="${counts[i]} review${counts[i]===1?'':'s'} · ${d.toLocaleDateString(undefined,{day:'numeric',month:'short'})}"><div class="col-val">${counts[i]||''}</div><div class="col-bar" style="height:${counts[i]?Math.max(6,Math.round(counts[i]/peak*100)):3}px"></div><small>${d.getDate()}</small></div>`).join('')}</div>`:emptyState('insights','No review activity yet','Run a content review and daily activity will appear here.');
  /* risk distribution */
  const lv=[['Low','#22A06B'],['Medium','#D97706'],['High','#EA580C'],['Critical','#9B1C2E']].map(([l,c])=>[l,c,hist.filter(r=>r.riskLevel===l).length]);
  if(total){const R=52,C=2*Math.PI*R;let off=0;const segs=lv.filter(x=>x[2]).map(([l,c,n])=>{const len=n/total*C;const s=`<circle cx="66" cy="66" r="${R}" stroke="${c}" stroke-dasharray="${len.toFixed(2)} ${(C-len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"><title>${l}: ${n}</title></circle>`;off+=len;return s}).join('');
    $('chartRisk').innerHTML=`<div class="donut-wrap"><div class="donut"><svg viewBox="0 0 132 132" role="img" aria-label="Risk distribution"><circle cx="66" cy="66" r="52" stroke="#F1F5F9"/>${segs}</svg><div class="donut-c"><div><b>${total}</b><br><small>reviews</small></div></div></div><div class="legend">${lv.map(([l,c,n])=>`<div><i style="background:${c}"></i>${l}<b>${n}</b></div>`).join('')}</div></div>`;
  }else $('chartRisk').innerHTML=emptyState('gauge','No risk data yet','Overall risk levels appear here after your first review.');
  /* common policy violations */
  const rules=topBy(all,x=>x.rule,5);
  $('chartRules').innerHTML=rules.length?hbars(rules):emptyState('flag','No violations recorded','Triggered rules appear here once findings are detected.');
  /* issue categories */
  const cats=['Claims & facts','Brand voice','Terminology','Visual identity','Accessibility & readability'];
  const cc=cats.map(c=>[c,all.filter(x=>x.category===c).length]);
  $('issueBars').innerHTML=all.length?hbars(cc,all.length):emptyState('list','No findings yet','Category breakdown appears after a review detects issues.');
  /* approvals */
  const ap=state.approvals;
  if(ap.length){const st=[['Pending approval','Pending','#D97706'],['Changes requested','Changes requested','#2563EB'],['Approved','Approved','#22A06B'],['Rejected','Rejected','#B4373D']].map(([k,l,c])=>[l,c,ap.filter(a=>(a.status||'Pending approval')===k).length]);const dec=ap.filter(a=>['Approved','Rejected'].includes(a.status)).length;
    $('chartApprovals').innerHTML=`<div class="segbar">${st.filter(x=>x[2]).map(([l,c,n])=>`<span style="width:${n/ap.length*100}%;background:${c}" title="${l}: ${n}"></span>`).join('')}</div><div class="legend">${st.map(([l,c,n])=>`<div><i style="background:${c}"></i>${l}<b>${n}</b></div>`).join('')}</div><p class="helper" style="margin-top:12px">${dec?`${ap.filter(a=>a.status==='Approved').length} of ${dec} final decision${dec===1?'':'s'} approved.`:'No final decisions recorded yet.'}</p>`;
  }else $('chartApprovals').innerHTML=emptyState('approvals','No approvals yet','Send a reviewed item to the queue to track decisions.');
  /* frequent issues */
  const issues=topBy(all,x=>x.title,6);
  $('chartIssues').innerHTML=issues.length?hbars(issues):emptyState('search','No issues detected yet','The most common finding types appear here.');
  /* recommendations */
  const items=[];
  if(all.length){const top=cc.slice().sort((a,b)=>b[1]-a[1])[0];items.push(['Recurring pattern',`${top[1]} ${top[0].toLowerCase()} finding(s) were detected, making this the most frequent category in the current review history. Recommended action: review the related approved rule, clarify guidance for content creators and add examples to the knowledge vault. Continue validating this pattern with human reviewers before changing policy.`,'activity']);}
  const gaps=all.filter(x=>x.evidenceStatus==='gap').length;
  if(gaps)items.push(['Evidence gaps',`${gaps} finding(s) had no linked approved source. Add approved knowledge covering these topics so reviewers see evidence instead of a gap.`,'vault']);
  if(pending)items.push(['Decisions waiting',`${pending} item(s) are waiting for a human decision in the approval queue.`,'approvals']);
  $('governanceRecommendation').innerHTML=items.length?`<div class="reco">${items.map(([t,d,i])=>`<div class="reco-item">${ico(i)}<div><b>${t}</b><span>${escapeHtml(d)}</span></div></div>`).join('')}</div>`:emptyState('spark','No recommendations yet','Run content reviews to generate recommendations based on recurring mistakes.');
}


/* ===== Audit Trail ===== */
const EVT={'Content reviewed':['ev-review','review'],'Suggested fix applied':['ev-fix','pencil'],'Finding acknowledged':['ev-ack','check'],'Draft saved':['ev-draft','save'],'Sent for human review':['ev-send','arrow'],'Human decision recorded':['ev-decision','ok'],'Knowledge entry added':['ev-kadd','plus'],'Knowledge entry updated':['ev-kedit','pencil'],'Knowledge entry deleted':['ev-kdel','trash'],'Settings saved':['ev-settings','settings']};
const auditState={q:'',type:''};
function renderActivity(){
  const sel=$('auditType');const types=[...new Set(state.activity.map(a=>a.event))];
  sel.innerHTML='<option value="">All event types</option>'+types.map(t=>`<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  if(types.includes(auditState.type))sel.value=auditState.type;else auditState.type='';
  const q=auditState.q.trim().toLowerCase();
  const rows=state.activity.filter(a=>(!auditState.type||a.event===auditState.type)&&(!q||[a.event,a.title,a.detail].join(' ').toLowerCase().includes(q)));
  $('auditCount').textContent=`${rows.length} of ${state.activity.length} event${state.activity.length===1?'':'s'}`;
  $('activityRows').innerHTML=rows.length?rows.map(a=>{const [cls,icon]=EVT[a.event]||['','activity'];return `<tr><td class="cell-main"><span class="ev ${cls}"><span class="ev-ico">${ico(icon)}</span>${escapeHtml(a.event)}</span></td><td data-label="Content" class="t-title">${escapeHtml(a.title)}</td><td data-label="Description" style="color:var(--text-2)">${escapeHtml(a.detail)}</td><td data-label="Time" class="time-cell">${escapeHtml(a.time)}</td></tr>`}).join(''):`<tr class="empty-row"><td colspan="4">${state.activity.length?'No events match your search or filter.':'No activity yet. Start by reviewing a content item.'}</td></tr>`;
}
$('auditSearch').addEventListener('input',e=>{auditState.q=e.target.value;renderActivity();});
$('auditType').addEventListener('change',e=>{auditState.type=e.target.value;renderActivity();});

function syncSettings(){const s=state.settings;$('settingHuman').checked=!!s.human;$('settingEvidence').checked=!!s.evidence;$('settingTerms').checked=!!s.terms;$('settingReadability').checked=!!s.readability;$('settingVisual').checked=!!s.visual;if($('settingExternalAI'))$('settingExternalAI').checked=!!s.externalAI;}
$('saveSettingsBtn').addEventListener('click',()=>{state.settings={human:$('settingHuman').checked,evidence:$('settingEvidence').checked,terms:$('settingTerms').checked,readability:$('settingReadability').checked,visual:$('settingVisual').checked,externalAI:$('settingExternalAI').checked};persist();log('Settings saved','Workspace settings','Local governance preferences updated.');renderPolicyPack();toast('Settings saved. They will apply to the next review.');});
$('clearLocalBtn').addEventListener('click',async()=>{if(!await confirmDialog({title:'Clear local demo data?',message:'Clear saved review history, approvals, activity and custom knowledge entries?',confirmLabel:'Clear data',danger:true}))return;localStorage.removeItem(STORAGE);state={knowledge:defaultKnowledge.map(x=>({...x})),history:[],approvals:[],activity:[],settings:{human:true,evidence:true,terms:true,readability:true,visual:true,externalAI:false},current:null,visualFile:null,visualData:null};persist();syncSettings();renderNavCount();renderVault();renderApprovals();renderInsights();renderActivity();resetResultsView();renderPolicyPack();toast('Local demo data cleared.');});
$('resetDemoBtn').addEventListener('click',async()=>{if(!await confirmDialog({title:'Reset demo data?',message:'Reset the demo to its original sample data?',confirmLabel:'Reset demo',danger:true}))return;localStorage.removeItem(STORAGE);state={knowledge:defaultKnowledge.map(x=>({...x})),history:[],approvals:[],activity:[],settings:{human:true,evidence:true,terms:true,readability:true,visual:true,externalAI:false},current:null,visualFile:null,visualData:null};$('contentInput').value='';$('contentTitle').value='Spring product campaign';$('visualFile').value='';$('imagePreview').style.display='none';$('charCount').textContent='0 characters';$('emptyResults').classList.remove('hidden');$('reviewResults').classList.add('hidden');$('resultState').className='tag gray';$('resultState').textContent='Awaiting content';persist();renderNavCount();renderVault();renderApprovals();renderInsights();renderActivity();renderPolicyPack();toast('Demo reset to its initial state.');});
$('exportActivityBtn').addEventListener('click',()=>{download('brandguard-activity.json',JSON.stringify({project:'BrandGuard AI',exportedAt:new Date().toISOString(),history:state.history,approvals:state.approvals,activity:state.activity},null,2),'application/json');toast('Activity exported as JSON.');});
$('exportActivityCsvBtn').addEventListener('click',()=>{const safe=v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};const rows=[['Event','Content','Description','Time'],...state.activity.map(a=>[a.event,a.title,a.detail,a.time])];download('brandguard-activity.csv','\ufeff'+rows.map(r=>r.map(safe).join(',')).join('\r\n'),'text/csv;charset=utf-8');toast('Activity exported as CSV.');});
function download(name,data,type){const blob=new Blob([data],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
// lightweight image palette inspection for optional demo asset checks
function samplePalette(file){return new Promise(resolve=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{try{const c=document.createElement('canvas');c.width=40;c.height=40;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,40,40);const d=ctx.getImageData(0,0,40,40).data;let r=0,g=0,b=0,n=0,brand=0;const swatches=[[21,38,63],[19,168,146]];for(let i=0;i<d.length;i+=16){if(d[i+3]>100){const rr=d[i],gg=d[i+1],bb=d[i+2];r+=rr;g+=gg;b+=bb;n++;const near=swatches.some(c=>Math.sqrt((rr-c[0])**2+(gg-c[1])**2+(bb-c[2])**2)<78);if(near)brand++;}}resolve({avg:n?[Math.round(r/n),Math.round(g/n),Math.round(b/n)]:null,brandShare:n?Math.round(brand/n*100):0});}catch(e){resolve({avg:null,brandShare:0})}URL.revokeObjectURL(url)};img.onerror=()=>{URL.revokeObjectURL(url);resolve({avg:null,brandShare:0})};img.src=url;});}
async function makeReviewThumbnail(file){return new Promise(resolve=>{const img=new Image();const url=URL.createObjectURL(file);img.onload=()=>{const maxW=640,maxH=420;const scale=Math.min(maxW/img.width,maxH/img.height,1);const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));const ctx=c.getContext('2d');ctx.drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);resolve(c.toDataURL('image/jpeg',0.72));};img.onerror=()=>{URL.revokeObjectURL(url);resolve(null)};img.src=url;});}
$('visualFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('Use a PNG, JPG or WebP image.');e.target.value='';return;}if(file.size>5*1024*1024){toast('Image must be 5 MB or smaller.');e.target.value='';return;}const p=await samplePalette(file);const preview=await makeReviewThumbnail(file);state.visualData={name:file.name,size:file.size,type:file.type,palette:p.avg,brandShare:p.brandShare,preview};toast('Visual asset attached. It will travel with the review request.');});

// Round 3: retrieved-evidence, specialist and governance presentation.

// Round 3: optional authenticated cloud workspace. Local demo remains available without cloud credentials.
let backendInfo={teamWorkspaceEnabled:false,hostedAIAgentsAvailable:false,teamInvitationsEnabled:false};
let teamUser=null, workspaces=[];
async function apiCall(url,opts){const res=await fetch(url,{credentials:'same-origin',...opts});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||`Request failed (${res.status})`);return data;}
function updateBackendLabels(){if($('cloudStatus'))$('cloudStatus').textContent=backendInfo.teamReviewPersistenceEnabled?'Configured · server persistence on':backendInfo.teamWorkspaceEnabled?'Auth configured · persistence key missing':'Not configured';if($('hostedAIStatus'))$('hostedAIStatus').textContent=backendInfo.hostedAIAgentsAvailable?'Configured · sign-in + consent required':'Not configured';if($('teamStatusBadge')){$('teamStatusBadge').className='tag '+(teamUser?'green':'gray');$('teamStatusBadge').textContent=teamUser?'Connected':backendInfo.teamWorkspaceEnabled?'Cloud ready':'Cloud not configured';}if($('analysisModePill'))$('analysisModePill').textContent=teamUser?'Team workspace':backendInfo.hostedAIAgentsAvailable?'Evidence + optional AI':'Evidence review mode';if($('settingExternalAI'))$('settingExternalAI').disabled=!(backendInfo.hostedAIAgentsAvailable&&teamUser&&activeWorkspaceId);if($('settingExternalAI'))$('settingExternalAI').title=backendInfo.hostedAIAgentsAvailable?'Sign in and select a team workspace before enabling hosted AI review.':'Add a server-side AI_API_KEY and configure a Supabase team workspace to enable hosted AI.';if($('engineStatusTitle'))$('engineStatusTitle').textContent=backendInfo.hostedAIAgentsAvailable?'Hosted AI is available but opt-in.':'Evidence retrieval and specialist rules are active.';if($('engineStatusText'))$('engineStatusText').textContent=backendInfo.hostedAIAgentsAvailable?'Sign in, select a workspace and explicitly enable hosted AI. Review content and retrieved approved knowledge will be sent to the server-configured provider.':'The six specialist modules use ranked approved knowledge and deterministic policy checks. Add a server-side AI_API_KEY and configure a signed-in Supabase workspace to enable hosted model analysis.';updateWorkspaceChrome();}
async function loadBackend(){try{backendInfo=await apiCall('/api/health');}catch(e){backendInfo={teamWorkspaceEnabled:false,hostedAIAgentsAvailable:false,teamInvitationsEnabled:false};}updateBackendLabels();try{const data=await apiCall('/api/auth');if(data.authenticated){teamUser=data.user;await loadWorkspaces();}else renderTeam();}catch(e){renderTeam();}}
function renderTeam(){const auth=$('teamAuthCard'),connected=$('teamConnectedCard'),create=$('teamCreateWorkspaceCard');if(!auth)return;$('teamSignInBtn').disabled=false;$('showSignupBtn').disabled=false;$('teamSignUpBtn').disabled=false;if(!backendInfo.teamWorkspaceEnabled&&!teamUser)$('teamAuthMessage').textContent='Local demo sign-in is available here. Cloud authentication can be connected later without changing the review workflow.';auth.classList.toggle('hidden',!!teamUser);connected.classList.toggle('hidden',!teamUser||!activeWorkspaceId);create.classList.toggle('hidden',!teamUser||!!activeWorkspaceId);$('teamMembersCard').classList.toggle('hidden',!teamUser||!activeWorkspaceId);if(teamUser){$('teamIdentity').textContent=teamUser.email||'Signed in';$('teamStatusTitle').textContent=activeWorkspaceId?(workspaces.find(w=>w.id===activeWorkspaceId)?.name||'Connected workspace'):'Signed in · Create a workspace';$('teamStatusText').textContent=activeWorkspaceId?(backendInfo.teamReviewPersistenceEnabled?'Your account is connected. Shared knowledge, signed reviews and server-recorded decisions can sync to this workspace.':'Local demo workspace is active. Reviews and knowledge remain in this browser until cloud storage is configured.'):'Your account is signed in, but no workspace is selected. Create one to begin.';}else{$('teamStatusTitle').textContent=backendInfo.teamWorkspaceEnabled?'Cloud workspace ready':'Local demo workspace';$('teamStatusText').textContent=backendInfo.teamWorkspaceEnabled?(backendInfo.teamReviewPersistenceEnabled?'Sign in or create an account to connect team knowledge, reviews and approvals.':'Sign-in is configured. Add the server-only service-role key to enable shared review and audit persistence.'):'BrandGuard is running as a self-contained demo. You can still explore the complete review, knowledge, approval and insights workflow.';}$('teamInvitesCard').classList.toggle('hidden',!teamUser||!activeWorkspaceId);if(!teamUser){$('teamMemberList').innerHTML='<p class="muted">Connect a cloud workspace to view members.</p>';$('memberCount').textContent='0 members';$('inviteMemberPanel').classList.add('hidden');$('inviteLocked').classList.remove('hidden');}renderLocalMembers();updateBackendLabels();}
async function loadWorkspaces(){const data=await apiCall('/api/workspaces');workspaces=data.workspaces||[];if(!workspaces.length){activeWorkspaceId=null;renderTeam();return;}const previous=activeWorkspaceId;activeWorkspaceId=workspaces.some(w=>w.id===previous)?previous:workspaces[0].id;activeWorkspaceRole=workspaces.find(w=>w.id===activeWorkspaceId)?.role||'author';$('teamWorkspaceSelect').innerHTML=workspaces.map(w=>`<option value="${escapeHtml(w.id)}" ${w.id===activeWorkspaceId?'selected':''}>${escapeHtml(w.name)} · ${escapeHtml(w.role)}</option>`).join('');renderTeam();await syncCloudData();await loadTeamMembers();}
async function activateWorkspace(workspace){activeWorkspaceId=workspace.id;activeWorkspaceRole=workspace.role;await loadWorkspaces();}
async function syncCloudData(){if(!activeWorkspaceId)return;try{$('teamSyncStatus').textContent='Syncing…';const wid=encodeURIComponent(activeWorkspaceId);const [knowledgeData,reviewsData,auditData]=await Promise.all([apiCall('/api/knowledge?workspace_id='+wid),apiCall('/api/reviews?workspace_id='+wid),apiCall('/api/audit?workspace_id='+wid)]);if(knowledgeData.items?.length){state.knowledge=knowledgeData.items.map(x=>({id:x.client_id,category:x.category,title:x.title,text:x.content,source:x.source,version:x.version,status:x.status}));}else if(['owner','admin'].includes(activeWorkspaceRole)){await apiCall('/api/knowledge?workspace_id='+wid,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:defaultKnowledge.map(k=>({client_id:k.id,category:k.category,title:k.title||k.category,content:k.text,source:k.source,version:k.version||'1.0'}))})});const seeded=await apiCall('/api/knowledge?workspace_id='+wid);state.knowledge=(seeded.items||[]).map(x=>({id:x.client_id,category:x.category,title:x.title,text:x.content,source:x.source,version:x.version,status:x.status}));}else{state.knowledge=[];}
 if(backendInfo.teamReviewPersistenceEnabled){state.history=(reviewsData.reviews||[]).map(x=>({id:x.client_id,title:x.title,type:x.content_type,text:x.content,findings:x.findings||[],agents:x.agents||[],retrievedSources:x.retrieved_sources||[],governance:x.governance||{},score:x.risk_score,riskLevel:x.risk_level,analysisMode:x.analysis_mode||'Evidence-linked specialist rules',externalAIUsed:!!x.external_ai_used,status:x.status,comment:x.reviewer_comment,created:x.created_at,cloudSaved:true}));state.approvals=state.history.filter(x=>['Pending approval','Approved','Rejected','Changes requested'].includes(x.status));state.activity=(auditData.events||[]).map(x=>({event:x.event,title:x.title,detail:x.detail,time:new Date(x.created_at).toLocaleString()}));}persist();renderVault();renderApprovals();renderInsights();renderActivity();$('teamSyncStatus').textContent='Synced · '+new Date().toLocaleTimeString();$('workspaceMeta').textContent=`Role: ${activeWorkspaceRole} · ${state.knowledge.length} knowledge items · ${state.history.length} reviews`;}catch(error){$('teamSyncStatus').textContent='Sync failed';toast(error.message);}}
async function saveCloudReview(record){if(!activeWorkspaceId||record.cloudSaved||!backendInfo.teamReviewPersistenceEnabled)return;const data=await apiCall('/api/reviews?workspace_id='+encodeURIComponent(activeWorkspaceId),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:record.id,title:record.title,content_type:record.type,content:record.text,findings:record.findings,agents:record.agents,retrieved_sources:record.retrievedSources,governance:record.governance,risk_score:record.score,risk_level:record.riskLevel,analysis_mode:record.analysisMode,external_ai_used:record.externalAIUsed,review_proof:record.reviewProof,status:record.status})});record.cloudSaved=!!data.review;persist();$('teamSyncStatus').textContent='Review synced';}
async function saveCloudKnowledge(item,existing){if(!activeWorkspaceId)return;const payload={client_id:item.id,category:item.category,title:item.title||item.category,content:item.text,source:item.source,version:item.version||'1.0'};await apiCall('/api/knowledge?workspace_id='+encodeURIComponent(activeWorkspaceId),{method:existing?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});}
async function saveCloudDecision(item,status=item.status,comment=item.comment||''){if(!activeWorkspaceId||!item.cloudSaved||!backendInfo.teamReviewPersistenceEnabled)return;await apiCall('/api/reviews?workspace_id='+encodeURIComponent(activeWorkspaceId),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:item.id,status,comment})});}
async function saveCloudAudit(event,title,detail){if(!activeWorkspaceId||!backendInfo.teamReviewPersistenceEnabled||['Human decision recorded','Sent for human review'].includes(event))return;try{await apiCall('/api/audit?workspace_id='+encodeURIComponent(activeWorkspaceId),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event,title,detail})});}catch(e){console.warn('Audit sync failed:',e.message);}}
async function loadTeamMembers(){if(!activeWorkspaceId)return;try{const data=await apiCall('/api/team?workspace_id='+encodeURIComponent(activeWorkspaceId));const members=data.members||[];$('memberCount').textContent=members.length+' member(s)';$('teamMemberList').innerHTML=members.map(memberRow).join('')||'<p class="muted">No team members listed.</p>';const canInvite=['owner','admin'].includes(activeWorkspaceRole);$('inviteMemberPanel').classList.toggle('hidden',!canInvite);$('inviteLocked').classList.toggle('hidden',canInvite);}catch(e){$('teamMemberList').innerHTML=`<p class="muted">${escapeHtml(e.message)}</p>`;}}
$('teamSignInBtn').addEventListener('click',async()=>{const email=$('teamEmail').value.trim(),password=$('teamPassword').value;if(!email||!password){$('teamAuthMessage').textContent='Enter an email and password to continue.';return;}if(!backendInfo.teamWorkspaceEnabled){teamUser={email,name:email.split('@')[0]};workspaces=[{id:'local-workspace',name:'BrandGuard Demo Workspace',role:'owner'}];activeWorkspaceId='local-workspace';activeWorkspaceRole='owner';renderTeam();renderVault();renderApprovals();renderInsights();renderActivity();toast('Signed in to the local demo workspace.');return;}try{const d=await apiCall('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'signin',email,password})});teamUser=d.user;await loadWorkspaces();$('teamAuthMessage').textContent='Signed in successfully.';toast('Connected to your team workspace.');}catch(e){$('teamAuthMessage').textContent=e.message;}});
$('showSignupBtn').addEventListener('click',()=>{$('teamSignupFields').classList.toggle('hidden');});
$('teamSignUpBtn').addEventListener('click',async()=>{const email=$('teamEmail').value.trim(),password=$('teamPassword').value,name=$('teamName').value.trim()||email.split('@')[0],workspaceName=$('teamWorkspaceName').value.trim()||'BrandGuard Demo Workspace';if(!email||password.length<6){$('teamAuthMessage').textContent='Enter an email and a password of at least 6 characters.';return;}if(!backendInfo.teamWorkspaceEnabled){teamUser={email,name};workspaces=[{id:'local-workspace',name:workspaceName,role:'owner'}];activeWorkspaceId='local-workspace';activeWorkspaceRole='owner';renderTeam();toast('Local demo account created.');return;}try{const d=await apiCall('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'signup',email,password,name})});if(d.confirmationRequired){$('teamAuthMessage').textContent=d.message;return;}teamUser=d.user;renderTeam();const w=await apiCall('/api/workspaces',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:workspaceName})});workspaces=[w.workspace];activeWorkspaceId=w.workspace.id;activeWorkspaceRole='owner';await loadWorkspaces();toast('Account created.');}catch(e){$('teamAuthMessage').textContent=e.message;}});
$('teamSignOutBtn').addEventListener('click',async()=>{try{await apiCall('/api/auth',{method:'DELETE'});}catch{}teamUser=null;workspaces=[];activeWorkspaceId=null;activeWorkspaceRole=null;renderTeam();toast('Signed out.');});
$('createWorkspaceBtn').addEventListener('click',async()=>{const name=$('newWorkspaceName').value.trim()||'BrandGuard Demo Workspace';if(!backendInfo.teamWorkspaceEnabled){const id='local-'+Date.now();workspaces.push({id,name,role:'owner'});activeWorkspaceId=id;activeWorkspaceRole='owner';renderTeam();toast('Local workspace created.');return;}try{const d=await apiCall('/api/workspaces',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});workspaces.push(d.workspace);activeWorkspaceId=d.workspace.id;activeWorkspaceRole='owner';await loadWorkspaces();toast('Workspace created.');}catch(e){toast(e.message);}});
$('teamWorkspaceSelect').addEventListener('change',async()=>{activeWorkspaceId=$('teamWorkspaceSelect').value;activeWorkspaceRole=workspaces.find(w=>w.id===activeWorkspaceId)?.role||'author';await syncCloudData();await loadTeamMembers();});
$('teamRefreshBtn').addEventListener('click',async()=>{if(!backendInfo.teamWorkspaceEnabled){$('teamSyncStatus').textContent='Local demo · synced just now';renderVault();renderApprovals();renderInsights();renderActivity();toast('Demo workspace refreshed.');return;}await syncCloudData();await loadTeamMembers();});
$('inviteMemberBtn').addEventListener('click',async()=>{const email=$('inviteEmail').value.trim(),role=$('inviteRole').value;if(!email){toast('Enter an email address first.');return;}if(!backendInfo.teamWorkspaceEnabled){$('teamMemberList').insertAdjacentHTML('beforeend',memberRow({display_name:email.split('@')[0],user_email:email,role}));$('inviteEmail').value='';$('memberCount').textContent=($('teamMemberList').querySelectorAll('.member-row').length)+' member(s)';toast('Demo invitation added to the workspace.');return;}try{const d=await apiCall('/api/team?workspace_id='+encodeURIComponent(activeWorkspaceId),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,role})});toast(d.message||'Invitation sent.');await loadTeamMembers();}catch(e){toast(e.message);}});

$('cookieDismiss')?.addEventListener('click',()=>{localStorage.setItem('brandguard_cookie_notice_v1','dismissed');$('cookieNotice')?.classList.remove('show');});
if(!localStorage.getItem('brandguard_cookie_notice_v1'))$('cookieNotice')?.classList.add('show');
$('requestDeletionBtn')?.addEventListener('click',async()=>{if(!activeWorkspaceId){localStorage.removeItem(STORAGE);state={knowledge:defaultKnowledge.map(x=>({...x})),history:[],approvals:[],activity:[],settings:{human:true,evidence:true,terms:true,readability:true,visual:true,externalAI:false},current:null,visualFile:null,visualData:null};renderVault();renderApprovals();renderInsights();renderActivity();resetResultsView();renderPolicyPack();toast('Local demo data cleared.');return;}if(!await confirmDialog({title:'Request cloud data deletion?',message:'Request deletion of your cloud account data? Shared workspace records will be reviewed before removal.',confirmLabel:'Request deletion',danger:true}))return;try{const d=await apiCall('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'request_delete'})});toast(d.message||'Deletion request recorded.');}catch(e){toast(e.message);}});

/* ===== Settings / system status / workspace chrome ===== */
function storageOk(){try{const k='__bg_test';localStorage.setItem(k,'1');localStorage.removeItem(k);return true}catch(e){return false}}
const statusRow=(icon,name,desc,variant,label)=>`<div class="status-row"><div class="s-left">${ico(icon,'lg')}<div><b style="font-weight:500">${name}</b><small>${desc}</small></div></div><span class="badge ${variant}">${label}</span></div>`;
function renderSystemStatus(){
  const b=backendInfo||{};
  $('systemStatus').innerHTML=
    statusRow('cpu','Review engine','Six deterministic specialist checks run in this browser.','ok','Active')+
    statusRow('search','Evidence retrieval','BM25 lexical relevance over approved knowledge.','ok','Active')+
    statusRow('spark','Hosted AI analysis','Server-side key, sign-in and your consent are required.',b.hostedAIAgentsAvailable?'ok':'gray',b.hostedAIAgentsAvailable?'Available':'Not configured')+
    statusRow('lock','Cloud authentication','Supabase Auth with server-side sessions.',b.teamWorkspaceEnabled?'ok':'gray',b.teamWorkspaceEnabled?'Configured':'Not configured')+
    statusRow('cloud','Shared persistence','Team knowledge, reviews and audit events.',b.teamReviewPersistenceEnabled?'ok':b.teamWorkspaceEnabled?'warn':'gray',b.teamReviewPersistenceEnabled?'Configured':b.teamWorkspaceEnabled?'Key missing':'Not configured')+
    statusRow('db','Browser storage','Demo data is saved in this browser.',storageOk()?'ok':'err',storageOk()?'Available':'Unavailable');
}
function renderConnectionStatus(){
  const b=backendInfo||{};const cloud=currentMode()==='cloud';
  $('connectionStatus').innerHTML=
    statusRow('building','Mode',cloud?'Shared data is synced to your team workspace.':'Data stays in this browser.',cloud?'ok':'warn',cloud?'Cloud connected':'Local demo')+
    statusRow('lock','Authentication','Supabase Auth with server-side sessions.',b.teamWorkspaceEnabled?'ok':'gray',b.teamWorkspaceEnabled?'Configured':'Not configured')+
    statusRow('cloud','Shared persistence','Team knowledge, reviews and audit events.',b.teamReviewPersistenceEnabled?'ok':b.teamWorkspaceEnabled?'warn':'gray',b.teamReviewPersistenceEnabled?'Configured':b.teamWorkspaceEnabled?'Key missing':'Not configured')+
    statusRow('user','Session',teamUser?escapeHtml(teamUser.email||'Signed in'):'No active sign-in',teamUser?'ok':'gray',teamUser?'Signed in':'Signed out');
}
function currentMode(){return (teamUser&&activeWorkspaceId&&backendInfo.teamWorkspaceEnabled)?'cloud':'local';}
function updateWorkspaceChrome(){
  const cloud=currentMode()==='cloud';
  const ws=activeWorkspaceId?workspaces.find(w=>w.id===activeWorkspaceId):null;
  const name=ws?.name||'Local demo workspace';
  $('wsName').textContent=name;$('wsAvatar').textContent=initials(name);
  $('wsMeta').textContent=cloud?(activeWorkspaceRole?capitalize(activeWorkspaceRole)+' · Cloud connected':'Cloud connected'):(teamUser?'Local demo account':'Browser-local data');
  $('wsDot').className='dot '+(cloud?'live':'local');
  $('modeChip').className='chip '+(cloud?'cloud':'local');$('modeChipText').textContent=cloud?'Cloud workspace':'Local demo';
  $('topAvatar').textContent=teamUser?initials(teamUser.name||teamUser.email):'BG';
  $('modeBanner').classList.toggle('cloud',cloud);$('modeBannerIcon').innerHTML=ico(cloud?'cloud':'drive','lg');
  $('modeOptLocal').classList.toggle('on',!cloud);$('modeOptCloud').classList.toggle('on',cloud);
  $('setWsName').textContent=name+(activeWorkspaceRole?' · '+activeWorkspaceRole:'');setBadge($('setWsMode'),cloud?'ok':'warn',cloud?'Cloud connected':'Local demo');
  setBadge($('cloudStatus'),backendInfo.teamReviewPersistenceEnabled?'ok':backendInfo.teamWorkspaceEnabled?'warn':'gray');
  setBadge($('hostedAIStatus'),backendInfo.hostedAIAgentsAvailable?'ok':'gray');
  if(teamUser&&!cloud)setBadge($('teamStatusBadge'),'warn','Local demo account');else if(cloud)setBadge($('teamStatusBadge'),'ok','Cloud connected');
  renderConnectionStatus();
}
const memberRow=m=>`<div class="member-row"><div class="m-left"><div class="avatar">${escapeHtml(initials(m.display_name||m.user_email))}</div><div><strong>${escapeHtml(m.display_name||m.user_email||'Team member')}</strong><small>${escapeHtml(m.user_email||'')}</small></div></div><span class="role-pill">${escapeHtml(m.role)}</span></div>`;
function renderLocalMembers(){
  if(!teamUser||!activeWorkspaceId||backendInfo.teamWorkspaceEnabled)return;
  const list=$('teamMemberList');
  if(!list.querySelector('.member-row'))list.innerHTML=memberRow({display_name:teamUser.name||String(teamUser.email||'').split('@')[0],user_email:teamUser.email,role:'owner'});
  $('memberCount').textContent=list.querySelectorAll('.member-row').length+' member(s)';
  $('inviteMemberPanel').classList.remove('hidden');$('inviteLocked').classList.add('hidden');
  $('teamWorkspaceSelect').innerHTML=workspaces.map(w=>`<option value="${escapeHtml(w.id)}" ${w.id===activeWorkspaceId?'selected':''}>${escapeHtml(w.name)} · ${escapeHtml(w.role)}</option>`).join('');
  $('workspaceMeta').textContent=`Role: ${activeWorkspaceRole} · local demo workspace · ${state.knowledge.length} knowledge items · ${state.history.length} reviews`;
}
document.querySelectorAll('#settingsNav a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const t=$(a.getAttribute('href').slice(1));if(t)t.scrollIntoView({behavior:'smooth',block:'start'});document.querySelectorAll('#settingsNav a').forEach(x=>x.classList.toggle('active',x===a));}));
$('settingsGoTeam').addEventListener('click',()=>go('team'));

// initialize
loadState();if(!state.knowledge?.length)state.knowledge=defaultKnowledge.map(x=>({...x}));try{renderNavCount();renderPolicyPack();renderPipeline('idle');renderVault();renderApprovals();renderInsights();renderActivity();syncSettings();$('charCount').textContent=$('contentInput').value.length+' characters';}catch(e){console.error('BrandGuard UI initialization error',e);toast('BrandGuard loaded with a safe fallback.');}loadBackend();if(state.current)renderResult(state.current);updateWorkspaceChrome();
})();
