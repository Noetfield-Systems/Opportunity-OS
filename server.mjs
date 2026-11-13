/**
 * Opportunity OS — production gateway over the canonical Noetfield Platform.
 * Zero persistent CRM/lead duplication, no operator credentials stored or logged.
 */
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { makeActionQueue, sourceShareLinks } from "./action_engine.mjs";

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PUBLIC=path.join(ROOT,"public");
const VERSION="1.0.0";
const INTAKE_KINDS=new Set(["business","growth","capital","partnership","people","events","other"]);
const VENTURES=new Set(["noetfield","portfolio","workforce","sourcea","outboundos","buildworkflow",
 "buildrelay","signalforge","earnloop","misenorth","interiormatch","trustfield","other"]);
const ROLES=new Set(["founder","customer","partner","investor","advisor","human_contributor",
 "ai_operator","organizer","other"]);
const SOURCES=new Set(["linkedin","referral","email","event","website","community","direct","other"]);
const STATIC={"/":"index.html","/apply":"index.html","/app.js":"app.js","/styles.css":"styles.css","/favicon.svg":"favicon.svg"};
const TYPES={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",
 ".js":"text/javascript; charset=utf-8",".svg":"image/svg+xml"};
const STOP=new Set("about after again agent agents also always and are because been bring build business can could from have into just many need not only opportunity our out over their them then there these this those through want what when where which will with work your you the who".split(" "));
const STD_HEADERS={
 "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
 "X-Frame-Options":"DENY","Cross-Origin-Resource-Policy":"same-origin",
 "Permissions-Policy":"camera=(), microphone=(), geolocation=(), payment=()",
 "Content-Security-Policy":"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
};
const limiters=new Map();
export class HTTPError extends Error{
 constructor(status,detail){super(detail);this.status=status;this.detail=detail;}
}
function reply(res,status,data,headers={}){
 const body=JSON.stringify(data);
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store, private","Pragma":"no-cache",...STD_HEADERS,...headers});
 res.end(body);
}
function string(value,max=3000){return typeof value==="string"?value.trim().slice(0,max):"";}
function strictString(value,max){return typeof value==="string"&&value.trim().length<=max?value.trim():"";}
function rateLimit(req,scope,max,windowMs){
 // This is a lightweight in-process abuse brake, not an authentication authority.
 const addr=req.socket?.remoteAddress||"unknown";
 const key=scope+":"+addr, now=Date.now(), old=limiters.get(key)||[];
 const next=old.filter(time=>time>now-windowMs);
 if(next.length>=max)throw new HTTPError(429,"TOO_MANY_REQUESTS");
 next.push(now);limiters.set(key,next);
 if(limiters.size>2500){for(const [k,v] of limiters){if(v.every(t=>t<now-windowMs))limiters.delete(k)}}
}
async function jsonBody(req,max=18000){
 if(!String(req.headers["content-type"]||"").startsWith("application/json"))throw new HTTPError(415,"JSON_REQUIRED");
 let length=0,body="";
 for await(const chunk of req){length+=chunk.length;if(length>max)throw new HTTPError(413,"REQUEST_TOO_LARGE");body+=chunk.toString("utf8");}
 let parsed;try{parsed=JSON.parse(body)}catch{throw new HTTPError(400,"INVALID_JSON")}
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new HTTPError(422,"INVALID_PAYLOAD");
 return parsed;
}
function int(value,min,max,fallback){const num=Number(value);return Number.isInteger(num)&&num>=min&&num<=max?num:fallback;}
function validId(id){return /^INT-[A-Za-z0-9-]{6,80}$/.test(id||"")}
function validateSecret(req){
 const value=req.headers["x-admin-secret"];
 if(typeof value!=="string"||value.length<8||value.length>256||/[\r\n]/.test(value))
  throw new HTTPError(401,"OPERATOR_KEY_REQUIRED");
 rateLimit(req,"admin",80,15*60*1000);
 return value;
}
function tokenSet(input){return new Set((String(input||"").toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[])
 .filter(v=>!STOP.has(v)).slice(0,180))}
