# Build Focus Block Chrome Extension

## Objective

Read the existing design document, validate it as an implementation plan, and build a working Chrome extension for blocking websites according to that spec. The full outcome is a loadable, functional Chrome extension.

## Original Request

Look at the design document inside the docs folder, decide on a course of action and how we can build it, and build the Chrome extension for blocking out websites.

## Intake Summary

- Input shape: `existing_plan`
- Audience: End users who want to block distracting websites
- Authority: `requested`
- Proof type: `artifact`
- Completion proof: The Chrome extension loads in Chrome developer mode and successfully blocks configured websites
- Goal oracle: Load the unpacked extension in Chrome, configure a site to block, navigate to that site, verify it is blocked
- Likely misfire: Building scaffolding or partial features without a working end-to-end blocking flow; diverging from the design doc's intent
- Blind spots considered: Chrome Manifest V3 requirements, design doc completeness/gaps, testing strategy, whether popup UI vs background-only
- Existing plan facts: Design document at `/Users/cdyke/Documents/10.Projects/10.MyProjects/focus-block/docs/design-doc.md` (exists in main repo working directory, not committed to any branch)

## Goal Oracle

The oracle for this goal is:

`Load the unpacked extension in Chrome developer mode, configure a blocked site, navigate to it, and verify it is blocked. The extension must match the design doc's specified features.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Read and validate the design document, then build the complete Chrome extension in successive verified work packages. Each package should produce a working vertical slice — not just files or scaffolding. Continue until the full extension works as specified.

## Non-Negotiable Constraints

- Must use Chrome Manifest V3 (V2 is deprecated).
- Must follow the design document's spec; divergences require explicit justification.
- The design doc must be read and validated before implementation begins.
- Extension must be loadable as an unpacked extension in Chrome for testing.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if the user asked for working software and a safe Worker task can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

A Worker should produce a working screen, a working blocking mechanism, or a complete feature — not just a manifest file or a single utility.

## Canonical Board

Machine truth lives at:

`docs/goals/build-focus-block-extension/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/build-focus-block-extension/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Re-check the intake: original request, input shape, authority, proof, blind spots, existing plan facts, and likely misfire.
5. Work only on the active board task.
6. Assign Scout, Judge, Worker, or PM according to the task.
7. Write a compact task receipt.
8. Update the board.
9. If safe local work remains, choose the next largest reversible Worker package and continue unless blocked.
10. If a problem, suggestion, or follow-up should become a repo artifact, create an approved issue/PR or ask the operator whether to create one.
11. Review at phase, risk, rejected-verification, ambiguity, or final-completion boundaries; do not review every small Worker by habit.
12. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.
