import {test,expect} from "@playwright/test";

test("public intake: three-step consent + genuine source receipt (fixture only)",async({page})=>{
 await page.route("**/api/system",route=>route.fulfill({json:{platform:{reachable:true,storage:"postgres"},company_os:{reachable:true}}}));
 let sent;
 await page.route("**/api/intake",async route=>{
  sent=JSON.parse(route.request().postData());
  await route.fulfill({status:201,json:{persisted:true,intake_id:"INT-FIXTURE12345",request_id:sent.request_id,accepted:false,cash_collected:null}});
 });
 await page.goto("/apply");
 await expect(page.locator("#unlockBackdrop")).toBeHidden();
 await page.locator('[name="kind"]').selectOption("partnership");
 await page.locator('[name="initiative"]').selectOption("noetfield");
 await page.locator('#intakeForm [name="role"]').selectOption("partner");
 await page.locator('[data-form-step="0"] [data-next-step]').click();
 await expect(page.locator('[data-form-step="1"]')).toBeVisible();
 await page.locator('[name="title"]').fill("A focused partner pilot");
 await page.locator('textarea[name="description"]').fill("We can introduce business buyers and work together on a practical commercial proof of value.");
 await page.locator('[name="offer"]').fill("Buyer introductions in British Columbia");
 await page.locator('[name="ask"]').fill("A workflow pilot and partner collaboration");
 await page.locator('[data-form-step="1"] [data-next-step]').click();
 await expect(page.locator('[data-form-step="2"]')).toBeVisible();
 await page.locator('[name="name"]').fill("Case Contributor");
 await page.locator('[name="email"]').fill("fixture@example.invalid");
 await page.locator('[name="organization"]').fill("Fixture Partner Ltd");
 await page.locator('[name="consent"]').check();
 await page.locator("#submitIntake").click();
 await expect(page.locator("#intakeSuccess")).toBeVisible();
 await expect(page.locator("#receiptId")).toContainText("INT-FIXTURE12345");
 expect(sent.consent).toBe(true);
 expect(sent.initiative).toBe("noetfield");
 expect(sent.request_id).toMatch(/^RID-OPP-/);
});

test("Founder: unlock → source case → persisted edit → relationship graph (mock source)",async({page})=>{
 const row={intake_id:"INT-ABCDEF123456",title:"Source-backed GTM pilot",person:"Partner X",
  organization:"Vancouver Partner",email:"partner@example.invalid",initiative:"noetfield",
  opportunity_type:"growth",stage:"NEW",owner:null,next_action:"",next_action_due:null,
  revision:0,priority_score:78,consent_contact:true,offer:"Buyer introductions",ask:"Workflow pilot",
  proposal:"Detailed submitted source opportunity",activity:[],interactions:[],invitations:[]};
 await page.route("**/api/system",route=>route.fulfill({json:{platform:{reachable:true,storage:"postgres"},company_os:{reachable:true}}}));
 let lastPatch=null;
 await page.route("**/api/operator/cases?**",route=>{
  expect(route.request().headers()["x-admin-secret"]).toBe("fixture-operator-key");
  return route.fulfill({json:{items:[row],total:1,limit:100,offset:0}});
 });
 await page.route("**/api/operator/matches",route=>route.fulfill({json:{matches:[],verified_collected_cash:null}}));
 await page.route("**/api/operator/cases/INT-ABCDEF123456/relationship",route=>route.fulfill({
  json:{nodes:[{type:"person_claim",label:"Partner X"},{type:"opportunity",id:row.intake_id,venture:"noetfield",label:row.title,stage:"NEW"}],
  timeline:[{kind:"intake.persisted",at:"2026-11-12T10:00:00Z",detail:"Canonical source record",evidence:"SOURCE_RECORD"}],
  opportunity_count:1,ventures:["noetfield"]}}));
 await page.route("**/api/operator/cases/INT-ABCDEF123456",async route=>{
  lastPatch=JSON.parse(route.request().postData());
  await route.fulfill({json:{persisted:true,state:{revision:1},external_action_executed:false}});
 });
 await page.goto("/");
 await expect(page.locator("#unlockBackdrop")).toBeVisible();
 await page.locator("#operatorKey").fill("fixture-operator-key");
 await page.locator("#unlockForm button[type=submit]").click();
 await expect(page.locator("#unlockBackdrop")).toBeHidden();
 await expect(page.locator("#statTotal")).toHaveText("1");
 await expect(page.locator("#statRevenue")).toHaveText("—");
 await page.locator('.nav-item[data-view="pipeline"]').click();
 await expect(page.locator("#casesTable")).toContainText("Source-backed GTM pilot");
 await page.locator('#casesTable tr[data-case="INT-ABCDEF123456"]').click();
 await expect(page.locator("#caseDialog")).toBeVisible();
 await page.locator('#caseUpdateForm select[name="stage"]').selectOption("QUALIFYING");
 await page.locator('#caseUpdateForm input[name="owner"]').fill("Human Operator");
 await page.locator('#caseUpdateForm input[name="next_action"]').fill("Send a reviewed response");
 await page.locator('#caseUpdateForm button[type="submit"]').click();
 await expect.poll(()=>lastPatch).not.toBeNull();
 expect(lastPatch.stage).toBe("QUALIFYING");
 expect(lastPatch.expected_revision).toBe(0);
 await page.locator("#closeDialog").click();
 await page.locator('.nav-item[data-view="relationships"]').click();
 await page.locator('[data-graph="INT-ABCDEF123456"]').click();
 await expect(page.locator("#graphVisual")).toContainText("Partner X");
 await expect(page.locator("#relationshipTimeline")).toContainText("Canonical source record");
 await page.locator("#lockButton").click();
 await expect(page.locator("#unlockBackdrop")).toBeVisible();
});


