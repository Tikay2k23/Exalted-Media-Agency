import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { FULFILLMENT_PIPELINE_ID, SALES_PIPELINE_ID } from "@/lib/workspace-defaults";

/**
 * Clears the operational data and rebuilds it as a plausible fortnight.
 *
 * What survives, deliberately: users, pipelines and their stages, SOPs, stage
 * requirements, workspace settings, permission overrides, and the migration
 * log. Those are the shape of the system rather than things that happened in
 * it, and rebuilding them would mean re-running the workspace seed.
 *
 * What goes: everything that represents an event or a record of work. Leads,
 * clients, tasks, entries, reports, notifications, the activity trail.
 *
 * The data is deliberately uneven. A dataset where every task is on time and
 * every entry is filed proves nothing - the alerts, the empty states and the
 * overdue styling all go untested. So some work is late, some is blocked, some
 * people have not filed today, one weekly report has been sent back, and two
 * deals were lost.
 */

/** Wall-clock now, captured once so every relative date agrees. */
const NOW = new Date();

function at(daysFromNow: number, hour = 10, minute = 0) {
  const date = new Date(NOW);
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function mondayOf(date: Date) {
  const day = startOfDay(date);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

/**
 * Removes operational rows, children before parents.
 *
 * Ordered by hand rather than relying on cascades: several relations are
 * SetNull, so a cascade would leave orphaned rows pointing at nothing instead
 * of removing them.
 */
async function clearOperationalData() {
  const cleared: Record<string, number> = {};
  const wipe = async (name: string, run: () => Promise<{ count: number }>) => {
    cleared[name] = (await run()).count;
  };

  // Quality, launch and review records hang off projects and clients.
  await wipe("qaTest", () => prisma.qaTest.deleteMany({}));
  await wipe("defect", () => prisma.defect.deleteMany({}));
  await wipe("qaPlan", () => prisma.qaPlan.deleteMany({}));
  await wipe("revisionItem", () => prisma.revisionItem.deleteMany({}));
  await wipe("reviewCycle", () => prisma.reviewCycle.deleteMany({}));
  await wipe("approval", () => prisma.approval.deleteMany({}));
  await wipe("launchChecklistItem", () => prisma.launchChecklistItem.deleteMany({}));
  await wipe("monitoringCheck", () => prisma.monitoringCheck.deleteMany({}));
  await wipe("incident", () => prisma.incident.deleteMany({}));
  await wipe("launch", () => prisma.launch.deleteMany({}));

  // Work items and everything written against them.
  await wipe("employeeTaskEodEntry", () => prisma.employeeTaskEodEntry.deleteMany({}));
  await wipe("taskComment", () => prisma.taskComment.deleteMany({}));
  await wipe("taskDependency", () => prisma.taskDependency.deleteMany({}));
  await wipe("employeeTask", () => prisma.employeeTask.deleteMany({}));
  await wipe("weeklyReport", () => prisma.weeklyReport.deleteMany({}));

  // Sales.
  await wipe("leadNote", () => prisma.leadNote.deleteMany({}));
  await wipe("leadCallLog", () => prisma.leadCallLog.deleteMany({}));
  await wipe("referral", () => prisma.referral.deleteMany({}));
  await wipe("lead", () => prisma.lead.deleteMany({}));

  // Commercial and success records attached to clients.
  await wipe("payment", () => prisma.payment.deleteMany({}));
  await wipe("invoice", () => prisma.invoice.deleteMany({}));
  await wipe("contract", () => prisma.contract.deleteMany({}));
  await wipe("renewal", () => prisma.renewal.deleteMany({}));
  await wipe("expansionOpportunity", () => prisma.expansionOpportunity.deleteMany({}));
  await wipe("testimonial", () => prisma.testimonial.deleteMany({}));
  await wipe("optimization", () => prisma.optimization.deleteMany({}));
  await wipe("clientReport", () => prisma.clientReport.deleteMany({}));
  await wipe("recoveryPlan", () => prisma.recoveryPlan.deleteMany({}));
  await wipe("complaint", () => prisma.complaint.deleteMany({}));
  await wipe("clientHealthAssessment", () => prisma.clientHealthAssessment.deleteMany({}));
  await wipe("offboardingRecord", () => prisma.offboardingRecord.deleteMany({}));
  await wipe("assetRecord", () => prisma.assetRecord.deleteMany({}));
  await wipe("accessRecord", () => prisma.accessRecord.deleteMany({}));
  await wipe("strategyBrief", () => prisma.strategyBrief.deleteMany({}));
  await wipe("onboardingRecord", () => prisma.onboardingRecord.deleteMany({}));
  await wipe("intakeForm", () => prisma.intakeForm.deleteMany({}));
  await wipe("clientContact", () => prisma.clientContact.deleteMany({}));

  // Delivery structure hanging off clients.
  await wipe("milestone", () => prisma.milestone.deleteMany({}));
  await wipe("project", () => prisma.project.deleteMany({}));
  await wipe("clientWorkstream", () => prisma.clientWorkstream.deleteMany({}));
  await wipe("clientHandoff", () => prisma.clientHandoff.deleteMany({}));
  await wipe("clientStageHistory", () => prisma.clientStageHistory.deleteMany({}));
  await wipe("socialMediaTask", () => prisma.socialMediaTask.deleteMany({}));
  await wipe("client", () => prisma.client.deleteMany({}));

  // Governance records that describe events rather than the rulebook. The SOPs
  // themselves stay.
  await wipe("auditFinding", () => prisma.auditFinding.deleteMany({}));
  await wipe("audit", () => prisma.audit.deleteMany({}));
  await wipe("correctiveAction", () => prisma.correctiveAction.deleteMany({}));
  await wipe("improvementRequest", () => prisma.improvementRequest.deleteMany({}));
  await wipe("trainingRecord", () => prisma.trainingRecord.deleteMany({}));
  await wipe("trainingSession", () => prisma.trainingSession.deleteMany({}));

  // The trail.
  await wipe("notification", () => prisma.notification.deleteMany({}));
  await wipe("activityLog", () => prisma.activityLog.deleteMany({}));
  await wipe("loginAttempt", () => prisma.loginAttempt.deleteMany({}));
  await wipe("savedView", () => prisma.savedView.deleteMany({}));

  return cleared;
}

interface Team {
  owner: string;
  aileen: string;
  pm: string;
  angelo: string;
  sales: string;
  automation: string;
  creative: string;
  ads: string;
}

async function loadTeam(): Promise<Team> {
  const users = await prisma.user.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, email: true },
  });

  const byEmail = new Map(users.map((user) => [user.email, user.id]));
  const need = (email: string) => {
    const id = byEmail.get(email);
    if (!id) throw new Error(`Expected an active user ${email}. Run the team seed first.`);
    return id;
  };

  return {
    owner: need("owner@theexaltedmedia.com"),
    aileen: need("aileen@theexaltedmedia.com"),
    pm: need("pm@theexaltedmedia.com"),
    angelo: need("angelo@theexaltedmedia.com"),
    sales: need("sales@theexaltedmedia.com"),
    automation: need("automation@theexaltedmedia.com"),
    creative: need("creative@theexaltedmedia.com"),
    ads: need("ads@theexaltedmedia.com"),
  };
}

