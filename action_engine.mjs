/**
 * Opportunity OS — explainable, source-backed conversion playbooks.
 * Pure read-only projections. No sending, no booking, no CRM duplication.
 */
const TERMINAL=new Set(["WON","LOST","ARCHIVED"]);
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LANES={
 business:{
   name:"Customer / pilot",
   next:"Clarify the business problem, budget and one paid pilot outcome",
   question:"What outcome would make a small paid pilot worthwhile, and who would own the decision?",
   ask:"I suggest a short conversation to define one measurable pilot deliverable, scope, and budget."
 },
 growth:{
   name:"Distribution",
   next:"Validate the audience, channel economics and a small referral experiment",
   question:"Which customer group can you reach, and what would a successful first referral look like?",
   ask:"We could agree on one small distribution experiment and measurable mutual value before discussing scale."
 },
 capital:{
   name:"Capital / introductions",
   next:"Confirm investment mandate, stage, cheque range and a relevant introduction",
   question:"Could you share your investment focus, stage and typical ticket size, or the type of introduction you have in mind?",
   ask:"A short fit check would help us decide whether a specific introduction makes sense."
 },
 partnership:{
   name:"Strategic partnership",
   next:"Define two-sided value, boundaries and a concrete next collaboration step",
   question:"Which part of a collaboration would create the most immediate value for your side?",
   ask:"I would propose a small, time-boxed collaboration with one clear outcome for each side."
 },
 people:{
   name:"People / expertise",
   next:"Clarify capabilities, availability and a bounded collaboration trial",
   question:"What specific capabilities and weekly availability would you bring to a first project?",
   ask:"We can explore one bounded collaboration task with clear expectations before making any commitments."
 },
 events:{
   name:"Programs / events",
   next:"Verify the organizer, eligibility, deadline, fees and actual value",
   question:"Could you confirm the relevant eligibility, deadline, selection criteria and any fees?",
   ask:"Once those details are clear, we can decide whether to apply, attend or collaborate."
 },
 other:{
   name:"Open opportunity",
   next:"Clarify the proposed exchange, accountable parties and next action",
   question:"What is the specific value you can offer, and what would you like in return?",
   ask:"Let's identify one clear next step and see if there is a mutual fit."
 }
};
function clean(v,n=220){return typeof v==="string"?v.replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,n):""}
function yyyy(instant){return instant.toISOString().slice(0,10)}
function realDate(s){const v=clean(s,32);return /^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+"T00:00:00Z"))?v:""}
function firstName(name){const s=clean(name,90).split(/\s+/)[0]||"";return s||"there"}
function daysSince(raw,now){
 const parsed=Date.parse(String(raw||""));
 return Number.isFinite(parsed)?Math.max(0,Math.floor((now.getTime()-parsed)/86400000)):null;
}
function sourceInteractions(caseRow){
 const list=Array.isArray(caseRow.interactions)?caseRow.interactions:[];
 return list.filter(v=>v&&typeof v==="object"&&v.kind==="interaction_observed");
}
export function buildReplyDraft(row){
 if(!row||row.consent_contact!==true||!EMAIL.test(clean(row.email,254)))return null;
 const kind=clean(row.opportunity_type,35).toLowerCase();
 const play=LANES[kind]||LANES.other;
 const name=firstName(row.person);
 const title=clean(row.title,130)||"your opportunity";
 const offer=clean(row.offer,145),ask=clean(row.ask,145);
 const context=[];
 if(offer)context.push("what you could contribute ("+offer+")");
 if(ask)context.push("what you're looking for ("+ask+")");
 const bridge=context.length?" I noted "+context.join(" and ")+".":"";
 const subject="Re: "+title;
 const body=[
   "Hi "+name+",",
   "",
   "Thank you for sharing your proposal about "+title+"."+bridge,
   "",
   play.ask,
   "",
   play.question,
   "",
   "Would you be open to sharing a little more detail by email, or a brief introductory call?",
   "",
   "Best,",
   "Noetfield Team"
 ].join("\n");
 return {subject,body,mode:"DRAFT_NOT_SENT",source_intake_id:clean(row.intake_id,100),
  contact_permission:"RECORDED_ON_ORIGINAL_SOURCE_CASE",
  review_required:true,external_message_sent:false,meeting_booked:false};
}
export function makeActionQueue(records,{now=new Date(),limit=100}={}){
 if(!(now instanceof Date)||Number.isNaN(now.getTime()))throw new TypeError("valid now date required");
 const rows=Array.isArray(records)?records:[];
 const today=yyyy(now);
 const result=[];
 for(const r of rows){
  if(!r||typeof r!=="object"||!/^INT-[A-Za-z0-9-]{6,80}$/.test(String(r.intake_id||"")))continue;
  const stage=clean(r.stage,35).toUpperCase()||"NEW";
  if(TERMINAL.has(stage))continue;
  const due=realDate(r.next_action_due||r.due_date);
  const days=daysSince(r.received_at,now);
  const overdue=due&&due<today;
  const dueToday=due===today;
  const dueSoon=due>today&&
    (Date.parse(due+"T00:00:00Z")-Date.parse(today+"T00:00:00Z"))/86400000<=3;
  const hasOwner=Boolean(clean(r.owner,120));
  const hasNextAction=Boolean(clean(r.next_action,500));
  const touch=sourceInteractions(r);
  const isCommercial=["business","growth","partnership"].includes(clean(r.opportunity_type,35));
  const reasons=[];
  let score=Math.min(30,Math.round(Number(r.priority_score)||0)/4);
  if(overdue){score+=46;reasons.push("Follow-up is overdue");}
  else if(dueToday){score+=34;reasons.push("Follow-up is due today");}
  else if(dueSoon){score+=17;reasons.push("Follow-up due within three days");}
  if(stage==="NEW"){score+=23;reasons.push("New source submission needs review");}
  if(!hasOwner){score+=16;reasons.push("No accountable owner assigned");}
  if(!hasNextAction){score+=14;reasons.push("No next action recorded");}
  if(days!==null&&days>=7&&!touch.length){score+=10;reasons.push("No recorded interaction on an older case");}
  if(isCommercial){score+=9;reasons.push("Commercial or distribution opportunity");}
  if(!r.consent_contact){reasons.push("Contact consent is not recorded; internal review only");}
  const kind=clean(r.opportunity_type,35).toLowerCase();
  const play=LANES[kind]||LANES.other;
  const dueSuggested=yyyy(new Date(now.getTime()+(stage==="NEW"||overdue?1:3)*86400000));
  result.push({
   intake_id:r.intake_id,stage,initiative:clean(r.initiative,80)||"portfolio",
   priority:Math.min(100,Math.max(0,score)),
   urgency:overdue||dueToday?"ACT_NOW":stage==="NEW"||!hasOwner?"NEEDS_TRIAGE":"NEXT_STEP",
   reasons,source_priority:r.priority_score??null,
   owner:clean(r.owner,120)||null,person:clean(r.person,120),
   organization:clean(r.organization,200),title:clean(r.title,160)||"Untitled opportunity",
   email:clean(r.email,254),consent_contact:r.consent_contact===true,
   source_received_at:r.received_at||null,recorded_due_date:due||null,
   next_action:clean(r.next_action,500)||play.next,
   recommended_due_date:dueSuggested,
   suggested_owner:r.suggested_owner_role||"Founder",
   lane:play.name,days_since_intake:days,
   operator_observed_interactions:touch.length,
   draft:buildReplyDraft(r),
   external_message_sent:false,meeting_booked:false,confirmed_conversion:false,
   money_collected:null,
   evidence_level:"CANONICAL_SOURCE_RECORD_PLUS_DETERMINISTIC_PRIORITIZATION"
  });
 }
 result.sort((a,b)=>b.priority-a.priority||
  String(a.recorded_due_date||"9999").localeCompare(String(b.recorded_due_date||"9999"))||
  a.intake_id.localeCompare(b.intake_id));
 const max=Math.max(1,Math.min(100,Number(limit)||100));
 const items=result.slice(0,max);
 return {schema:"noetfield.opportunity-os.action-queue.v1",
  computed_at:now.toISOString(),source:"CANONICAL_PLATFORM_INTAKE",
  limited_to_supplied_page:true,source_case_count:rows.length,
  count:items.length,open_count:result.length,
  action_now_count:result.filter(x=>x.urgency==="ACT_NOW").length,
  needs_owner_count:result.filter(x=>!x.owner).length,
  contactable_count:result.filter(x=>x.draft!==null).length,
  received_messages_sent:0,verified_revenue:null,
  items};
}
export function sourceShareLinks(){
 const url="https://www.noetfield.com/connect/";
 return [
  {name:"Customer & paid pilots",kind:"business",source:"linkedin"},
  {name:"Partnerships & co-builders",kind:"partnership",source:"linkedin"},
  {name:"Investors & capital intros",kind:"capital",source:"linkedin"},
  {name:"Distribution & referral partners",kind:"growth",source:"linkedin"},
  {name:"Talent & collaborators",kind:"people",source:"linkedin"},
  {name:"Programs & speaking",kind:"events",source:"linkedin"}
 ].map(x=>({...x,url:url+"?type="+x.kind+"&source="+x.source,
  direction:"PUBLIC_NOETFIELD_CANONICAL_CONNECT",live_acceptance_not_proven_by_link:true}));
}