test("Founder dispatches bounded specialist via real UI and sees verified task receipt",async({page})=>{
 const row={intake_id:"INT-ABCDEF123456",title:"Actual case with internal research",
  person:"Partner X",organization:"Private Partner",email:"private@example.invalid",
  initiative:"noetfield",stage:"QUALIFYING",owner:"Founder",revision:1,
  consent_contact:true,priority_score:81,offer:"Pilot research",ask:"Distribution",
  interactions:[],activity:[],invitations:[]};
 await page.route("**/api/system",route=>route.fulfill({json:{
  platform:{reachable:true,storage:"postgres"},company_os:{reachable:true}}}));
 await page.route("**/api/operator/cases?**",route=>route.fulfill({json:{
  items:[row],total:1,limit:100,offset:0}}));
 await page.route("**/api/operator/matches",route=>route.fulfill({json:{matches:[]}}));
 let dispatched=null,backlink=null;
 await page.route("**/api/operator/cases/INT-ABCDEF123456/dispatch",async route=>{
  dispatched=JSON.parse(route.request().postData());
  await route.fulfill({json:{ok:true,system:"EXISTING_BUSINESS_OS_CORE",created:true,
   readback_verified:true,task_id:"task_real_fixture_001",
   company_status:"queued",role:dispatched.role,brand:"noetfield",external_contact:false}});
 });
 await page.route("**/api/operator/cases/INT-ABCDEF123456/activity",async route=>{
  backlink=JSON.parse(route.request().postData());
  await route.fulfill({json:{persisted:true,state:{revision:2},independently_verified:false}});
 });
 await page.goto("/");
 await page.locator("#operatorKey").fill("fixture-operator-key");
 await page.locator("#unlockForm button[type=submit]").click();
 await expect(page.locator("#unlockBackdrop")).toBeHidden();
 await page.locator('.nav-item[data-view="pipeline"]').click();
 await page.locator('#casesTable tr[data-case="INT-ABCDEF123456"]').click();
 await expect(page.locator("#dispatchForm")).toBeVisible();
 await page.locator('#dispatchForm select[name="role"]').selectOption("partnerships");
 await page.locator('#dispatchForm textarea[name="mission"]').fill(
  "Prepare a sourced internal partner qualification memo and recommend a human-reviewed action. No external send.");
 await page.locator('#dispatchForm input[name="company_token"]').fill("fixture-company-token-123456");
 await page.locator('#dispatchForm button[type="submit"]').click();
 await expect(page.locator("#dispatchResult")).toContainText("task_real_fixture_001");
 await expect(page.locator("#dispatchResult")).toContainText("NOT sent");
 expect(dispatched.role).toBe("partnerships");
 expect(dispatched.brand).toBe("noetfield");
 expect(dispatched.company_token).toBe("fixture-company-token-123456");
 expect(dispatched.request_id).toMatch(/^req_/);
 expect(backlink.action).toBe("workpacket_proposed");
 expect(backlink.body).toContain("task_real_fixture_001");
 await expect(page.locator('#dispatchForm input[name="company_token"]')).toHaveValue("");
});


