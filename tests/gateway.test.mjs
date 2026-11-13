import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {createApp,recommendMatches,validatePublicIntake,HTTPError} from "../server.mjs";

const sample={
 name:"Research Collaborator",email:"person@example.invalid",organization:"Example Company",
 title:"Build a reciprocal partner pilot",description:"A scoped B2B partnership proposal offering real buyer introductions and implementation advice.",
 kind:"partnership",initiative:"noetfield",role:"partner",source:"linkedin",
 offer:"Introductions to buyers in construction",ask:"Construction workflow pilot",
 consent:true,reference_url:"https://example.com/proposal",deadline:"2026-11-20",terms:"Discuss terms"
};
const cases=[
 {intake_id:"INT-ABCDEF123456",person:"Partner One",email:"first@example.invalid",
  organization:"One Inc",initiative:"noetfield",stage:"NEW",title:"Buyer connections",
  offer:"Introductions to buyers in construction",ask:"AI workflow pilot",
  consent_contact:true,priority_score:80,revision:0,next_action_due:"2026-11-19"},
 {intake_id:"INT-ABCDEF123457",person:"Partner Two",email:"second@example.invalid",
  organization:"Two Inc",initiative:"noetfield",stage:"QUALIFYING",title:"Construction AI build",
  offer:"AI workflow pilot for construction",ask:"Introductions to buyers",
  consent_contact:true,priority_score:67,revision:2,next_action_due:null},
 {intake_id:"INT-ABCDEF123458",person:"Third",email:"third@example.invalid",
  organization:"Independent Ltd",initiative:"trustfield",stage:"NEW",title:"Independent product",
  offer:"AI workflow pilot for construction",ask:"Introductions to buyers",
  consent_contact:true,priority_score:65,revision:0},
];
function listen(server){return new Promise(resolve=>server.listen(0,"127.0.0.1",()=>resolve("http://127.0.0.1:"+server.address().port)))}
function close(server){return new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))}
async function read(req){let s="";for await(const c of req)s+=c;return s?JSON.parse(s):{}}
async function fixture(fn){
 let canonicalIntake=null,patch=null,activity=null,invitation=null,companyPosts=0;
 let providerSend=null,reportedOutcome=null,workforceHandoff=null;
 const companyTasks=[];
 const upstream=http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");
  const p=url.pathname;
  res.setHeader("Content-Type","application/json");
  const send=(code,data)=>{res.statusCode=code;res.end(JSON.stringify(data))};
  if(p==="/api/intake/health")return send(200,{storage:"postgres",ok:true});
  if(p==="/health")return send(200,{status:"ok",service:"company-os"});
  if(p==="/api/intake"&&req.method==="POST"){canonicalIntake=await read(req);return send(200,{intake_id:"INT-CANON123456",request_id:canonicalIntake.request_id,deduped:false})}
  if(p==="/api/control/tasks"){
    if(req.headers.authorization!=="Bearer fixture-company-token-123456")
      return send(401,{detail:"Founder authentication required"});
    if(req.method==="GET")return send(200,{tasks:companyTasks});
    if(req.method==="POST"){
      const body=await read(req);companyPosts++;
      const task={...body,id:"task_fixture_"+companyPosts,status:"queued",created_at:new Date().toISOString()};
      companyTasks.unshift(task);
      return send(200,{created:true,task_id:task.id});
    }
  }
  if(!req.headers["x-admin-secret"]||req.headers["x-admin-secret"]!=="fixture-key-123456")
   return send(403,{detail:"FORBIDDEN"});
  if(p.endsWith("/invitations/send")&&req.method==="POST"){
    if(req.headers.origin!==upstreamBase)return send(403,{detail:"CROSS_ORIGIN_WRITE_DENIED"});
    providerSend=await read(req);
    return send(200,{persisted:true,sent:true,provider_accepted:true,
     invitation_id:"inv_abcdef0123456789",provider_message_id:"provider_fixture_123456",
     recipient_delivery_verified:false,accepted_by_recipient:false});
  }
  if(p.endsWith("/outcomes")&&req.method==="POST"){
    if(req.headers.origin!==upstreamBase)return send(403,{detail:"CROSS_ORIGIN_WRITE_DENIED"});
    reportedOutcome=await read(req);
    return send(200,{persisted:true,independently_verified:false,
     collected_cash_verified:false,reported_outcome:{type:reportedOutcome.outcome_type}});
  }
  if(p.endsWith("/workforce/status")&&req.method==="GET"){
    return send(200,{connected:true,case:{case_id:"opp_nf_source_123456",
     owner:"Human operator",stage:"qualifying",verification_state:"NOT_INDEPENDENTLY_VERIFIED"}});
  }
  if(p.endsWith("/workforce/handoff")&&req.method==="POST"){
    if(req.headers.origin!==upstreamBase)return send(403,{detail:"CROSS_ORIGIN_WRITE_DENIED"});
    workforceHandoff=await read(req);
    return send(200,{accepted:true,case:{case_id:"opp_nf_source_123456",
     owner:workforceHandoff.owner,stage:"qualifying"},independently_verified:false});
  }
  if(p==="/api/opportunities/desk/page")return send(200,{items:cases,total:3,limit:100,offset:0,source:"canonical_platform_public_intakes"});
  if(p.endsWith("/relationship")){
    const sourceId=p.split("/")[4],row=cases.find(x=>x.intake_id===sourceId);
    if(!row)return send(404,{detail:"RELATIONSHIP_SOURCE_NOT_FOUND"});
    return send(200,{schema:"noetfield.connect.relationship-graph.v1",
      opportunity_count:1,person_id:"claim_person_source",
      nodes:[{type:"person_claim",label:row.person},
        {type:"opportunity",id:row.intake_id,venture:row.initiative,label:row.title}],
      edges:[{from:"claim_person_source",to:row.intake_id,provenance:row.intake_id}],
      timeline:[{kind:"intake.persisted",intake_id:row.intake_id}]});
  }
  if(p==="/api/opportunities/desk/"+cases[0].intake_id&&req.method==="PATCH"){patch=await read(req);return send(200,{persisted:true,source_intake_id:cases[0].intake_id,state:{revision:1},external_action_executed:false})}
  if(p.endsWith("/activity")&&req.method==="POST"){activity=await read(req);return send(200,{persisted:true,source_intake_id:cases[0].intake_id,independently_verified:false})}
  if(p.endsWith("/invitations")&&req.method==="POST"){invitation=await read(req);return send(200,{created:true,state:"PREPARED_NOT_SENT",invitation_id:"inv_abcdabcdabcdabcd",share_token:"privatetokensecret"+"_123456789012345678901234567890"})}
  return send(404,{detail:"CANONICAL_ROUTE_NOT_FOUND"});
 });
 const upstreamBase=await listen(upstream);
 const app=http.createServer(createApp({platformBase:upstreamBase,companyBase:upstreamBase}));
 const base=await listen(app);
 try{await fn({base,getEvidence:()=>({canonicalIntake,patch,activity,invitation,companyPosts,companyTasks,providerSend,reportedOutcome,workforceHandoff})})}finally{await close(app);await close(upstream)}
}
async function req(base,p,{method="GET",body=null,key=null}={}){
 const res=await fetch(base+p,{method,headers:{"Accept":"application/json",
  ...(body?{"Content-Type":"application/json"}:{}),...(key?{"X-Admin-Secret":key}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
 const contentType=res.headers.get("content-type")||"";
 return {status:res.status,headers:res.headers,data:contentType.includes("application/json")?await res.json():await res.text()};
}

test("canonical public intake validation enforces consent, metadata, source and scoped venture",()=>{
 const good=validatePublicIntake(sample);
 assert.equal(good.metadata.form_id,"nfConnectWizard");
 assert.equal(good.metadata.initiative,"noetfield");
 assert.equal(good.metadata.consent_contact,true);
 assert.equal(good.vector,"external-opportunities");
 assert.match(good.request_id,/^RID-OPP-/);
 assert.equal(good.metadata.lead_source,"linkedin");
 assert.equal(good.metadata.offering,sample.offer);
 for(const changes of [{consent:false},{kind:"untrusted"},{initiative:"other-company"},
   {reference_url:"javascript:alert(1)"},{email:"not-an-email"},{title:"a"},{website:"bot"}]){
  assert.throws(()=>validatePublicIntake({...sample,...changes}),HTTPError);
 }
});
test("reciprocal matching excludes cross-venture, unconsenting and self-pairs",()=>{
 const matches=recommendMatches(cases);
 assert.equal(matches.length,1);
 assert.deepEqual(matches[0].source_ids,[cases[0].intake_id,cases[1].intake_id]);
 assert.equal(matches[0].venture,"noetfield");
 assert.equal(matches[0].status,"PROPOSED_NOT_SHARED_OR_ACCEPTED");
 assert.equal(matches[0].cash_collected,null);
 assert.deepEqual(recommendMatches(cases.map(x=>({...x,consent_contact:false}))),[]);
 assert.deepEqual(recommendMatches(cases.map(x=>({...x,email:"same@example.invalid"}))),[]);
});
test("static premium HTML and script contain complete real journeys and no storage of admin secret",async()=>{
 const dir=path.join(path.dirname(fileURLToPath(import.meta.url)),"../public");
 const html=await readFile(path.join(dir,"index.html"),"utf8"),js=await readFile(path.join(dir,"app.js"),"utf8");
 for(const target of ["overview","pipeline","relationships","matching","execution","revenue","apply","systems"])
  assert.match(html,new RegExp('data-screen="'+target+'"'));
 for(const id of ["unlockForm","intakeForm","caseUpdateForm","activityForm","inviteForm","dispatchForm","caseDialog","matchesList"])
  assert.ok(html.includes('id="'+id+'"'));
 assert.ok(js.includes("/api/operator/cases"));
 assert.ok(js.includes("www.noetfield.com/connect/respond/#case="));
 assert.ok(!js.includes("localStorage"));
 assert.ok(!js.includes("sessionStorage"));
 assert.ok(html.includes("No demo leads. No phantom bookings."));
});
test("end-to-end gateway: health, verified public persistence, auth, graph, matching, activity and invitations",async()=>{
 await fixture(async({base,getEvidence})=>{
  const health=await req(base,"/health");assert.equal(health.status,200);
  assert.equal(health.data.persistence,"UPSTREAM_ONLY");
  const system=await req(base,"/api/system");assert.equal(system.status,200);
  assert.equal(system.data.platform.storage,"postgres");
  assert.equal(system.data.company_os.reachable,true);
  const missing=await req(base,"/api/operator/cases");assert.equal(missing.status,401);
  const wrong=await req(base,"/api/operator/cases",{key:"wrong-key-12345"});assert.equal(wrong.status,403);
  const key="fixture-key-123456";
  const list=await req(base,"/api/operator/cases?limit=100&offset=0",{key});
  assert.equal(list.status,200);assert.equal(list.data.items.length,3);
  assert.equal(list.data.source,"canonical_platform_public_intakes");
  const match=await req(base,"/api/operator/matches",{key});
  assert.equal(match.data.matches.length,1);assert.equal(match.data.verified_collected_cash,null);
  const graph=await req(base,"/api/operator/cases/INT-ABCDEF123456/relationship",{key});
  assert.equal(graph.status,200);assert.equal(graph.data.opportunity_count,1);
  const updated=await req(base,"/api/operator/cases/INT-ABCDEF123456",{method:"PATCH",key,
   body:{expected_revision:0,stage:"QUALIFYING",owner:"Founder",next_action:"Call the partner",due_date:"2026-11-20",note:"Review offer"}});
  assert.equal(updated.status,200);assert.equal(updated.data.persisted,true);
  const observed=await req(base,"/api/operator/cases/INT-ABCDEF123456/activity",{method:"POST",key,
   body:{expected_revision:1,action:"draft_prepared",body:"Followup drafted; not sent",evidence_url:""}});
  assert.equal(observed.status,200);assert.equal(observed.data.independently_verified,false);
  const invite=await req(base,"/api/operator/cases/INT-ABCDEF123456/invitations",{method:"POST",key,
   body:{expected_revision:2,scope:"collaboration",message:"A scoped proposal to exchange introductions and value",request_id:"req_123456789abcdef123456789"}});
  assert.equal(invite.status,200);assert.equal(invite.data.state,"PREPARED_NOT_SENT");
  const forbidden=await req(base,"/api/operator/cases/INT-ABCDEF123456",{method:"PATCH",key,
   body:{stage:"WON",cash_collected:999999}});
  assert.equal(forbidden.status,422);
  const saved=await req(base,"/api/intake",{method:"POST",body:sample});
  assert.equal(saved.status,201);assert.equal(saved.data.persisted,true);
  assert.equal(saved.data.accepted,false);assert.equal(saved.data.agent_dispatched,false);
  assert.equal(saved.data.cash_collected,null);
  assert.equal(saved.data.intake_id,"INT-CANON123456");
  const evidence=getEvidence();
  assert.equal(evidence.canonicalIntake.metadata.form_id,"nfConnectWizard");
  assert.equal(evidence.canonicalIntake.metadata.consent_contact,true);
  assert.equal(evidence.patch.next_action,"Call the partner");
  assert.equal(evidence.activity.action,"draft_prepared");
  assert.equal(evidence.invitation.scope,"collaboration");
  const page=await req(base,"/");assert.equal(page.status,200);
  assert.match(page.data,/Every connection/);
  assert.match(page.headers.get("content-security-policy"),/frame-ancestors 'none'/);
  const js=await req(base,"/app.js");assert.equal(js.status,200);
  const favicon=await req(base,"/favicon.svg");assert.equal(favicon.status,200);
  const bad=await req(base,"/../../.env");assert.equal(bad.status,404);
 });
});


test("real Company OS specialist task is founder-authorized, source-scoped, readback-verified and deduped",async()=>{
 await fixture(async({base,getEvidence})=>{
  const key="fixture-key-123456";
  const mission="Research this canonical partner case, prepare an evidence-ranked qualification memo, and draft a human-reviewed next action.";
  const body={
    brand:"noetfield",role:"partnerships",mission,
    company_token:"fixture-company-token-123456",
    request_id:"req_abcdefghijklmnop1234567890",
  };
  const p="/api/operator/cases/INT-ABCDEF123456/dispatch";
  const unauth=await req(base,p,{method:"POST",body});
  assert.equal(unauth.status,401,"No founder admin secret: deny dispatch");
  const missingCompany=await req(base,p,{method:"POST",key,body:{...body,company_token:"invalid-company-token"}});
  assert.equal(missingCompany.status,403,"No valid Company OS Founder auth: deny dispatch");
  const invalidRole=await req(base,p,{method:"POST",key,body:{...body,role:"marketing_spam"}});
  assert.equal(invalidRole.status,422);
  const crossVenture=await req(base,"/api/operator/cases/INT-ABCDEF123458/dispatch",{
    method:"POST",key,body:{...body,brand:"noetfield"}});
  assert.equal(crossVenture.status,403);
  const first=await req(base,p,{method:"POST",key,body});
  assert.equal(first.status,200,JSON.stringify(first.data));
  assert.equal(first.data.created,true);
  assert.equal(first.data.readback_verified,true);
  assert.equal(first.data.system,"EXISTING_BUSINESS_OS_CORE");
  assert.equal(first.data.role,"partnerships");
  assert.equal(first.data.company_status,"queued");
  assert.equal(first.data.external_contact,false);
  assert.equal(first.data.work_completed,false);
  assert.equal(first.data.cash_collected,null);
  const again=await req(base,p,{method:"POST",key,body});
  assert.equal(again.status,200);
  assert.equal(again.data.idempotent,true);
  assert.equal(again.data.created,false);
  assert.equal(again.data.task_id,first.data.task_id);
  const statusPath="/api/operator/cases/INT-ABCDEF123456/company-status";
  const noAuth=await req(base,statusPath,{method:"POST",body:{company_token:body.company_token}});
  assert.equal(noAuth.status,401);
  const badToken=await req(base,statusPath,{method:"POST",key,
   body:{company_token:"invalid-company-token"}});
  assert.equal(badToken.status,403);
  const readback=await req(base,statusPath,{method:"POST",key,
   body:{company_token:body.company_token}});
  assert.equal(readback.status,200,JSON.stringify(readback.data));
  assert.equal(readback.data.readback_verified,true);
  assert.equal(readback.data.returned,1);
  assert.equal(readback.data.tasks[0].task_id,first.data.task_id);
  assert.equal(readback.data.tasks[0].status,"queued");
  assert.equal(readback.data.independent_work_completion_verified,false);
  assert.equal(readback.data.collected_cash_verified,false);
  assert.ok(!JSON.stringify(readback.data).includes("first@example.invalid"));
  const crossScope=await req(base,
   "/api/operator/cases/INT-ABCDEF123458/company-status",
   {method:"POST",key,body:{company_token:body.company_token}});
  assert.equal(crossScope.status,403);

  const evidence=getEvidence();
  assert.equal(evidence.companyPosts,1,"Exactly one real Company OS task created in fixture");
  assert.equal(evidence.companyTasks.length,1);
  assert.match(evidence.companyTasks[0].objective,/INT-ABCDEF123456/);
  assert.match(evidence.companyTasks[0].objective,/OPPOS:req_abcdefghijklmnop1234567890/);
  assert.ok(!evidence.companyTasks[0].objective.includes("first@example.invalid"),
    "Do not copy a contact's PII into a task objective");
 });
});


test("actual HTTP Action Desk reads authenticated source cases; shares only canonical intake links",async()=>{
 await fixture(async({base})=>{
  const missing=await req(base,"/api/operator/action-queue");
  assert.equal(missing.status,401);
  const wrong=await req(base,"/api/operator/action-queue",{key:"incorrect-credential"});
  assert.equal(wrong.status,403);
  const now=await req(base,"/api/operator/action-queue?limit=2&offset=0",{key:"fixture-key-123456"});
  assert.equal(now.status,200);
  assert.equal(now.data.schema,"noetfield.opportunity-os.action-queue.v1");
  assert.equal(now.data.source,"CANONICAL_PLATFORM_INTAKE");
  assert.equal(now.data.source_total,3);
  assert.equal(now.data.source_limit,2);
  assert.ok(now.data.items.some(row=>row.intake_id==="INT-ABCDEF123456"));
  assert.equal(now.data.verified_revenue,null);
  for(const row of now.data.items){
   assert.equal(row.external_message_sent,false);
   if(row.draft){assert.equal(row.draft.mode,"DRAFT_NOT_SENT")}
  }
  const share=await req(base,"/api/share-links");
  assert.equal(share.status,200);
  assert.equal(share.data.links.length,6);
  assert.ok(share.data.links.every(x=>x.url.startsWith("https://www.noetfield.com/connect/?type=")));
  assert.equal(share.data.no_external_send,true);
 });
});


test("authenticated provider invitation, reported outcome and WorkforceOS handoff stay source-linked", async()=>{
 await fixture(async({base,getEvidence})=>{
  const id="INT-ABCDEF123456",key="fixture-key-123456";
  const prefix="/api/operator/cases/"+id;
  const invitation={expected_revision:1,scope:"trial",
   message:"A scoped project trial with a clear defined deliverable",
   request_id:"req_12345678901234567890"};
  const unauth=await req(base,prefix+"/invitations/send",{method:"POST",body:invitation});
  assert.equal(unauth.status,401);
  const forbiddenRecipient=await req(base,prefix+"/invitations/send",{method:"POST",key,
   body:{...invitation,recipient:"third-party@example.invalid"}});
  assert.equal(forbiddenRecipient.status,422,"Browser cannot choose the recipient");
  const sent=await req(base,prefix+"/invitations/send",{method:"POST",key,body:invitation});
  assert.equal(sent.status,200,JSON.stringify(sent.data));
  assert.equal(sent.data.provider_accepted,true);
  assert.equal(sent.data.recipient_delivery_verified,false);
  assert.ok(!Object.hasOwn(sent.data,"share_token"));
  assert.equal(getEvidence().providerSend.request_id,invitation.request_id);
  const observed=await req(base,prefix+"/outcomes",{method:"POST",key,
   body:{expected_revision:2,request_id:"outcome_12345678901234567890",
    outcome_type:"trial",evidence_url:"https://example.invalid/receipt",
    note:"Operator recorded a scoped trial, not independent verification."}});
  assert.equal(observed.status,200,JSON.stringify(observed.data));
  assert.equal(observed.data.independently_verified,false);
  assert.equal(observed.data.collected_cash_verified,false);
  assert.equal(getEvidence().reportedOutcome.outcome_type,"trial");
  const status=await req(base,prefix+"/workforce/status",{key});
  assert.equal(status.status,200);
  assert.equal(status.data.case.verification_state,"NOT_INDEPENDENTLY_VERIFIED");
  const handoff=await req(base,prefix+"/workforce/handoff",{method:"POST",key,
   body:{request_id:"handoff_12345678901234567890",owner:"Human operator",
    next_action:"Review the original source proposal",due_date:"2026-11-19",
    match_quality:"not_assessed",assignment_reference:""}});
  assert.equal(handoff.status,200,JSON.stringify(handoff.data));
  assert.equal(handoff.data.independently_verified,false);
  assert.equal(getEvidence().workforceHandoff.owner,"Human operator");
 });
});