/* ------------------------------------------------------------------ clients */

const CLIENTS = [
  {
    company: "Best Life Chiropractic",
    contact: "Dr. Rachel Morgan",
    email: "rachel@bestlifechiro.com",
    phone: "(555) 214-7788",
    service: "FULL_SERVICE_RETAINER" as const,
    stage: "in_production",
    health: "GREEN" as const,
    monthly: 4800,
    next: "Approve the pediatric landing page copy",
  },
  {
    company: "Metro South Chamber",
    contact: "David Okafor",
    email: "david@metrosouthchamber.org",
    phone: "(555) 660-1123",
    service: "CRM_AUTOMATION" as const,
    stage: "in_production",
    health: "YELLOW" as const,
    monthly: 3200,
    next: "Chase GoHighLevel agency access",
  },
  {
    company: "Sunrise Dental Group",
    contact: "Kevin Lee",
    email: "kevin@sunrisedental.com",
    phone: "(555) 903-4410",
    service: "PAID_ADVERTISING" as const,
    stage: "client_review",
    health: "GREEN" as const,
    monthly: 5600,
    next: "Walk through the October ad results",
  },
  {
    company: "Elite Fitness Collective",
    contact: "Amanda Clark",
    email: "amanda@elitefitness.co",
    phone: "(555) 771-2094",
    service: "FUNNEL_BUILD" as const,
    stage: "internal_quality_assurance",
    health: "GREEN" as const,
    monthly: 3900,
    next: "Finish the QA pass on the challenge funnel",
  },
  {
    company: "Harbor Point Legal",
    contact: "Sandra Whitfield",
    email: "s.whitfield@harborpointlegal.com",
    phone: "(555) 448-3367",
    service: "SEO" as const,
    stage: "ongoing_management",
    health: "GREEN" as const,
    monthly: 2900,
    next: "Send the quarterly ranking summary",
  },
  {
    company: "Cedar Ridge Landscaping",
    contact: "Tom Brennan",
    email: "tom@cedarridgeland.com",
    phone: "(555) 512-8890",
    service: "WEBSITE_SUPPORT" as const,
    stage: "waiting_for_client_information",
    health: "RED" as const,
    monthly: 1800,
    next: "Client has not returned the onboarding form",
  },
  {
    company: "Brightline Accounting",
    contact: "Priya Raghavan",
    email: "priya@brightlineacct.com",
    phone: "(555) 226-9014",
    service: "EMAIL_MARKETING" as const,
    stage: "strategy_and_planning",
    health: "GREEN" as const,
    monthly: 2400,
    next: "Present the nurture sequence plan",
  },
  {
    company: "Northgate Veterinary",
    contact: "Dr. Alan Reyes",
    email: "alan@northgatevet.com",
    phone: "(555) 337-6621",
    service: "SOCIAL_MEDIA_MANAGEMENT" as const,
    stage: "live_active",
    health: "YELLOW" as const,
    monthly: 2100,
    next: "Rebuild the content calendar for December",
  },
];

