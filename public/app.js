/* Opportunity OS — source-backed, consent-aware frontend. No stored credentials. */
(()=>{"use strict";
const $=id=>document.getElementById(id);
const state={key:"",authenticated:false,cases:[],total:0,offset:0,limit:100,matches:[],
 selected:null,graph:null,view:"overview",step:0,requestId:"",busy:false};
const VENTURES={noetfield:"Noetfield",portfolio:"Cross-portfolio",workforce:"WorkforceOS",
 sourcea:"SourceA",outboundos:"OutboundOS",buildworkflow:"BuildWorkflow",buildrelay:"BuildRelay",
 signalforge:"SignalForge",earnloop:"Earnloop",misenorth:"MiseNorth",interiormatch:"InteriorMatch",
 trustfield:"TrustField",other:"Other"};
const STAGES=["NEW","QUALIFYING","ROUTED","ENGAGED","NEGOTIATING","PILOT","WON","LOST","ARCHIVED"];
const TERMINAL=new Set(["WON","LOST","ARCHIVED"]);
const ESC={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
function h(v){return String(v??"").replace(/[&<>"']/g,c=>ESC[c])}
function byDate(v){if(!v)return"—";const d=new Date(v);return Number.isNaN(+d)?String(v):d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"})}
function text(id,value){const el=$(id);if(el)el.textContent=String(value??"")}
function badUrl(v){try{const u=new URL(String(v));return u.protocol==="https:"?"":u.href}catch{return""}}
function validURL(v){try{const u=new URL(String(v));return u.protocol==="https:"?u.href:""}catch{return""}}
function statusPill(stage){const value=String(stage||"NEW");return '<span class="stage-pill '+(value==="WON"?"won":value==="LOST"?"lost":value==="PILOT"?"pilot":"")+'">'+h(value)+'</span>'}
function labelVenture(s){return VENTURES[s]||s||"Unspecified"}
function toast(msg,error=false){const el=document.createElement("div");el.className="toast"+(error?" error":"");el.textContent=msg;$("toastContainer").appendChild(el);setTimeout(()=>el.remove(),6000)}
async function call(path,{method="GET",body=null,auth=true}={}){
 const headers={"Accept":"application/json"};
 if(body)headers["Content-Type"]="application/json";
 if(auth&&state.key)headers["X-Admin-Secret"]=state.key;
 let response;try{response=await fetch(path,{method,headers,cache:"no-store",credentials:"omit",
  ...(body?{body:JSON.stringify(body)}:{})})}catch{throw Error("Network unavailable. Your request was not confirmed.")}
 let data={};try{data=await response.json()}catch{}
 if(!response.ok)throw Error(typeof data.detail==="string"?data.detail:"HTTP "+response.status);
 return data;
}
function showView(view){
 const allowed=["overview","pipeline","relationships","matching","execution","revenue","apply","systems"];
 if(!allowed.includes(view))view="overview";
 state.view=view;
 document.querySelectorAll("[data-screen]").forEach(el=>el.hidden=el.dataset.screen!==view);
 document.querySelectorAll(".nav-item").forEach(el=>{const active=el.dataset.view===view;el.classList.toggle("active",active);el.setAttribute("aria-current",active?"page":"false")});
 const label={overview:"Overview",pipeline:"Opportunity pipeline",relationships:"Relationship graph",matching:"Reciprocal matching",
  execution:"Follow-up & execution",revenue:"Commercial outcomes",apply:"Submit opportunity",systems:"Connected systems"}[view];
 text("currentViewLabel",label);
 document.title=label+" — Opportunity OS";
 $("sidebar").classList.remove("open");$("menuButton").setAttribute("aria-expanded","false");
 if(!state.authenticated)$("unlockBackdrop").hidden=view==="apply";
 window.scrollTo({top:0,behavior:"instant"});
}
function setLocked(){
 state.authenticated=false;state.key="";state.cases=[];state.total=0;state.matches=[];state.selected=null;state.graph=null;
 $("unlockBackdrop").hidden=state.view==="apply";
 $("lockButton").hidden=true;
 $("operatorKey").value="";$("intakeSuccess").hidden=true;
 renderAll();
}
async function login(ev){
 ev.preventDefault();if(state.busy)return;
 const key=$("operatorKey").value.trim();if(key.length<8){toast("An existing Platform administrator key is required.",true);return}
 state.busy=true;const btn=$("unlockForm").querySelector("button");btn.disabled=true;btn.textContent="Authenticating source…";
 state.key=key;
 try{
  await loadCases();
  state.authenticated=true;$("unlockBackdrop").hidden=true;$("lockButton").hidden=false;
  $("operatorKey").value="";
  toast("Authenticated against the canonical Noetfield Platform.");
  loadMatches().catch(e=>toast("Matching is unavailable: "+e.message,true));
 }catch(error){state.key="";toast("Unlock failed: "+error.message,true)}
 finally{state.busy=false;btn.disabled=false;btn.textContent="Enter workspace ↗"}
}
async function loadCases(){
 const data=await call("/api/operator/cases?limit="+state.limit+"&offset="+state.offset);
 if(!Array.isArray(data.items))throw Error("Source returned no case collection");
 state.cases=data.items;state.total=Number(data.total)||0;
 renderAll();
 return data;
}
async function loadMatches(){
 if(!state.key)return;
 const data=await call("/api/operator/matches");
 state.matches=Array.isArray(data.matches)?data.matches:[];
 renderMatches();
}
function renderAll(){
 renderStats();renderFlow();renderPriority();renderCases();renderRelationshipPicker();renderDue();
 renderRevenue();renderMatches();
}
function renderStats(){
 const rows=state.cases,active=rows.filter(x=>!TERMINAL.has(x.stage||"NEW")).length;
 const due=rows.filter(x=>x.next_action_due&&!TERMINAL.has(x.stage||"NEW")
  &&String(x.next_action_due)<=new Date().toISOString().slice(0,10)).length;
 text("statTotal",state.authenticated||state.key?state.total:"—");
 text("statActive",state.authenticated||state.key?active:"—");
 text("statDue",state.authenticated||state.key?due:"—");
 text("statRevenue","—");
 text("overviewWindow",state.key?"Current page: "+rows.length+" / "+state.total+" source cases":"Not unlocked");
}
function renderFlow(){
 const root=$("stageFlow");
 if(!state.key){root.innerHTML='<p class="empty-line">Unlock to see the real opportunity stages.</p>';return}
 const stages=["NEW","QUALIFYING","ENGAGED","PILOT","WON"],counts=stages.map(stage=>state.cases.filter(x=>(x.stage||"NEW")===stage).length);
 const max=Math.max(1,...counts);
 root.innerHTML=stages.map((stage,i)=>'<div class="flow-row"><span class="flow-label">'+stage+'</span><div class="flow-track"><div class="flow-fill" style="width:'+Math.max(0,100*counts[i]/max)+'%"></div></div><span class="flow-number">'+counts[i]+'</span></div>').join("");
}
function renderPriority(){
 const root=$("priorityList");
 if(!state.key){root.innerHTML='<div class="empty-illustration">◇<p>Unlock to see source-backed priorities.</p></div>';return}
 const rows=state.cases.filter(x=>!TERMINAL.has(x.stage||"NEW")).slice().sort((a,b)=>
  Number(b.priority_score||0)-Number(a.priority_score||0)).slice(0,4);
 root.innerHTML=rows.length?rows.map(x=>'<button class="priority-item" type="button" data-case="'+h(x.intake_id)+'"><span class="priority-icon">↗</span><span><strong>'+h(x.title||"Opportunity")+'</strong><small>'+h(x.person||"Unknown contact")+' · '+h(labelVenture(x.initiative))+'</small></span><span class="score">'+h(x.priority_score||0)+'</span></button>').join(""):'<p class="empty-line">No current source cases on this page.</p>';
}
function filteredCases(){
 const term=$("caseSearch").value.trim().toLowerCase(),stage=$("stageFilter").value,venture=$("ventureFilter").value;
 return state.cases.filter(x=>(!stage||x.stage===stage)&&(!venture||x.initiative===venture)&&(!term||
  [x.title,x.person,x.organization,x.email,x.intake_id,x.initiative,x.opportunity_type,x.proposal].some(v=>String(v||"").toLowerCase().includes(term))));
}
function renderCases(){
 const table=$("casesTable");
 if(!state.key){table.innerHTML='<tr><td colspan="6" class="table-empty">Unlock to load source-backed cases.</td></tr>';text("filterCount","— cases");return}
 const rows=filteredCases();
 text("filterCount",rows.length+" on this page");
 const choices=new Set(state.cases.map(x=>x.initiative).filter(Boolean));
 const select=$("ventureFilter"),old=select.value;
 select.innerHTML='<option value="">All ventures</option>'+[...choices].sort().map(x=>'<option value="'+h(x)+'">'+h(labelVenture(x))+'</option>').join("");
 select.value=old;if(select.value!==old)select.value="";
 const origin=state.offset;
 text("pageIndicator",(state.total?origin+1:0)+"–"+Math.min(origin+state.cases.length,state.total)+" of "+state.total);
 $("prevPage").disabled=origin<=0;$("nextPage").disabled=origin+state.limit>=state.total;
 table.innerHTML=rows.length?rows.map(x=>'<tr tabindex="0" role="button" aria-label="Open '+h(x.title||"opportunity")+'" data-case="'+h(x.intake_id)+'"><td><strong>'+h(x.title||x.intake_id)+'</strong><small>'+h(x.intake_id)+'</small></td><td><strong>'+h(x.person||"Unknown")+'</strong><small>'+h(x.organization||"—")+'</small></td><td>'+h(labelVenture(x.initiative))+'</td><td>'+statusPill(x.stage)+'</td><td><strong>'+h(x.owner||"Owner not assigned")+'</strong><small>'+h(x.next_action||x.suggested_next_action||"Next action not set")+'</small></td><td><span class="score">'+h(x.priority_score??"—")+'</span></td></tr>').join(""):'<tr><td colspan="6" class="table-empty">No matching real opportunities on this page.</td></tr>';
}
function renderRelationshipPicker(){
 const root=$("relationshipPicker");
 if(!state.key){root.innerHTML='<p class="empty-line">Unlock to explore actual relationships.</p>';return}
 root.innerHTML=state.cases.map(x=>'<button class="picker-item '+(x.intake_id===state.selected?"active":"")+'" type="button" data-graph="'+h(x.intake_id)+'"><strong>'+h(x.person||"Unknown contact")+'</strong><span>'+h(labelVenture(x.initiative))+' · '+h(x.title||x.intake_id)+'</span></button>').join("")||'<p class="empty-line">No source records on this page.</p>';
}
async function loadGraph(intakeId){
 if(!state.key)return;
 state.selected=intakeId;renderRelationshipPicker();
 $("graphVisual").innerHTML='<div class="empty-illustration">◎<p>Reading the canonical relationship source…</p></div>';
 $("relationshipTimeline").innerHTML="";
 try{
  const graph=await call("/api/operator/cases/"+encodeURIComponent(intakeId)+"/relationship");
  if(state.selected!==intakeId)return;
  state.graph=graph;renderGraph(graph);
 }catch(error){
  $("graphVisual").innerHTML='<div class="empty-illustration">◎<p>Unable to load relationship: '+h(error.message)+'</p></div>';
 }
}
function renderGraph(graph){
 const nodes=Array.isArray(graph.nodes)?graph.nodes:[];
 const person=nodes.find(n=>n.type==="person_claim")||{},opportunities=nodes.filter(n=>n.type==="opportunity");
 text("graphTitle",person.label||"Relationship explorer");
 $("graphVisual").innerHTML='<div class="graph-core"><span>◎</span><strong>'+h(person.label||"Contact")+'</strong><small>CLAIM-BASED IDENTITY</small></div>'+
 '<div class="graph-neighbors">'+opportunities.map(n=>'<div class="graph-neighbor"><small>'+h(labelVenture(n.venture))+'</small><strong>'+h(n.label||"Opportunity")+'</strong><small>'+h(n.stage||"NEW")+'</small></div>').join("")+'</div>'+
 '<p class="small" style="text-align:center;margin:20px 0 0;max-width:480px">Edges are sourced from the same self-reported email; identity and organizational affiliation are not independently verified. No automatic cross-venture export.</p>';
 const events=Array.isArray(graph.timeline)?graph.timeline.slice(0,35):[];
 $("relationshipTimeline").innerHTML='<h4>Evidence & interaction timeline</h4>'+(
  events.length?events.map(e=>'<div class="timeline-entry"><div><strong>'+h(e.kind||"Source event")+'</strong><time>'+h(byDate(e.at))+' · '+h(e.evidence||"source")+'</time><p>'+h(e.detail||"")+'</p></div></div>').join("")
  :'<p class="empty-line">No recorded events yet.</p>');
}
function renderMatches(){
 text("matchCount",state.key?state.matches.length:"—");
 const root=$("matchesList");
 if(!state.key){root.innerHTML='<div class="empty-illustration">◇<p>Unlock to calculate source-backed matches.</p></div>';return}
 root.innerHTML=state.matches.length?state.matches.map(m=>'<article class="match-card"><div class="match-card-head"><span>'+h(labelVenture(m.venture))+' / reciprocal candidate</span><span class="score">'+h(m.score)+' alignment</span></div><h3>Possible mutual value</h3>'+
 [0,1].map(i=>'<div class="match-pair"><span class="avatar">◇</span><div><strong>'+h(m.names?.[i]||"Source contact")+'</strong><small>'+h(m.titles?.[i]||m.source_ids?.[i])+'</small></div></div>').join("")+
 '<p class="match-link">Shared terms: <b>'+h([...(m.shared_terms?.a_offers_b_needs||[]),...(m.shared_terms?.b_offers_a_needs||[])].join(", ")||"Source overlap")+'</b></p>'+
 '<p class="small">Suggested only. Contact consent is not introduction consent. No match has been accepted.</p>'+
 '<button class="button button-quiet" type="button" data-case="'+h(m.source_ids?.[0])+'">Inspect source opportunity ↗</button></article>').join("")
  :'<div class="empty-illustration">◇<p>No source-supported reciprocal matches on the recent page. Matches never cross independent ventures without authorization.</p></div>';
}
function renderDue(){
 const root=$("dueList");
 if(!state.key){root.innerHTML='<p class="empty-line">Unlock to view actual source due dates.</p>';return}
 const rows=state.cases.filter(x=>x.next_action_due&&!TERMINAL.has(x.stage||"NEW")).slice().sort((a,b)=>String(a.next_action_due).localeCompare(String(b.next_action_due))).slice(0,20);
 root.innerHTML=rows.length?rows.map(x=>'<button class="task-item" type="button" data-case="'+h(x.intake_id)+'"><span class="task-head"><span class="section-kicker">'+h(labelVenture(x.initiative))+'</span><span class="task-due">'+h(x.next_action_due)+'</span></span><strong>'+h(x.next_action||"Follow up")+'</strong><p>'+h(x.title||"Opportunity")+' · '+h(x.owner||"Owner unassigned")+'</p></button>').join("")
  :'<p class="empty-line">No dated human follow-ups in the current source page.</p>';
}
function renderRevenue(){
 text("wonCount",state.key?state.cases.filter(x=>x.stage==="WON").length:"—");
 text("openCount",state.key?state.cases.filter(x=>!TERMINAL.has(x.stage||"NEW")).length:"—");
}
function renderDialog(x){
 if(!x)return;
 text("dialogTitle",x.title||"Source opportunity");text("dialogId",x.intake_id+" · Revision "+x.revision);
 const details=[["Person",x.person],["Organization",x.organization],["Email",x.email],["Venture",labelVenture(x.initiative)],
  ["Source",x.source],["Role",x.participant_role],["Stage",x.stage],["Priority",String(x.priority_score??"—")],
  ["Contact consent",x.consent_contact?"Recorded yes":"Not established by current record"],["Due",x.next_action_due]];
 $("caseDetail").innerHTML='<div class="dialog-overview">'+details.map(([k,v])=>'<div class="dialog-field"><small>'+h(k.toUpperCase())+'</small><strong>'+h(v||"—")+'</strong></div>').join("")+'</div>'+
 '<div class="dialog-section"><span class="section-kicker">SOURCE OFFER ↔ ASK</span><div class="dialog-terms"><div><small>VALUE OFFERED</small><p>'+h(x.offer||"Not supplied")+'</p></div><div><small>VALUE REQUESTED</small><p>'+h(x.ask||"Not supplied")+'</p></div></div></div>'+
 '<div class="dialog-section"><span class="section-kicker">ORIGINAL SUBMISSION</span><div class="dialog-proposal">'+h(x.proposal||"No source text")+'</div></div>'+
 (validURL(x.reference_url)?'<p class="small"><a target="_blank" rel="noopener noreferrer" href="'+h(validURL(x.reference_url))+'">Open submitted source ↗</a></p>':"")+
 '<p class="small">Suggested next step: '+h(x.suggested_next_action||"Human qualification")+'. Source-reported only; no external execution confirmed.</p>';
 const form=$("caseUpdateForm");
 form.elements.stage.value=x.stage||"NEW";form.elements.owner.value=x.owner||"";
 form.elements.next_action.value=x.next_action||"";form.elements.due_date.value=x.next_action_due||"";
 form.elements.note.value=x.operator_note||"";
 $("dialogActivity").innerHTML=[...(x.interactions||[])].reverse().map(e=>'<div class="activity-row"><strong>'+h(e.kind||"Event")+' · '+h(byDate(e.created_at))+'</strong><p>'+h(e.body||"")+'</p><p>'+h(e.state||"NOT_VERIFIED")+'</p></div>').join("")
 +[...(x.activity||[])].reverse().map(e=>'<div class="activity-row"><strong>'+h(e.stage||"Decision")+' · '+h(byDate(e.at))+'</strong><p>'+h(e.note||"")+'</p></div>').join("")
 ||'<p class="empty-line">No operator interactions recorded.</p>';
 $("dialogInvitations").innerHTML=(x.invitations||[]).map(i=>'<div class="activity-row"><strong>'+h(i.scope||"Invitation")+' · '+h(i.state||"PREPARED")+'</strong><p>'+h(i.id||"")+'</p></div>').join("");
 $("invitationResult").hidden=true;$("invitationResult").replaceChildren();
}
function openCase(id){
 const found=state.cases.find(x=>x.intake_id===id);
 if(!found){toast("This case is not on the current source page.",true);return}
 state.selected=id;renderDialog(found);$("caseDialog").showModal();
}
async function mutateCase(fn){
 if(state.busy)return;state.busy=true;
 try{await fn();await loadCases();if(state.selected){const x=state.cases.find(x=>x.intake_id===state.selected);if(x)renderDialog(x)}toast("Verified Platform write receipt recorded.");}
 catch(error){toast("Not confirmed: "+error.message+" — refresh source before retrying.",true)}
 finally{state.busy=false}
}
function selectedCase(){const x=state.cases.find(c=>c.intake_id===state.selected);if(!x)throw Error("No current source case");return x}
function onUpdate(ev){
 ev.preventDefault();const x=selectedCase(),fd=new FormData(ev.currentTarget);
 const body={expected_revision:Number(x.revision||0),stage:String(fd.get("stage")),owner:String(fd.get("owner")||"").trim(),
  next_action:String(fd.get("next_action")||"").trim(),due_date:fd.get("due_date")||null,note:String(fd.get("note")||"").trim()};
 if(["WON","LOST"].includes(body.stage)&&!body.note){toast("A source-reported Won/Lost outcome requires a concrete note.",true);return}
 mutateCase(()=>call("/api/operator/cases/"+encodeURIComponent(x.intake_id),{method:"PATCH",body}));
}
function onActivity(ev){
 ev.preventDefault();const x=selectedCase(),fd=new FormData(ev.currentTarget);
 const body={expected_revision:Number(x.revision||0),action:String(fd.get("action")),
  body:String(fd.get("body")||"").trim(),evidence_url:String(fd.get("evidence_url")||"").trim()};
 mutateCase(()=>call("/api/operator/cases/"+encodeURIComponent(x.intake_id)+"/activity",{method:"POST",body}));
}
async function onInvite(ev){
 ev.preventDefault();if(state.busy)return;
 const x=selectedCase(),fd=new FormData(ev.currentTarget);
 const request_id="req_"+(globalThis.crypto?.randomUUID?.().replace(/-/g,"")||String(Date.now())+"_"+Math.random().toString(36).slice(2));
 const body={expected_revision:Number(x.revision||0),scope:String(fd.get("scope")),
  message:String(fd.get("message")||"").trim(),request_id};
 state.busy=true;
 try{
  const receipt=await call("/api/operator/cases/"+encodeURIComponent(x.intake_id)+"/invitations",{method:"POST",body});
  if(receipt.created!==true||!receipt.share_token||!receipt.invitation_id)throw Error("No new private token issued");
  const url="https://www.noetfield.com/connect/respond/#case="+encodeURIComponent(x.intake_id)
    +"&inv="+encodeURIComponent(receipt.invitation_id)+"&token="+encodeURIComponent(receipt.share_token);
  // Copyable private bearer URL remains in the live DOM only, not persistent browser storage or logs.
  await loadCases();const updated=state.cases.find(row=>row.intake_id===x.intake_id);
  if(updated)renderDialog(updated);
  const wrap=$("invitationResult");wrap.hidden=false;wrap.replaceChildren();
  const explanation=document.createElement("p");explanation.textContent="Prepared in canonical Platform, NOT SENT. Share privately only with the intended contact and after confirming consent.";
  const input=document.createElement("input");input.value=url;input.readOnly=true;input.setAttribute("aria-label","Prepared private invitation link");
  const copy=document.createElement("button");copy.type="button";copy.className="button button-quiet";copy.textContent="Copy private link";
  copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(url);copy.textContent="Copied — not sent"}catch{input.select();toast("Select and copy the private link manually.")}});
  wrap.append(explanation,input,copy);toast("Prepared invitation persisted. No message has been sent.");
 }catch(error){toast("Invitation was not confirmed: "+error.message,true)}
 finally{state.busy=false}
}
async function checkSystems(){
 try{
  const data=await call("/api/system",{auth:false}),online=!!data.platform?.reachable,company=!!data.company_os?.reachable;
  $("platformBadge").innerHTML='<span class="status-dot '+(online?"connected":"offline")+'"></span><span>'+(online?"Platform connected":"Source unavailable")+'</span>';
  text("platformSystem",online?"REACHABLE · "+(data.platform.storage||"unknown storage"):"UNREACHABLE");
  $("platformSystem").classList.toggle("ok",online);
  text("companySystem",company?"HEALTH REACHABLE · SYNC NOT PROVED":"HEALTH UNREACHABLE");
  $("companySystem").classList.toggle("ok",company);
 }catch{
  $("platformBadge").innerHTML='<span class="status-dot offline"></span><span>Source check failed</span>';
  text("platformSystem","UNVERIFIED");text("companySystem","UNVERIFIED");
 }
}
function formStep(index){
 state.step=Math.min(2,Math.max(0,index));
 document.querySelectorAll("[data-form-step]").forEach(el=>el.hidden=Number(el.dataset.formStep)!==state.step);
 document.querySelectorAll("[data-step-dot]").forEach(el=>el.classList.toggle("active",Number(el.dataset.stepDot)===state.step));
}
function validStep(){
 const field=document.querySelector('[data-form-step="'+state.step+'"]');
 if(!field)return false;
 for(const el of field.querySelectorAll("input:not(.honeypot),select,textarea")){
  if(!el.checkValidity()){el.reportValidity();return false}
 }
 return true;
}
async function onSubmitIntake(ev){
 ev.preventDefault();if(state.busy||!validStep())return;
 const f=$("intakeForm"),fd=new FormData(f);
 const data=Object.fromEntries(fd.entries());data.consent=f.elements.consent.checked;data.website=f.elements.website.value;
 if(!state.requestId)state.requestId="RID-OPP-"+(globalThis.crypto?.randomUUID?.().replace(/-/g,"").slice(0,24).toUpperCase()||Date.now().toString(36).toUpperCase()+"G7X92KL0");
 data.request_id=state.requestId;
 state.busy=true;const btn=$("submitIntake");btn.disabled=true;btn.textContent="Persisting to Platform…";
 try{
  const receipt=await call("/api/intake",{method:"POST",body:data,auth:false});
  if(!receipt.persisted||!receipt.intake_id)throw Error("No canonical source receipt returned");
  $("intakeForm").hidden=true;$("intakeSuccess").hidden=false;
  text("receiptId",receipt.request_id+" · "+receipt.intake_id);
  toast("Canonical record persisted; owner review is the next step.");
  state.requestId="";
 }catch(error){toast("Submission not verified: "+error.message,true)}
 finally{state.busy=false;btn.disabled=false;btn.innerHTML='Submit opportunity <span>↗</span>'}
}
function onClickDelegated(ev){
 const view=ev.target.closest("[data-view]");
 if(view){showView(view.dataset.view);return}
 const source=ev.target.closest("[data-case]");
 if(source){openCase(source.dataset.case);return}
 const graph=ev.target.closest("[data-graph]");
 if(graph){loadGraph(graph.dataset.graph);return}
}
document.addEventListener("click",onClickDelegated);
document.addEventListener("keydown",ev=>{
 if((ev.key==="Enter"||ev.key===" ")&&ev.target.matches("[data-case]")&&ev.target.tagName==="TR"){
  ev.preventDefault();openCase(ev.target.dataset.case)}
});
$("unlockForm").addEventListener("submit",login);
$("lockButton").addEventListener("click",()=>{setLocked();toast("Workspace locked. Credential cleared from application memory.")});
$("refreshButton").addEventListener("click",async()=>{
 if(!state.key){toast("Unlock to refresh private records.");return}
 try{await loadCases();await loadMatches();toast("Canonical source refreshed.")}catch(error){toast("Refresh failed: "+error.message,true)}
});
$("closeDialog").addEventListener("click",()=>$("caseDialog").close());
$("caseDialog").addEventListener("click",ev=>{if(ev.target===$("caseDialog"))$("caseDialog").close()});
$("caseUpdateForm").addEventListener("submit",onUpdate);
$("activityForm").addEventListener("submit",onActivity);
$("inviteForm").addEventListener("submit",onInvite);
$("caseSearch").addEventListener("input",renderCases);
$("stageFilter").addEventListener("change",renderCases);
$("ventureFilter").addEventListener("change",renderCases);
$("prevPage").addEventListener("click",async()=>{state.offset=Math.max(0,state.offset-state.limit);try{await loadCases()}catch(e){toast(e.message,true)}});
$("nextPage").addEventListener("click",async()=>{state.offset+=state.limit;try{await loadCases()}catch(e){toast(e.message,true)}});
$("checkSystems").addEventListener("click",checkSystems);
$("menuButton").addEventListener("click",()=>{const open=$("sidebar").classList.toggle("open");$("menuButton").setAttribute("aria-expanded",String(open))});
$("intakeForm").addEventListener("submit",onSubmitIntake);
document.querySelectorAll("[data-next-step]").forEach(btn=>btn.addEventListener("click",()=>{if(validStep())formStep(state.step+1)}));
document.querySelectorAll("[data-prev-step]").forEach(btn=>btn.addEventListener("click",()=>formStep(state.step-1)));
$("resetIntake").addEventListener("click",()=>{$("intakeForm").reset();$("intakeForm").hidden=false;$("intakeSuccess").hidden=true;state.requestId="";formStep(0)});
const query=new URLSearchParams(location.search);
if(query.get("type")){$('select[name="kind"]').value=query.get("type")}
if(query.get("source")){$('select[name="source"]').value=query.get("source")}
showView(location.pathname==="/apply"?"apply":"overview");
formStep(0);renderAll();checkSystems();
})();