function overlap(a,b){
 const A=tokenSet(a),B=tokenSet(b);
 if(!A.size||!B.size)return [];
 return [...A].filter(w=>B.has(w)).slice(0,9);
}
export function recommendMatches(rows){
 const candidates=Array.isArray(rows)?rows.filter(row=>row&&typeof row==="object"&&row.consent_contact===true
 &&string(row.offer,1200).length>5&&string(row.ask,1200).length>5):[];
 const matches=[];
 for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
  const a=candidates[i],b=candidates[j];
  if(!validId(a.intake_id)||!validId(b.intake_id))continue;
  // Independent ventures never silently cross scope, regardless of scoring.
  if(!a.initiative||a.initiative!==b.initiative||a.initiative==="portfolio")continue;
  if((a.email||"").trim().toLowerCase()===(b.email||"").trim().toLowerCase())continue;
  const ab=overlap(a.offer,b.ask),ba=overlap(b.offer,a.ask);
  const best=Math.max(ab.length,ba.length);
  if(best<1)continue;
  const score=Math.min(95,35+Math.min(5,best)*12+Math.min(ab.length,ba.length)*5);
  matches.push({id:[a.intake_id,b.intake_id].sort().join("::"),score,
    venture:a.initiative,source_ids:[a.intake_id,b.intake_id],
    names:[string(a.person,120),string(b.person,120)],
    titles:[string(a.title,160),string(b.title,160)],
    shared_terms:{a_offers_b_needs:ab,b_offers_a_needs:ba},
    status:"PROPOSED_NOT_SHARED_OR_ACCEPTED",identity:"SELF_REPORTED",
    consent:"CONTACT_ONLY; THIRD_PARTY_INTRODUCTION_NOT_AUTHORIZED",
    outcome:"NOT_VERIFIED",cash_collected:null});
 }
 return matches.sort((a,b)=>b.score-a.score).slice(0,25);
}
export function validatePublicIntake(body){
 const name=strictString(body.name,120),email=strictString(body.email,254).toLowerCase();
 const organization=strictString(body.organization,200);
 const title=strictString(body.title,160),description=strictString(body.description,3500);
 const kind=string(body.kind,40),initiative=string(body.initiative,80),
 role=string(body.role,80),source=string(body.source,40);
 const offer=strictString(body.offer,1200),ask=strictString(body.ask,1200),
 reference_url=strictString(body.reference_url,700),terms=strictString(body.terms,1200);
 const deadline=strictString(body.deadline,10);
 if(body.website)throw new HTTPError(422,"INVALID_SUBMISSION");
 if(!name||name.length<2||!organization||!title||title.length<4||description.length<30)
   throw new HTTPError(422,"MISSING_REQUIRED_OPPORTUNITY_DETAILS");
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new HTTPError(422,"INVALID_EMAIL");
 if(!INTAKE_KINDS.has(kind)||!VENTURES.has(initiative)||!ROLES.has(role)||!SOURCES.has(source))
   throw new HTTPError(422,"INVALID_ROUTE");
 if(body.consent!==true)throw new HTTPError(422,"CONTACT_CONSENT_REQUIRED");
 if(reference_url&&(!reference_url.startsWith("https://")||!URL.canParse(reference_url)))
   throw new HTTPError(422,"INVALID_HTTPS_REFERENCE");
 if(deadline&&!/^\d{4}-\d\d-\d\d$/.test(deadline))throw new HTTPError(422,"INVALID_DEADLINE");
 const request_id=/^RID-OPP-[A-Za-z0-9-]{8,50}$/.test(body.request_id||"")?body.request_id:
  "RID-OPP-"+randomUUID().replace(/-/g,"").slice(0,24).toUpperCase();
 const message=[
  "Opportunity OS / canonical Noetfield Connect submission",
  "Category: "+kind,"Initiative: "+initiative,"Participant role: "+role,
  "Proposal: "+title,"Description: "+description,
  "Offered value (self-reported): "+(offer||"Not supplied"),
  "Requested value (self-reported): "+(ask||"Not supplied"),
  "Reference: "+(reference_url||"Not supplied"),
  "Deadline: "+(deadline||"Not supplied"),
  "Commercial terms: "+(terms||"Not supplied"),
  "Contact permission: Submitted for this case only. No third-party introduction consent.",
  "Source: "+source,
 ].join("\n");
 return {organization,contact_email:email,contact_name:name,request_id,sku:"general",
  vector:"external-opportunities",source:"web",message,
  metadata:{form_id:"nfConnectWizard",page:"/connect/",topic:kind,category:kind,
   initiative,proposal_title:title,proposal_url:reference_url,deadline,
   next_step:"async",participant_role:role,offering:offer,requesting:ask,
   consent_contact:true,lead_source:source,intake_flow:"opportunity-os-canonical-v1"}};
}
export function createApp({platformBase=process.env.PLATFORM_API_BASE||"https://platform.noetfield.com",
 companyBase=process.env.COMPANY_OS_BASE||"https://business-os-core-production.up.railway.app",
 fetcher=globalThis.fetch}={}){
 const platform=platformBase.replace(/\/+$/,"");
 const company=companyBase.replace(/\/+$/,"");

 const dispatchInFlight=new Set();
 const COMPANY_ROLES=new Set([
  "sales_qualification","partnerships","market_intelligence",
  "product_strategy","engineering_operator","chief_of_staff",
 ]);
 const COMPANY_BRANDS=new Set(["noetfield","buildworkflow","signalforge"]);
 async function companyRequest(token,endpoint,method="GET",body=null){
  if(typeof token!=="string"||token.length<16||token.length>512||
    /[\r\n]/.test(token))throw new HTTPError(422,"COMPANY_OS_TOKEN_REQUIRED");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetcher(company+endpoint,{
    method,signal:controller.signal,redirect:"error",
    headers:{"Accept":"application/json","Authorization":"Bearer "+token,
      ...(body?{"Content-Type":"application/json"}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
   });
   let data={};try{data=await response.json()}catch{}
   if(!response.ok){
    throw new HTTPError(response.status===401||response.status===403?403:
      response.status===400||response.status===422?422:503,
      response.status===401||response.status===403?
        "COMPANY_OS_FOUNDER_AUTH_FAILED":"COMPANY_OS_SERVICE_REJECTED");
   }
   return data;
  }catch(error){
   if(error instanceof HTTPError)throw error;
   throw new HTTPError(503,"COMPANY_OS_REQUEST_UNCONFIRMED");
  }finally{clearTimeout(timer)}
 }
 async function dispatchInternalSpecialist(id,secret,body){
  const token=body.company_token,role=body.role,mission=body.mission,
    rid=body.request_id,brand=body.brand;
  if(!COMPANY_ROLES.has(role)||!COMPANY_BRANDS.has(brand)||
     typeof mission!=="string"||mission.trim().length<20||mission.length>900||
     !/^req_[A-Za-z0-9_-]{16,96}$/.test(rid||"")){
   throw new HTTPError(422,"INVALID_SCOPED_DISPATCH");
  }
  const graph=await upstream(platform,"/api/opportunities/desk/"+encodeURIComponent(id)+"/relationship",{secret});
  const opportunity=Array.isArray(graph.nodes)?
    graph.nodes.find(n=>n.type==="opportunity"&&n.id===id):null;
  if(!opportunity)throw new HTTPError(404,"CANONICAL_CASE_NOT_FOUND");
  // Independent ventures are not delegated through Noetfield Company OS.
  if(opportunity.venture!==brand)throw new HTTPError(403,"INDEPENDENT_VENTURE_SCOPE_FORBIDDEN");
  const marker="[OPPOS:"+rid+"]";
  // The one canonical Noetfield intake id is enough context; no PII forwarded.
  const title="Opportunity OS / "+role.replaceAll("_"," ")+" / "+id;
  const objective=(
    marker+" [SOURCE:"+id+"] [VENTURE:"+brand+"] "+
    "Internal research, qualification or planning only; do not send outreach, "+
    "publish, book meetings, grant permissions or claim collected money. "+
    "Follow this scoped founder objective: "+mission.trim()
  ).slice(0,1200);
  const tasks=await companyRequest(token,"/api/control/tasks");
  if(!Array.isArray(tasks.tasks))throw new HTTPError(502,"COMPANY_OS_READBACK_UNAVAILABLE");
  const existing=tasks.tasks.find(t=>
    t&&typeof t.objective==="string"&&t.objective.includes(marker)&&t.brand===brand);
  if(existing){
   return {created:false,idempotent:true,task_id:existing.id,
    company_status:existing.status||"unknown",role,brand,source_intake_id:id,
    readback_verified:true,external_contact:false,work_completed:false,cash_collected:null};
  }
  const flightKey=brand+":"+rid;
  if(dispatchInFlight.has(flightKey))throw new HTTPError(409,"DISPATCH_ALREADY_IN_PROGRESS");
  dispatchInFlight.add(flightKey);
  try{
   const created=await companyRequest(token,"/api/control/tasks","POST",
    {brand,role,title,objective,depends_on:[]});
   if(created.created!==true||typeof created.task_id!=="string"||!created.task_id){
    throw new HTTPError(502,"COMPANY_OS_CREATE_UNCONFIRMED");
   }
   const readback=await companyRequest(token,"/api/control/tasks");
   const row=Array.isArray(readback.tasks)?
      readback.tasks.find(t=>t.id===created.task_id&&t.brand===brand&&
        typeof t.objective==="string"&&t.objective.includes(marker)):null;
   if(!row)throw new HTTPError(502,"TASK_CREATED_BUT_READBACK_UNVERIFIED_DO_NOT_BLINDLY_RETRY");
   return {created:true,idempotent:false,task_id:row.id,
    company_status:row.status||"unknown",role,brand,source_intake_id:id,
    readback_verified:true,external_contact:false,work_completed:false,
    cash_collected:null};
  }finally{dispatchInFlight.delete(flightKey)}
 }

 async function upstream(base,endpoint,{method="GET",body=null,secret="",timeout=10000,origin=""}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
   const response=await fetcher(base+endpoint,{
    method,signal:controller.signal,redirect:"error",
    headers:{"Accept":"application/json",...(body?{"Content-Type":"application/json"}:{}),
     ...(secret?{"X-Admin-Secret":secret}:{}),
     ...(origin?{"Origin":origin}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
   });
   let data={};try{data=await response.json()}catch{}
   if(!response.ok){
    const detail=string(data.detail,180)||"UPSTREAM_UNAVAILABLE";
    throw new HTTPError([400,401,403,404,409,410,422,429,503].includes(response.status)?response.status:502,detail);
   }
   return data;
  }catch(error){
   if(error instanceof HTTPError)throw error;
   throw new HTTPError(503,"CANONICAL_UPSTREAM_UNAVAILABLE");
  }finally{clearTimeout(timer)}
 }
 async function serveStatic(req,res,p){
  const filename=STATIC[p];
  if(!filename)throw new HTTPError(404,"NOT_FOUND");
  const ext=path.extname(filename),bytes=await readFile(path.join(PUBLIC,filename));
  res.writeHead(200,{"Content-Type":TYPES[ext]||"application/octet-stream",
   "Cache-Control":ext===".html"?"no-cache":"public, max-age=3600",
   ...STD_HEADERS});
  if(req.method==="HEAD")res.end();else res.end(bytes);
 }
 return async function handle(req,res){
  try{
   const url=new URL(req.url||"/","http://localhost");
   const p=url.pathname.replace(/\/+$/,"")||"/";
   if(req.method==="GET"&&p==="/health"){
    return reply(res,200,{ok:true,service:"opportunity-os",version:VERSION,
     source:"Noetfield canonical Platform API",persistence:"UPSTREAM_ONLY",
     external_execution_claimed:false,checked_at:new Date().toISOString()});
   }
   if(req.method==="GET"&&p==="/api/system"){
    rateLimit(req,"system",80,60000);
    const results=await Promise.allSettled([
     upstream(platform,"/api/intake/health",{timeout:4500}),
     upstream(company,"/health",{timeout:4500})
    ]);
    const pStatus=results[0].status==="fulfilled"?results[0].value:null;
    const cStatus=results[1].status==="fulfilled"?results[1].value:null;
    return reply(res,200,{source:"LIVE_READ_ONLY_CHECK",timestamp:new Date().toISOString(),
     platform:{reachable:!!pStatus,storage:pStatus?.storage||"unverified",
      canonical:"platform.noetfield.com"},
     company_os:{reachable:!!cStatus,service:"Business OS Core",
      execution_link:"EXISTING_PLATFORM_INTAKE_SYNC_NOT_VERIFIED_BY_THIS_PROBE"},
     autonomous_execution:"NOT_VERIFIED",collected_revenue:null});
   }
   if(req.method==="GET"&&p==="/api/share-links"){
    rateLimit(req,"share-links",90,60000);
    return reply(res,200,{source:"CANONICAL_NOETFIELD_CONNECT",
      no_external_send:true,links:sourceShareLinks()});
   }
   if(req.method==="POST"&&p==="/api/intake"){
    rateLimit(req,"public-intake",12,60000);
    const submitted=validatePublicIntake(await jsonBody(req,12000));
    const data=await upstream(platform,"/api/intake",{method:"POST",body:submitted,timeout:15000});
    if(!validId(data.intake_id))throw new HTTPError(502,"NO_CANONICAL_PERSISTENCE_RECEIPT");
    return reply(res,201,{ok:true,intake_id:data.intake_id,
     request_id:data.request_id||submitted.request_id,source:"PLATFORM_POSTGRES",
     persisted:true,deduped:data.deduped===true,
     accepted:false,meeting_booked:false,agent_dispatched:false,
     cash_collected:null});
   }
   if(p.startsWith("/api/operator/")){
    const secret=validateSecret(req);
    if(req.method==="GET"&&p==="/api/operator/cases"){
     const limit=int(url.searchParams.get("limit"),1,100,60);
     const offset=int(url.searchParams.get("offset"),0,10000,0);
     const data=await upstream(platform,"/api/opportunities/desk/page?limit="+limit+"&offset="+offset,{secret});
     return reply(res,200,data);
    }
    if(req.method==="GET"&&p==="/api/operator/action-queue"){
     const limit=int(url.searchParams.get("limit"),1,100,100);
     const offset=int(url.searchParams.get("offset"),0,10000,0);
     const data=await upstream(platform,
       "/api/opportunities/desk/page?limit="+limit+"&offset="+offset,{secret});
     const queue=makeActionQueue(data.items||[],{limit});
     return reply(res,200,{...queue,source_total:data.total||0,
       source_limit:limit,source_offset:offset});
    }
    if(req.method==="GET"&&p==="/api/operator/matches"){
     const data=await upstream(platform,"/api/opportunities/desk/page?limit=100&offset=0",{secret});
     const matches=recommendMatches(data.items||[]);
     return reply(res,200,{schema:"noetfield.opportunity-os.matches.v1",
      source:"CANONICAL_PLATFORM_INTAKE",scope:"SAME_VENTURE_CONTACT_CONSENT_ONLY",
      sample:"LATEST_100_SOURCE_CASES",matches,confirmed_matches:0,
      verified_outcomes:0,verified_collected_cash:null});
    }
    const match=p.match(/^\/api\/operator\/cases\/(INT-[A-Za-z0-9-]{6,80})(?:\/(relationship|activity|invitations|dispatch))?$/);
    if(match){
     const id=encodeURIComponent(match[1]),sub=match[2];
     const urlPath="/api/opportunities/desk/"+id+(sub?"/"+sub:"");
     if(req.method==="POST"&&sub==="dispatch"){
      const body=await jsonBody(req,6500);
      const allowed=new Set(["role","mission","company_token","request_id","brand"]);
      if(Object.keys(body).some(k=>!allowed.has(k)))throw new HTTPError(422,"UNSUPPORTED_DISPATCH_FIELDS");
      const result=await dispatchInternalSpecialist(match[1],secret,body);
      return reply(res,200,{ok:true,system:"EXISTING_BUSINESS_OS_CORE",...result});
     }

     if(req.method==="GET"&&sub==="relationship"){
      const graph=await upstream(platform,urlPath,{secret});return reply(res,200,graph);
     }
     if(req.method==="PATCH"&&!sub){
      const body=await jsonBody(req,7000);
      const allowed=new Set(["expected_revision","stage","owner","next_action","due_date","note"]);
      if(Object.keys(body).some(k=>!allowed.has(k)))throw new HTTPError(422,"UNSUPPORTED_CASE_FIELDS");
      const data=await upstream(platform,urlPath,{method:"PATCH",body,secret});
      return reply(res,200,data);
     }
     if(req.method==="POST"&&(sub==="activity"||sub==="invitations")){
      const body=await jsonBody(req,6000);
      const allowed=sub==="activity"
       ?new Set(["expected_revision","action","body","evidence_url"])
       :new Set(["expected_revision","scope","message","request_id"]);
      if(Object.keys(body).some(k=>!allowed.has(k)))throw new HTTPError(422,"UNSUPPORTED_ACTION_FIELDS");
      const data=await upstream(platform,urlPath,{method:"POST",body,secret});
      return reply(res,200,data);
     }
    }
    throw new HTTPError(404,"OPERATOR_ROUTE_NOT_FOUND");
   }
   if((req.method==="GET"||req.method==="HEAD")&&Object.hasOwn(STATIC,p))
    return await serveStatic(req,res,p);
   throw new HTTPError(404,"NOT_FOUND");
  }catch(err){
   const status=err instanceof HTTPError?err.status:500;
   if(status===500)console.error("[opportunity-os] request failed:",err?.message||"unknown");
   return reply(res,status,{ok:false,detail:err instanceof HTTPError?err.detail:"INTERNAL_ERROR"});
  }
 };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=int(process.env.PORT,1,65535,8080);
 const server=http.createServer(createApp());
 server.requestTimeout=20000;server.headersTimeout=12000;
 server.listen(port,"0.0.0.0",()=>console.log("Opportunity OS listening on",port));
 process.on("SIGTERM",()=>server.close(()=>process.exit(0)));
}