async function seedClients(team: Team) {
  const stages = await prisma.pipelineStage.findMany({
    where: { pipelineId: FULFILLMENT_PIPELINE_ID },
    select: { id: true, stageKey: true },
  });

  const byKey = new Map(stages.map((stage) => [stage.stageKey, stage.id]));
  const owners = [team.pm, team.angelo];
  const created: { id: string; company: string }[] = [];

  for (const [index, row] of CLIENTS.entries()) {
    const stageId = byKey.get(row.stage);
    if (!stageId) throw new Error(`No fulfillment stage "${row.stage}".`);

    const client = await prisma.client.create({
      data: {
        clientName: row.contact,
        companyName: row.company,
        contactEmail: row.email,
        contactPhone: row.phone,
        serviceType: row.service,
        currentStageId: stageId,
        // Spread the entry dates so time-in-stage varies rather than every
        // account having landed on the same afternoon.
        stageEnteredAt: at(-(4 + index * 3)),
        dateAdded: at(-(30 + index * 9)),
        assignedUserId: owners[index % owners.length],
        healthStatus: row.health,
        monthlyValue: row.monthly,
        nextAction: row.next,
        nextActionDueAt: at(index % 4 === 0 ? -1 : index % 3),
        currentBlocker: row.health === "RED" ? "Waiting on the onboarding form" : null,
      },
      select: { id: true, companyName: true },
    });

    created.push({ id: client.id, company: client.companyName });
  }

  return created;
}

/* -------------------------------------------------------------------- leads */

const LEADS = [
  { company: "Summit Peak Roofing", contact: "Daniel Brooks", stage: "new_website_lead", source: "WEBSITE_FORM", value: 4200, contacted: null, action: null, follow: null },
  { company: "Willow Creek Dental", contact: "Melissa Carter", stage: "new_website_lead", source: "PAID_ADS", value: 3800, contacted: null, action: null, follow: null },
  { company: "Ironclad Security", contact: "Victor Nguyen", stage: "application_submitted", source: "PAID_ADS", value: 6500, contacted: -1, action: "Review the application and call", follow: 0 },
  { company: "Precision Auto Works", contact: "Marcus Lee", stage: "attempting_contact", source: "WEBSITE_FORM", value: 2900, contacted: -3, action: "Third call attempt", follow: -2 },
  { company: "Golden Crust Bakery", contact: "Sofia Marino", stage: "attempting_contact", source: "SOCIAL_MEDIA", value: 1900, contacted: -5, action: "Try the mobile number", follow: -4 },
  { company: "Vista Ridge Realty", contact: "Angela Foster", stage: "contacted", source: "REFERRAL", value: 7400, contacted: -1, action: "Send the case study pack", follow: 1 },
  { company: "Blue Harbor Marine", contact: "Peter Vance", stage: "contacted", source: "OUTBOUND", value: 5200, contacted: -2, action: "Confirm decision maker", follow: 0 },
  { company: "Lakeside Physio", contact: "Hannah Wells", stage: "strategy_call_booked", source: "WEBSITE_FORM", value: 3400, contacted: -1, action: "Send the call reminder", follow: 0, call: 1, callStatus: "BOOKED" },
  { company: "Copperfield Interiors", contact: "Nadia Rahman", stage: "strategy_call_booked", source: "REFERRAL", value: 4600, contacted: -2, action: "Prepare the audit deck", follow: 2, call: 2, callStatus: "BOOKED" },
  { company: "Trailhead Outfitters", contact: "Gregory Sims", stage: "strategy_call_showed", source: "ORGANIC_SEARCH", value: 5100, contacted: 0, action: "Write up the proposal", follow: 1, call: -1, callStatus: "SHOWED" },
  { company: "Anchor Point Insurance", contact: "Denise Park", stage: "qualified", source: "REFERRAL", value: 8200, contacted: -1, action: "Send the retainer proposal", follow: 0, call: -3, callStatus: "SHOWED" },
  { company: "Riverbend Orthodontics", contact: "Dr. Omar Haddad", stage: "qualified", source: "PAID_ADS", value: 6900, contacted: -2, action: "Confirm the budget range", follow: 1, call: -4, callStatus: "SHOWED" },
  { company: "Stonebridge Wealth", contact: "Laura Kim", stage: "proposal_sent", source: "REFERRAL", value: 9500, contacted: -7, action: "Follow up on the proposal", follow: -2, call: -10, callStatus: "SHOWED", proposal: -7 },
  { company: "Fairview Pet Clinic", contact: "Chris Donnelly", stage: "proposal_sent", source: "WEBSITE_FORM", value: 4100, contacted: -2, action: "Answer the pricing question", follow: 1, call: -6, callStatus: "SHOWED", proposal: -2 },
  { company: "Kestrel Software", contact: "Ivan Petrov", stage: "negotiation", source: "OUTBOUND", value: 12000, contacted: -1, action: "Agree the twelve month term", follow: 0, call: -12, callStatus: "SHOWED", proposal: -9 },
  { company: "Maple Grove Childcare", contact: "Beatrice Hall", stage: "long_term_nurture", source: "WEBSITE_FORM", value: 2200, contacted: -40, action: "Check in about the new budget year", follow: null, nurture: 45 },
  { company: "Old Town Brewing", contact: "Sam Whitaker", stage: "long_term_nurture", source: "EVENT", value: 3100, contacted: -28, action: "Revisit after the refit", follow: null, nurture: 30 },
  { company: "Pinnacle Roofing Co", contact: "Ray Alvarez", stage: "won", source: "REFERRAL", value: 5400, contacted: -9, won: -3, proposal: -14 },
  { company: "Clearwater Pools", contact: "Janet Cho", stage: "won", source: "PAID_ADS", value: 4700, contacted: -12, won: -8, proposal: -20 },
  { company: "Redstone Construction", contact: "Bill Traynor", stage: "lost", source: "OUTBOUND", value: 8800, contacted: -20, lost: -6, lostReason: "WENT_WITH_COMPETITOR", proposal: -16 },
  { company: "Sunny Lane Florist", contact: "Grace Ellington", stage: "lost", source: "SOCIAL_MEDIA", value: 1400, contacted: -25, lost: -11, lostReason: "NO_BUDGET" },
];

