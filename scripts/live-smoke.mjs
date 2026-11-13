import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
const base=(process.env.OPPORTUNITY_OS_URL||"https://opportunity-web-production-b335f326.up.railway.app").replace(/\/$/,"");
async function check(path,opts={}){
 const response=await fetch(base+path,{redirect:"error",signal:AbortSignal.timeout(18000),
  headers:{"Accept":path==="/"||path==="/apply"?"text/html":"application/json"},...opts});
 const text=await response.text();
 let data={};try{data=JSON.parse(text)}catch{}
 return {status:response.status,headers:response.headers,text,data};
}
const checks=[];
let r=await check("/health");assert.equal(r.status,200,"Public process health");assert.equal(r.data.ok,true);
assert.equal(r.data.service,"opportunity-os");assert.equal(r.data.persistence,"UPSTREAM_ONLY");
checks.push("Railway public /health HTTP 200");
r=await check("/");assert.equal(r.status,200);assert.match(r.text,/data-screen="pipeline"/);assert.match(r.text,/data-screen="matching"/);
assert.match(r.headers.get("content-security-policy")||"",/frame-ancestors 'none'/);
checks.push("Full premium app HTML, pipeline, matching and CSP reachable");
r=await check("/apply");assert.equal(r.status,200);assert.match(r.text,/id="intakeForm"/);
checks.push("Public intake page reachable");
r=await check("/app.js");assert.equal(r.status,200);assert.ok(r.text.includes("/api/operator/cases"));
assert.ok(r.text.includes("renderActionDesk"),"Next Action Desk client bundle not deployed");
checks.push("Live v2 Action Desk browser application bundle reachable");
r=await check("/styles.css");assert.equal(r.status,200);assert.ok(r.text.includes(".hero-orbit"));
assert.ok(r.text.includes(".action-queue-list"),"Action Desk CSS not deployed");
checks.push("Live Action Desk responsive styling reachable");
r=await check("/api/operator/cases");assert.equal(r.status,401,"Unauthenticated case API must fail closed");
checks.push("Unauthenticated Founder case endpoint rejected");

r=await check("/api/operator/action-queue");
assert.equal(r.status,401,"Next Action Desk must never expose contact PII without Founder authentication");
checks.push("Next Action Desk protected from unauthenticated access");
r=await check("/api/share-links");
assert.equal(r.status,200,"Canonical invite share kit public API");
assert.equal(r.data.links.length,6);
assert.ok(r.data.links.every(x=>x.url.startsWith("https://www.noetfield.com/connect/?type=")));
assert.equal(r.data.no_external_send,true);
checks.push("Six production canonical Connect acquisition links available; no auto-outreach");

r=await check("/api/system");assert.equal(r.status,200);assert.equal(r.data.source,"LIVE_READ_ONLY_CHECK");
assert.equal(r.data.platform.reachable,true,"Canonical Platform API unreachable from Railway");
assert.equal(r.data.platform.storage,"postgres","Canonical intake is not confirmed PostgreSQL");
checks.push("Live app to actual canonical Platform PostgreSQL health");
if(!r.data.company_os.reachable)throw Error("Existing Company OS Core health not reachable; not an E2E execution proof");
checks.push("Live app to existing Business OS Core health");

/* Real, test-only round trip: Platform labels this known e2e mailbox as test,
   so it is excluded from Connect leads and real operations notifications. */
const probeId="RID-OPP-"+randomBytes(10).toString("hex").toUpperCase();
const probe={
 request_id:probeId,
 name:"Opportunity OS E2E Probe",
 email:"e2e@noetfield.com",
 organization:"Noetfield Automated E2E Fixture",
 kind:"other",initiative:"noetfield",role:"other",source:"website",
 title:"TEST-ONLY Source Persistence Verification",
 description:"Automated test-only opportunity to verify canonical PostgreSQL storage, idempotency and readback. Not a customer or real sales opportunity.",
 offer:"No business offer; synthetic verification only",
 ask:"No business request; synthetic verification only",
 consent:true,reference_url:"",deadline:"",terms:""
};
const postOptions={method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(probe)};
const first=await check("/api/intake",postOptions);
assert.equal(first.status,201,"Live public intake POST must persist to Platform");
assert.equal(first.data.persisted,true);
assert.match(String(first.data.intake_id||""),/^INT-[A-Za-z0-9-]{6,80}$/);
assert.equal(first.data.accepted,false);
assert.equal(first.data.cash_collected,null);
checks.push("Live test-only POST via Opportunity OS to canonical Platform PostgreSQL");
const second=await check("/api/intake",postOptions);
assert.equal(second.status,201);
assert.equal(second.data.intake_id,first.data.intake_id);
assert.equal(second.data.deduped,true);
checks.push("Live duplicate submit reuses canonical intake_id");
const readbackResponse=await fetch("https://platform.noetfield.com/api/intake/status?request_id="+encodeURIComponent(probeId),
 {signal:AbortSignal.timeout(18000),headers:{"Accept":"application/json"},redirect:"error"});
assert.equal(readbackResponse.status,200,"Canonical Platform readback must be public");
const readback=await readbackResponse.json();
assert.equal(readback.intake_id,first.data.intake_id);
checks.push("Platform source readback matches Opportunity OS receipt");

process.stdout.write(JSON.stringify({ok:true,source:"REAL_PRODUCTION_HTTP",base,
  checks,test_only_canonical_intakes_created:1,real_customer_leads_created:0,bookings:0,auth_bypass_attempts:0,
  actual_company_dispatch_verified:false,confirmed_cash_collected:null},null,2)+"\n");
