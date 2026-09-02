# Documentation

## For the people using the system

| Document | Who it is for |
| --- | --- |
| [USER-HANDBOOK.md](USER-HANDBOOK.md) | Everybody. How to use the system, with a section per seat — what your day looks like, what is yours, and what is not. |
| [BUTTON-GUIDE.md](BUTTON-GUIDE.md) | Everybody. A picture of each screen with every button numbered and explained. Start here if you are new. |
| [UAT-RUNBOOK.md](UAT-RUNBOOK.md) | The Limited Beta testing round. Who tests what, and how to record a result. Point-in-time. |

## For the people running it

| Document | What it covers |
| --- | --- |
| [DATABASE-ENVIRONMENTS.md](DATABASE-ENVIRONMENTS.md) | The four databases, the command for each, and the environment-variable rule that bites if you ignore it. |
| [GUIDE.md](GUIDE.md) | |
| [sop/](sop/) | The ten written procedures, SOP-01 to SOP-10. They seed a new environment's SOP library; the live text is in Governance → SOPs. |

## Keeping the screenshots current

The pictures in the button guide live in `images/button-guide/` and were
captured from the UAT environment at 1440×900, with the callout numbers drawn
in at the position the browser reported for each button.

If the interface changes enough that a picture misleads, recapture rather than
patching the caption — a guide whose screenshots no longer match the product is
worse than no guide, because people stop trusting the parts that are still
right.