async function seedLeads(team: Team) {
  const stages = await prisma.pipelineStage.findMany({
    where: { pipelineId: SALES_PIPELINE_ID },
    select: { id: true, stageKey: true },
  });

  const byKey = new Map(stages.map((stage) => [stage.stageKey, stage.id]));
  // Sales sits with the rep; the owner picks up the two biggest deals, which is
  // what actually happens in a small agency.
  const owners = [team.sales, team.sales, team.sales, team.owner];

  const rows = LEADS.map((row, index) => {
    const stageId = byKey.get(row.stage);
    if (!stageId) throw new Error(`No sales stage "${row.stage}".`);

    const status =
      row.stage === "won"
        ? "CONVERTED"
        : row.stage === "lost"
          ? "LOST"
          : row.stage === "long_term_nurture"
            ? "NURTURE"
            : row.stage === "qualified" || row.stage === "proposal_sent" || row.stage === "negotiation"
              ? "QUALIFIED"
              : row.stage === "contacted" || row.stage.startsWith("strategy_call")
                ? "CONTACTED"
                : row.stage === "attempting_contact"
                  ? "ATTEMPTING_CONTACT"
                  : "NEW";

    return {
      contactName: row.contact,
      businessName: row.company,
      email: `${row.contact.split(" ").pop()?.toLowerCase()}@${row.company
        .toLowerCase()
        .replace(/[^a-z]+/g, "")
        .slice(0, 16)}.com`,
      phone: `(555) ${100 + index} ${1000 + index * 7}`.slice(0, 18),
      source: row.source as never,
      status: status as never,
      stageId,
      assignedToId: owners[index % owners.length],
      budgetAmount: row.value,
      proposalValue: row.proposal !== undefined ? row.value : null,
      proposalSentAt: row.proposal !== undefined ? at(row.proposal) : null,
      lastContactAt: row.contacted === null || row.contacted === undefined ? null : at(row.contacted, 14),
      nextAction: row.action ?? null,
      nextFollowUpAt: row.follow === null || row.follow === undefined ? null : at(row.follow, 14),
      strategyCallAt: row.call === undefined ? null : at(row.call, 11),
      strategyCallStatus: (row.callStatus ?? null) as never,
      nurtureUntil: row.nurture === undefined ? null : at(row.nurture),
      wonAt: row.won === undefined ? null : at(row.won, 16),
      wonById: row.won === undefined ? null : owners[index % owners.length],
      finalValue: row.won === undefined ? null : row.value,
      lostAt: row.lost === undefined ? null : at(row.lost, 16),
      lostReasonCode: (row.lostReason ?? null) as never,
      createdAt: at(-(3 + index * 2), 9),
    };
  });

  await prisma.lead.createMany({ data: rows });

  return rows.length;
}

/* -------------------------------------------------------------------- tasks */

interface TaskSpec {
  title: string;
  who: keyof Team;
  client: string | null;
  category: string;
  status: string;
  due: number;
  hours: number;
  platform?: string;
  objective?: string;
  deliverable?: string;
  blocker?: string;
  reviewer?: keyof Team;
  eod?: { day: number; percent: number; hours: number; summary: string; next: string; blocker?: string }[];
}

