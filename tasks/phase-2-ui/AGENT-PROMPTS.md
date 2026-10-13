# Background-agent launch prompts

Start the contract/foundation lane first. Do not launch dependent feature implementation until its task dependencies are verified.

## Coordinator / lane A

Read tasks/phase-2-ui/README.md and TASK-00-contract-audit-and-implementation-preflight.md. Complete task 00 first, record the contract and ownership handoffs, then coordinate tasks 01-03. Follow the dependency waves and available concurrency limit. Preserve existing changes. Own shared files and backend prerequisites; delegate only disjoint task paths. After feature integration complete tasks 17-18 with actual test evidence. Do not mark implemented work as deployed without a deployment result.

## Generic worker prompt

Implement P2-UI-XX from its task file under tasks/phase-2-ui/. Read README.md, the exact task file, applicable AGENTS.md, API-CONTRACTS.md and CONTRACT-HANDOFF.md first. If either contract handoff is missing or a dependency is not verified, report that prerequisite and limit work to read-only preparation. Stay within owned paths; request shared/API changes from lane A. Preserve unrelated work. Use installed framework guidance and real APIs. Run focused checks and write the result into this task's Agent handoff section. Report files changed, commands/results and unresolved blockers. Do not update the master index, deploy, migrate or push unless separately authorized.

## Lane assignments

- B: start 04, then 05, 06, 07.
- C: start 08, then 09, 10 after authentication and data prerequisites.
- D: start 11, then 12, 13.
- E: start 15/16 while dealer authentication is pending, then 14 once ready; otherwise 14, 15, 16.

Each task file contains its full title, paths, dependency list and acceptance checks. With this session's limit, run the coordinator plus three workers and rotate the remaining lane into the next free slot.

## Handoff response format

Task ID and status:
Changed files:
Contract additions or deviations:
Validation commands and outcomes:
Skipped checks and reasons:
Remaining blockers:
Safe for dependents to start: yes/no, with evidence.
