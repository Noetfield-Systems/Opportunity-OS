import assert from "node:assert/strict";
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
r=await check("/app.js");assert.equal(r.status,200);assert.match(r.text,/\\/api\\/operator\\/cases/);
checks.push("Live browser application bundle reachable");
r=await check("/styles.css");assert.equal(r.status,200);assert.match(r.text,/\\.hero-orbit/);
checks.push("Live premium responsive styling reachable");
r=await check("/api/operator/cases");assert.equal(r.status,401,"Unauthenticated case API must fail closed");
checks.push("Unauthenticated Founder case endpoint rejected");
r=await check("/api/system");assert.equal(r.status,200);assert.equal(r.data.source,"LIVE_READ_ONLY_CHECK");
assert.equal(r.data.platform.reachable,true,"Canonical Platform API unreachable from Railway");
assert.equal(r.data.platform.storage,"postgres","Canonical intake is not confirmed PostgreSQL");
checks.push("Live app to actual canonical Platform PostgreSQL health");
if(!r.data.company_os.reachable)throw Error("Existing Company OS Core health not reachable; not an E2E execution proof");
checks.push("Live app to existing Business OS Core health");
process.stdout.write(JSON.stringify({ok:true,source:"REAL_PRODUCTION_HTTP",base,
  checks,source_database_writes:0,bookings:0,auth_bypass_attempts:0,
  actual_company_dispatch_verified:false,confirmed_cash_collected:null},null,2)+"\n");