const TASKS: TaskSpec[] = [
  // Automation specialist — a full plate, one blocked, one missing its entry.
  { title: "Build the lead follow-up automation", who: "automation", client: "Best Life Chiropractic", category: "CRM_AND_AUTOMATION", status: "IN_PROGRESS", due: 1, hours: 6, platform: "GOHIGHLEVEL", objective: "Route every new enquiry to a call within an hour.", deliverable: "Live workflow with SMS and email steps, tested end to end.", reviewer: "pm",
    eod: [
      { day: -3, percent: 25, hours: 2, summary: "Mapped the pipeline stages and built the contact tags.", next: "Wire the first SMS step." },
      { day: -2, percent: 55, hours: 2.5, summary: "Built the SMS and email steps, tested with a dummy contact.", next: "Add the fallback branch for no-answer." },
      { day: -1, percent: 75, hours: 2, summary: "Fallback branch done, ran three test contacts through cleanly.", next: "Final end-to-end test and hand over." },
      { day: 0, percent: 90, hours: 1.5, summary: "End-to-end test passed on live contacts. Tidying the naming.", next: "Hand over for review this afternoon." },
    ] },
  { title: "Set up GoHighLevel tracking and workflows", who: "automation", client: "Metro South Chamber", category: "CRM_AND_AUTOMATION", status: "BLOCKED", due: -2, hours: 5, platform: "GOHIGHLEVEL", blocker: "No GoHighLevel agency access yet — chased twice.", objective: "Track every enquiry source end to end.",
    eod: [
      { day: -2, percent: 20, hours: 1, summary: "Prepared the field mapping while waiting on access.", next: "Cannot continue until access lands.", blocker: "No GoHighLevel agency access yet." },
      { day: 0, percent: 20, hours: 0.5, summary: "Still no access. Chased David again and copied the project manager.", next: "Nothing until access lands.", blocker: "No GoHighLevel agency access yet - chased twice." },
    ] },
  { title: "Create the seven day email warm-up sequence", who: "automation", client: "Brightline Accounting", category: "EMAIL_AND_SMS_MARKETING", status: "TODO", due: 3, hours: 4, platform: "EMAIL", objective: "Warm new subscribers before the first offer." },
  { title: "Connect the booking calendar to the CRM", who: "automation", client: "Lakeside Physio", category: "INTEGRATIONS", status: "NEEDS_REVIEW", due: 0, hours: 3, platform: "ZAPIER", reviewer: "pm", deliverable: "Bookings land in the CRM with the source preserved.",
    eod: [{ day: -1, percent: 100, hours: 3, summary: "Connection built and tested with six bookings.", next: "Handed over for review." }] },

  // Creative specialist.
  { title: "Design five ad creatives for the Meta campaign", who: "creative", client: "Sunrise Dental Group", category: "CREATIVE_DESIGN", status: "IN_PROGRESS", due: -1, hours: 5, platform: "META_ADS", objective: "Refresh the tired creative before the December push.", deliverable: "Five sized exports plus source files.", reviewer: "ads",
    eod: [
      { day: -2, percent: 40, hours: 2.5, summary: "Three concepts drafted from the winter brand kit.", next: "Two more concepts, then size for placements." },
      { day: 0, percent: 65, hours: 3, summary: "Five concepts done. Sized three for feed and stories.", next: "Size the last two and send for review." },
    ] },
  { title: "Build the pediatric consultation landing page", who: "creative", client: "Best Life Chiropractic", category: "FUNNELS_AND_LANDING_PAGES", status: "REVISION_REQUIRED", due: 2, hours: 8, platform: "GOHIGHLEVEL", objective: "Convert paid traffic into booked consultations.", deliverable: "Responsive page with the form wired to the CRM.", reviewer: "pm",
    eod: [
      { day: -4, percent: 60, hours: 4, summary: "Page built and responsive down to mobile.", next: "Wire the form to the CRM." },
      { day: -1, percent: 80, hours: 2, summary: "Form wired, sent for review.", next: "Waiting on review." },
    ] },
  { title: "Write the challenge funnel copy", who: "creative", client: "Elite Fitness Collective", category: "COPYWRITING", status: "WAITING_CLIENT", due: 4, hours: 4, objective: "Sell the six week challenge without discounting.", blocker: "Waiting on the client's testimonial approvals.",
    eod: [{ day: -1, percent: 50, hours: 2, summary: "Long-form draft done, awaiting testimonial sign-off.", next: "Finish once the testimonials are approved.", blocker: "Testimonials not yet approved." }] },
  { title: "Refresh the December content calendar", who: "creative", client: "Northgate Veterinary", category: "CONTENT_PLANNING", status: "TODO", due: 5, hours: 3, platform: "INSTAGRAM" },
  { title: "Update the services page copy", who: "creative", client: "Cedar Ridge Landscaping", category: "WEBSITE_UPDATES", status: "DONE", due: -5, hours: 2,
    eod: [{ day: -5, percent: 100, hours: 2, summary: "Copy replaced across all four service sections.", next: "Nothing outstanding." }] },

  // Ads specialist.
  { title: "Rebuild the Meta campaign structure", who: "ads", client: "Sunrise Dental Group", category: "PAID_MEDIA", status: "IN_PROGRESS", due: 2, hours: 6, platform: "META_ADS", objective: "Cut cost per booked call below sixty dollars.", deliverable: "Restructured campaigns with clean audience splits.", reviewer: "owner",
    eod: [
      { day: -2, percent: 30, hours: 2, summary: "Audited the existing structure and pulled ninety days of data.", next: "Build the new campaign shell." },
      { day: -1, percent: 55, hours: 2.5, summary: "New shell built, audiences split by intent.", next: "Move budget across and monitor." },
      { day: 0, percent: 70, hours: 2, summary: "Moved sixty percent of budget to the new structure.", next: "Watch cost per booking for two days before shifting the rest." },
    ] },
  { title: "Fix conversion tracking on the booking flow", who: "ads", client: "Elite Fitness Collective", category: "ANALYTICS_AND_TRACKING", status: "IN_PROGRESS", due: 0, hours: 4, platform: "WEBSITE", objective: "Make the booking numbers trustworthy again.",
    eod: [{ day: -1, percent: 45, hours: 2, summary: "Found the pixel firing twice on the thank-you page.", next: "Deduplicate and re-verify in the events manager." }, { day: 0, percent: 80, hours: 2.5, summary: "Deduplicated the pixel. Events manager now shows one conversion per booking.", next: "Re-check tomorrow against yesterday numbers." }] },
  { title: "Build the monthly performance report", who: "ads", client: "Harbor Point Legal", category: "CLIENT_REPORTING", status: "NEEDS_REVIEW", due: -1, hours: 3, reviewer: "pm", deliverable: "Report with findings and three recommendations.",
    eod: [{ day: -1, percent: 100, hours: 3, summary: "Report written with three recommendations.", next: "Submitted for review." }] },
  { title: "Audit the Google Ads search terms", who: "ads", client: "Riverbend Orthodontics", category: "PAID_MEDIA", status: "TODO", due: 6, hours: 3, platform: "GOOGLE_ADS" },

  // Project managers.
  { title: "Run the Metro South onboarding call", who: "pm", client: "Metro South Chamber", category: "CLIENT_MANAGEMENT", status: "DONE", due: -6, hours: 2,
    eod: [{ day: -6, percent: 100, hours: 2, summary: "Call held, scope confirmed and access list agreed.", next: "Chase the access items." }] },
  { title: "Chase the Cedar Ridge onboarding form", who: "pm", client: "Cedar Ridge Landscaping", category: "CLIENT_MANAGEMENT", status: "WAITING_CLIENT", due: -3, hours: 1, blocker: "Third reminder sent, no reply.",
    eod: [{ day: -1, percent: 40, hours: 0.5, summary: "Sent a third reminder and left a voicemail.", next: "Escalate to the owner if nothing by Friday.", blocker: "No reply to three reminders." }] },
  { title: "Prepare the Brightline strategy session", who: "pm", client: "Brightline Accounting", category: "STRATEGY", status: "IN_PROGRESS", due: 1, hours: 4,
    eod: [{ day: -1, percent: 60, hours: 2, summary: "Deck drafted, waiting on the ads data to finish it.", next: "Add the paid section and rehearse." }, { day: 0, percent: 85, hours: 2, summary: "Paid section added once the numbers came through. Rehearsed once.", next: "Final read tomorrow morning before the call." }] },
  { title: "Review the Elite Fitness QA pass", who: "angelo", client: "Elite Fitness Collective", category: "QUALITY_ASSURANCE", status: "IN_PROGRESS", due: 0, hours: 3,
    eod: [{ day: -1, percent: 50, hours: 1.5, summary: "Walked half the checklist, two issues raised.", next: "Finish the checklist and log the rest." }, { day: 0, percent: 90, hours: 2, summary: "Checklist finished. Four issues in total, all logged against the build.", next: "Hand back to creative for the fixes." }] },
  { title: "Write the Sunrise Dental quarterly review", who: "angelo", client: "Sunrise Dental Group", category: "CLIENT_REPORTING", status: "TODO", due: 4, hours: 4 },
  { title: "Update the client onboarding SOP", who: "angelo", client: null, category: "INTERNAL_OPERATIONS", status: "BACKLOG", due: 12, hours: 3 },

  // Sales.
  { title: "Follow up the Stonebridge proposal", who: "sales", client: null, category: "LEAD_GENERATION_AND_OUTREACH", status: "IN_PROGRESS", due: -1, hours: 1,
    eod: [{ day: -1, percent: 50, hours: 0.5, summary: "Left a voicemail and emailed the summary again.", next: "Call again Thursday morning." }, { day: 0, percent: 60, hours: 0.5, summary: "Reached the assistant. Laura is back in the office Thursday.", next: "Call Thursday at ten." }] },
  { title: "Prepare the Kestrel negotiation terms", who: "sales", client: null, category: "LEAD_GENERATION_AND_OUTREACH", status: "TODO", due: 1, hours: 2 },

  // Owner.
  { title: "Review agency margin by service line", who: "owner", client: null, category: "INTERNAL_OPERATIONS", status: "IN_PROGRESS", due: 3, hours: 4,
    eod: [{ day: -2, percent: 35, hours: 2, summary: "Pulled the last two quarters by service line.", next: "Model the retainer pricing change." }] },
];

