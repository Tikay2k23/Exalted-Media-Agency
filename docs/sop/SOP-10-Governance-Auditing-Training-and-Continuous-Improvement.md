# THE EXALTED MEDIA
# SOP 10 — Governance, Auditing, Training & Continuous Improvement

## Primary Owner
Agency Owner / Strategist

## Operational Owner
Project Manager

## Purpose
Keep the entire agency operating system accurate, secure, scalable, and continuously improving.

## Main Process
1. Maintain SOP library.
2. Assign SOP owners.
3. Track SOP versions.
4. Review SOPs regularly.
5. Audit client journeys.
6. Audit team work.
7. Audit permissions.
8. Audit security.
9. Record audit findings.
10. Create corrective actions.
11. Perform root-cause analysis.
12. Maintain improvement backlog.
13. Train team members.
14. Certify team members.
15. Review team performance.
16. Review client feedback.
17. Review recurring problems.
18. Update processes.
19. Test process changes.
20. Archive outdated SOP versions.

## Acceptance testing and release sign-off

No release reaches people outside the team until the test catalogue says it
may. The catalogue lives in the system, under SOPs and Audits.

1. Maintain the test case catalogue.
2. Classify each case by severity, P0 to P3.
3. Classify each case by release scope: required for this release, required
   before production, or deferred.
4. Assign cases to the seat the case is written for.
5. Execute each case by hand, against a database kept for the purpose.
6. Record the result, and for a failure record what actually happened.
7. Raise a fix task from the failing case.
8. Retest once the fix is done. A failed case cannot become passed by anybody
   changing its status.
9. Sign the release off, once the gate is met.

### The rules this depends on

A case is passed when somebody executed the steps and saw the expected result.
Marking an unrun case passed is worse than leaving it untested, because nobody
looks at it again.

A failure has to say what happened. A failure nobody can reproduce cannot be
fixed or retested.

Blocked is not failed. Use it when something outside the case stopped you, so
the count stays honest.

Every run stays on the record. The history is the evidence, not the current
status.

### The gate

Every case in the release's scope must have been executed and passed. A blocked
or failed case holds the release whatever its severity, and an open P0 holds it
wherever that P0 sits — in scope or out of it.

Sign-off belongs to the Agency Owner and the Project Manager. Everyone can
record a result; nobody can approve a release around a gate that is not met,
and the system will not offer the button until it is.

## Overriding a stage requirement

An account cannot normally leave a stage until that stage's exit criteria are
met — see [STAGE-GATES.md](STAGE-GATES.md) for what each one is and where it
comes from.

The Agency Owner and the Project Manager can override an unmet criterion. An
override is a governance event, not a shortcut:

1. Fix the underlying thing first, wherever that is possible. The system names
   the unmet criterion and links to the page that satisfies it.
2. Where it genuinely is not possible, write the reason. A reason is required
   and is kept with the account.
3. The override records who approved it, and everyone who can audit is told.
4. Review overrides at audit. A criterion overridden repeatedly is a criterion
   that is wrong — change the rule rather than continuing to bypass it.

## Audit Results
- Compliant
- Partially Compliant
- Non-Compliant
- Critical Failure
- Not Applicable

## Certification Levels
- Observer
- Trainee
- Supervised Operator
- Certified Operator
- Senior Reviewer
- Process Owner

## Completion
The agency maintains current SOPs, trained team members, accurate audits, controlled permissions, and active continuous improvement.
