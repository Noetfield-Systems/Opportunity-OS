import test from "node:test";
import assert from "node:assert/strict";
import {makeActionQueue,buildReplyDraft,sourceShareLinks} from "../action_engine.mjs";

const clock=new Date("2026-11-12T18:00:00.000Z");
const base={
 intake_id:"INT-REVENUE01001",received_at:"2026-11-01T18:00:00.000Z",
 person:"Alex Rivera",organization:"Example Operations",
 email:"alex@example.invalid",initiative:"noetfield",
 opportunity_type:"business",title:"Paid pilot for repair dispatch",
 offer:"Existing operations access",ask:"AI-assisted dispatch pilot",
 stage:"NEW",consent_contact:true,priority_score:78,
 owner:"",next_action:"",next_action_due:"2026-11-10",
 interactions:[],activity:[],invitations:[],
};
test("Action Desk uses real due dates, missing owners, stages and source priority",()=>{
 const rows=[base,
  {...base,intake_id:"INT-PARTNERS0001",stage:"ENGAGED",
   opportunity_type:"partnership",person:"Blake",email:"blake@example.invalid",
   next_action_due:"2026-12-01",owner:"Founder",next_action:"Ask about pilot"}];
 const q=makeActionQueue(rows,{now:clock});
 assert.equal(q.schema,"noetfield.opportunity-os.action-queue.v1");
 assert.equal(q.source,"CANONICAL_PLATFORM_INTAKE");
 assert.equal(q.count,2);assert.equal(q.action_now_count,1);
 assert.equal(q.needs_owner_count,1);assert.equal(q.contactable_count,2);
 assert.equal(q.items[0].intake_id,base.intake_id);
 assert.equal(q.items[0].urgency,"ACT_NOW");
 assert.ok(q.items[0].reasons.some(r=>r.includes("overdue")));
 assert.ok(q.items[0].reasons.some(r=>r.includes("owner")));
 assert.equal(q.items[0].recommended_due_date,"2026-11-13");
 assert.equal(q.items[0].next_action,"Clarify the business problem, budget and one paid pilot outcome");
 assert.equal(q.items[0].money_collected,null);
 assert.equal(q.items[0].external_message_sent,false);
 assert.equal(q.received_messages_sent,0);assert.equal(q.verified_revenue,null);
});
test("Terminated cases, invalid IDs and fabricated contact consent never create actions or drafts",()=>{
 const q=makeActionQueue([
  {...base,intake_id:"INT-CLOSED0001",stage:"WON"},
  {...base,intake_id:"INT-CLOSED0002",stage:"LOST"},
  {...base,intake_id:"INT-CLOSED0003",stage:"ARCHIVED"},
  {...base,intake_id:"INVALID-ID"},
  {...base,intake_id:"INT-NOCONSENT001",consent_contact:false}
 ],{now:clock});
 assert.equal(q.items.length,1);
 assert.equal(q.items[0].intake_id,"INT-NOCONSENT001");
 assert.equal(q.items[0].draft,null);
 assert.equal(q.contactable_count,0);
 assert.ok(q.items[0].reasons.some(r=>r.includes("consent")));
});
test("Drafts are distinct per lane, fact-grounded, editable and never sent",()=>{
 const buyer=buildReplyDraft(base);
 assert.match(buyer.subject,/Paid pilot for repair dispatch/);
 assert.match(buyer.body,/Alex/);
 assert.match(buyer.body,/Existing operations access/);
 assert.match(buyer.body,/AI-assisted dispatch pilot/);
 assert.match(buyer.body,/paid pilot/);
 assert.match(buyer.body,/\[Your name\]/);
 assert.equal(buyer.mode,"DRAFT_NOT_SENT");
 assert.equal(buyer.review_required,true);
 assert.equal(buyer.external_message_sent,false);
 assert.equal(buyer.meeting_booked,false);
 const investor=buildReplyDraft({...base,opportunity_type:"capital",title:"Seed round"});
 assert.match(investor.body,/investment focus/);
 assert.doesNotMatch(investor.body,/small paid pilot/);
 const collaborator=buildReplyDraft({...base,opportunity_type:"people"});
 assert.match(collaborator.body,/collaboration task/);
 assert.equal(buildReplyDraft({...base,consent_contact:false}),null);
 assert.equal(buildReplyDraft({...base,email:"bad"}),null);
});
test("Only canonical source-owned invitation links are created, without user PII",()=>{
 const links=sourceShareLinks();
 assert.equal(links.length,6);
 for(const x of links){
  const u=new URL(x.url);
  assert.equal(u.origin,"https://www.noetfield.com");
  assert.equal(u.pathname,"/connect/");
  assert.equal(u.searchParams.get("source"),"linkedin");
  assert.equal(u.searchParams.get("type"),x.kind);
  assert.ok(!u.search.includes("email"));
  assert.equal(x.live_acceptance_not_proven_by_link,true);
 }
});