async function seedTasks(team: Team, clients: { id: string; company: string }[]) {
  const clientByName = new Map(clients.map((client) => [client.company, client.id]));
  let taskCount = 0;
  let eodCount = 0;

  for (const spec of TASKS) {
    const dueDate = at(spec.due, 17);

    const task = await prisma.employeeTask.create({
      data: {
        title: spec.title,
        assignedToId: team[spec.who],
        createdById: spec.who === "owner" ? team.aileen : team.pm,
        reviewerId: spec.reviewer ? team[spec.reviewer] : null,
        requiresApproval: Boolean(spec.reviewer),
        clientId: spec.client ? (clientByName.get(spec.client) ?? null) : null,
        category: spec.category as never,
        status: spec.status as never,
        priority: (spec.due < 0 ? "HIGH" : spec.due <= 1 ? "MEDIUM" : "LOW") as never,
        dueDate,
        weekStartDate: mondayOf(dueDate),
        estimatedHours: spec.hours,
        platform: (spec.platform ?? null) as never,
        objective: spec.objective ?? null,
        completionCriteria: spec.deliverable ?? null,
        blocker: spec.blocker ?? null,
        startDate: at(spec.due - 5, 9),
        completedAt: spec.status === "DONE" ? at(spec.due, 16) : null,
        // Finished work still needs an approver against it, or the completed
        // view shows a task nobody signed off.
        approvedById: spec.status === "DONE" ? team.pm : null,
        approvedAt: spec.status === "DONE" ? at(spec.due, 16) : null,
        actualHours: spec.status === "DONE" ? spec.hours : null,
        revisionNote:
          spec.status === "REVISION_REQUIRED"
            ? "The form is not posting to the CRM yet, and the mobile layout breaks under 380px."
            : null,
        submittedAt: spec.status === "NEEDS_REVIEW" ? at(-1, 16) : null,
        createdAt: at(spec.due - 8, 9),
      },
      select: { id: true },
    });

    taskCount += 1;

    for (const entry of spec.eod ?? []) {
      await prisma.employeeTaskEodEntry.create({
        data: {
          taskId: task.id,
          authorId: team[spec.who],
          entryDate: startOfDay(at(entry.day)),
          summary: entry.summary,
          nextSteps: entry.next,
          blockers: entry.blocker ?? null,
          progressPercent: entry.percent,
          hoursSpent: entry.hours,
          taskStatus: spec.status as never,
          createdAt: at(entry.day, 17, 15),
          updatedAt: at(entry.day, 17, 15),
        },
      });

      eodCount += 1;
    }
  }

  return { taskCount, eodCount };
}

