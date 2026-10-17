# 0005 · Design rules from taste-skill, pinned to a commit

**Date:** 2026-10-16

## Context
The brief names taste-skill as the design method and asks for its dials and pre-flight.

## Decision
Vendor `design-taste-frontend`, `minimalist-ui`, `redesign-existing-projects`, `full-output-enforcement`
and `high-end-visual-design` into `.claude/skills/` from commit `9b4ac7f` ([README](../../.claude/skills/README.md)).
The current `design-taste-frontend` (v2) has no dials or pre-flight: directions are dealt with
`draw.mjs` and checked by its Gate (`lint.mjs` + `inspect.mjs`), which serves as the pre-flight. The
dials (variance 5, motion 5, density 4) are recorded as intent. The skill excludes app screens, so the
hub screens follow its house rules plus `minimalist-ui`; where the two disagree (1 px borders, small
uppercase pill tags), the house rules win.

## Consequences
Updates are deliberate: copy from a new commit, review the diff, regenerate `SHA256SUMS`.

## Status
Accepted.
