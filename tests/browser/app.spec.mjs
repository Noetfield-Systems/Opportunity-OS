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
 await page.locator('[name="role"]').selectOption("partner");
 await page.locator('[data-form-step="0"] [data-next-step]').click();
 await expect(page.locator('[data-form-step="1"]')).toBeVisible();
 await page.locator('[name="title"]').fill("A focused partner pilot");
 await page.locator('[name="description"]').fill("We can introduce business buyers and work together on a practical commercial proof of value.");
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