/* ----------------------------------------------------------- weekly reports */

async function seedWeeklyReports(team: Team) {
  const thisWeek = mondayOf(NOW);
  const lastWeek = new Date(thisWeek);
  lastWeek.setDate(lastWeek.getDate() - 7);

  /*
   * A spread of statuses on purpose. If every report were approved, the
   * reviewer's buttons, the needs-changes banner and the not-started count
   * would all go untested.
   */
  const rows = [
    { user: team.automation, week: lastWeek, status: "APPROVED", summary: "Quiet week. Most of it went on the follow-up automation.", approvedBy: team.pm },
    { user: team.creative, week: lastWeek, status: "APPROVED", summary: "Landing page took longer than planned - the CRM form fought back.", approvedBy: team.pm },
    { user: team.ads, week: lastWeek, status: "NEEDS_CHANGES", summary: "Rebuilt the Meta structure and started the tracking fix.", note: "Add the hours against the tracking work before I sign this off." },
    { user: team.pm, week: lastWeek, status: "APPROVED", summary: "Onboarding calls and chasing Cedar Ridge.", approvedBy: team.owner },
    { user: team.automation, week: thisWeek, status: "SUBMITTED", summary: "Follow-up automation nearly done. Metro South still blocked on access." },
    { user: team.creative, week: thisWeek, status: "DRAFT", summary: "Creatives in progress." },
    { user: team.ads, week: thisWeek, status: "SUBMITTED", summary: "Campaign rebuild is halfway. Tracking bug found and half fixed." },
    // The project managers have not started this week's, which is what the
    // not-started count on the board is for.
  ];

  for (const row of rows) {
    await prisma.weeklyReport.create({
      data: {
        userId: row.user,
        weekStartDate: row.week,
        status: row.status as never,
        summary: row.summary,
        submittedAt: row.status === "DRAFT" ? null : at(row.week === thisWeek ? -1 : -8, 17),
        approvedAt: row.status === "APPROVED" ? at(-7, 9) : null,
        approvedById: row.approvedBy ?? null,
        managerNote: row.note ?? null,
      },
    });
  }

  return rows.length;
}

/* ------------------------------------------------- notifications and trail */