test("Next Action Desk: real source priority → planned due date → reviewed unsent reply",async({page})=>{
 const row={
  intake_id:"INT-REVENUE01001",person:"Alex Rivera",organization:"Example Operations",
  email:"alex@example.invalid",initiative:"noetfield",opportunity_type:"business",
  title:"Paid workflow pilot",proposal:"Source case describing a paid B2B workflow pilot",
  stage:"NEW",owner:"",next_action:"",next_action_due:null,revision:0,
  offer:"Existing operational process",ask:"One scoped paid workflow pilot",
  consent_contact:true,priority_score:86,received_at:"2026-11-01T12:00:00.000Z",
  interactions:[],activity:[],invitations:[],
 };
 const item={
  intake_id:row.intake_id,person:row.person,organization:row.organization,
  title:row.title,initiative:"noetfield",stage:"NEW",
  priority:97,urgency:"NEEDS_TRIAGE",
  next_action:"Clarify the buyer, budget and one paid pilot outcome",
  recommended_due_date:"2026-11-13",recorded_due_date:null,
  owner:null,lane:"Customer / pilot",consent_contact:true,
  reasons:["New submission needs review","No accountable owner assigned"],
  draft:{
   subject:"Re: Paid workflow pilot",
   body:"Hi Alex,\n\nThanks for reaching out about a paid pilot. Please share your budget and target outcome.\n\nBest,\n[Your name]",
   mode:"DRAFT_NOT_SENT",external_message_sent:false
  }
 };
 let changed=null,activity=null;
 await page.route("**/api/system",r=>r.fulfill({json:{
  platform:{reachable:true,storage:"postgres"},company_os:{reachable:true}}}));
 await page.route("**/api/operator/cases?**",r=>r.fulfill({json:{
  items:[row],total:1,limit:100,offset:0}}));
 await page.route("**/api/operator/action-queue?**",r=>r.fulfill({json:{
  items:[item],source_total:1,count:1,source_case_count:1,
  action_now_count:0,needs_owner_count:row.owner?0:1,contactable_count:1}}));
 await page.route("**/api/operator/matches",r=>r.fulfill({json:{matches:[]}}));
 await page.route("**/api/share-links",r=>r.fulfill({json:{
  links:[{name:"Customer & paid pilots",url:"https://www.noetfield.com/connect/?type=business&source=linkedin"}]}}));
 await page.route("**/api/operator/cases/INT-REVENUE01001",async r=>{
  changed=JSON.parse(r.request().postData());
  row.owner=changed.owner;row.next_action=changed.next_action;
  row.next_action_due=changed.due_date;row.revision++;
  await r.fulfill({json:{persisted:true,state:{revision:row.revision}}});
 });
 await page.route("**/api/operator/cases/INT-REVENUE01001/activity",async r=>{
  activity=JSON.parse(r.request().postData());
  row.revision++;
  await r.fulfill({json:{persisted:true,state:{revision:row.revision},independently_verified:false}});
 });
 await page.goto("/");
 await page.locator("#operatorKey").fill("fixture-operator-key");
 await page.locator("#unlockForm button[type=submit]").click();
 await expect(page.locator("#unlockBackdrop")).toBeHidden();
 await expect(page.locator("#overviewActions")).toContainText("Paid workflow pilot");
 await page.locator('.nav-item[data-view="execution"]').click();
 await expect(page.locator("#actionQueueList")).toContainText("Paid workflow pilot");
 await expect(page.locator("#actionQueueList")).toContainText("No accountable owner assigned");
 await expect(page.locator("#shareLinks")).toContainText("Customer & paid pilots");
 await expect(page.locator(".share-link-card")).toHaveAttribute("data-copy-share",
  "https://www.noetfield.com/connect/?type=business&source=linkedin");
 await page.locator('[data-set-plan="INT-REVENUE01001"]').click();
 await expect.poll(()=>changed).not.toBeNull();
 expect(changed.owner).toBe("Founder");
 expect(changed.stage).toBe("NEW");
 expect(changed.next_action).toMatch(/buyer/);
 expect(changed.due_date).toBe("2026-11-13");
 await page.locator("#actionQueueList [data-case='INT-REVENUE01001']").click();
 await expect(page.locator("#caseDialog")).toBeVisible();
 await expect(page.locator("#replyPreview")).toContainText("paid pilot");
 await expect(page.locator("#replyPreview")).toContainText("DRAFT ONLY");
 await page.locator("#logDraft").click();
 await expect.poll(()=>activity).not.toBeNull();
 expect(activity.action).toBe("draft_prepared");
 expect(activity.body).toContain("NOT SENT");
 expect(activity.expected_revision).toBe(1);
});