async function seedTrail(team: Team, clients: { id: string; company: string }[]) {
  const tasks = await prisma.employeeTask.findMany({
    select: { id: true, title: true, assignedToId: true, clientId: true },
    take: 30,
  });

  const leads = await prisma.lead.findMany({
    select: { id: true, businessName: true, assignedToId: true },
    take: 30,
  });

  const activity: {
    actorId: string;
    action: string;
    entityType: "EMPLOYEE_TASK" | "LEAD" | "CLIENT" | "REPORT";
    entityId: string;
    createdAt: Date;
  }[] = [];

  // Task history, spread back across the fortnight so the feeds are not all
  // stamped with the same minute.
  tasks.forEach((task, index) => {
    const offset = -(index % 9) - 1;

    activity.push({
      actorId: team.pm,
      action: `Assigned "${task.title}"`,
      entityType: "EMPLOYEE_TASK",
      entityId: task.id,
      createdAt: at(offset - 4, 9, index % 50),
    });

    if (index % 3 === 0) {
      activity.push({
        actorId: task.assignedToId,
        action: `Submitted EOD for "${task.title}"`,
        entityType: "EMPLOYEE_TASK",
        entityId: task.id,
        createdAt: at(offset, 17, index % 45),
      });
    }

    if (index % 5 === 0) {
      activity.push({
        actorId: team.pm,
        action: `Approved "${task.title}"`,
        entityType: "EMPLOYEE_TASK",
        entityId: task.id,
        createdAt: at(offset, 15, index % 40),
      });
    }
  });

  leads.forEach((lead, index) => {
    activity.push({
      actorId: lead.assignedToId ?? team.sales,
      action: `Logged call with ${lead.businessName}`,
      entityType: "LEAD",
      entityId: lead.id,
      createdAt: at(-(index % 11) - 1, 11, index % 55),
    });
  });

  clients.forEach((client, index) => {
    activity.push({
      actorId: team.pm,
      action: `Moved ${client.company} to the next stage`,
      entityType: "CLIENT",
      entityId: client.id,
      createdAt: at(-(index * 2) - 2, 13, index * 3),
    });
  });

  await prisma.activityLog.createMany({ data: activity });

  /*
   * Notifications skew unread and recent, because that is what a real inbox
   * looks like on a Wednesday afternoon - and an all-read inbox would leave the
   * badge and the panel untested.
   */
  const notifications = [
    { to: team.automation, type: "TASK_ASSIGNED", title: "New task: Create the seven day email warm-up sequence", body: "For Brightline Accounting.", day: -1, read: false },
    { to: team.automation, type: "REVISION_REQUEST", title: "Changes requested: Build the pediatric consultation landing page", body: "The form is not posting to the CRM yet.", day: -1, read: false },
    { to: team.pm, type: "APPROVAL_REQUIRED", title: "Ready for review: Connect the booking calendar to the CRM", body: "For Lakeside Physio.", day: 0, read: false },
    { to: team.pm, type: "APPROVAL_REQUIRED", title: "Ready for review: Build the monthly performance report", body: "For Harbor Point Legal.", day: -1, read: false },
    { to: team.pm, type: "TASK_OVERDUE", title: "Overdue: Set up GoHighLevel tracking and workflows", body: "Blocked on client access for two days.", day: 0, read: false },
    { to: team.creative, type: "TASK_DUE_SOON", title: "Due tomorrow: Refresh the December content calendar", body: "For Northgate Veterinary.", day: 0, read: false },
    { to: team.ads, type: "APPROVAL_RECEIVED", title: "Approved: Update the services page copy", body: "Nothing more needed.", day: -2, read: true },
    { to: team.sales, type: "TASK_DUE_SOON", title: "Follow up due: Stonebridge Wealth", body: "Proposal sent seven days ago.", day: 0, read: false },
    { to: team.owner, type: "APPROVAL_REQUIRED", title: "Weekly report from Ads Specialist", body: "Ready to review.", day: -1, read: false },
    { to: team.ads, type: "REVISION_REQUEST", title: "Changes requested on your weekly report", body: "Add the hours against the tracking work.", day: -6, read: true },
    { to: team.angelo, type: "CLIENT_WAITING", title: "Cedar Ridge Landscaping has not replied", body: "Third reminder sent with no response.", day: -1, read: false },
    { to: team.pm, type: "MISSING_ACCESS", title: "Metro South Chamber is blocking work", body: "No GoHighLevel agency access yet.", day: -2, read: true },
  ];

  await prisma.notification.createMany({
    data: notifications.map((row) => ({
      recipientId: row.to,
      type: row.type as never,
      urgency: (row.type.includes("OVERDUE") ? "HIGH" : "NORMAL") as never,
      title: row.title,
      body: row.body,
      href: row.type.includes("report") ? "/fulfillment" : "/work",
      createdAt: at(row.day, 9 + (Math.abs(row.day) % 8)),
      readAt: row.read ? at(row.day, 18) : null,
    })),
  });

  return { activity: activity.length, notifications: notifications.length };
}

/* --------------------------------------------------------------------- run */

async function main() {
  console.log("Clearing operational data...");
  const cleared = await clearOperationalData();
  const clearedTotal = Object.values(cleared).reduce((sum, count) => sum + count, 0);

  for (const [table, count] of Object.entries(cleared).filter(([, count]) => count > 0)) {
    console.log(`  removed ${String(count).padStart(4)}  ${table}`);
  }
  console.log(`  ${clearedTotal} rows removed in total.\n`);

  const team = await loadTeam();

  console.log("Building the sample data...");
  const clients = await seedClients(team);
  console.log(`  ${clients.length} clients`);

  const leadCount = await seedLeads(team);
  console.log(`  ${leadCount} leads`);

  const { taskCount, eodCount } = await seedTasks(team, clients);
  console.log(`  ${taskCount} tasks`);
  console.log(`  ${eodCount} end-of-day entries`);

  const reportCount = await seedWeeklyReports(team);
  console.log(`  ${reportCount} weekly reports`);

  const trail = await seedTrail(team, clients);
  console.log(`  ${trail.activity} activity records`);
  console.log(`  ${trail.notifications} notifications`);

  console.log("\nDone.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
