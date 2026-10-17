# 0001 · A standalone public repo, built fresh

**Date:** 2026-10-16

## Context
The kit grew out of the TV app in the dr4w monorepo. That history holds the owner's
device details, network notes and pairing experiments.

## Decision
The kit lives in its own repository, `Dr4wOne/dr4w-home`, created private and made public only after
the privacy audit (G3). It starts with fresh history: code is copied in, never merged or pushed with
dr4w's history. It follows the dr4w rules where they apply ([dr4w-directives.md](../dr4w-directives.md))
and has no AWS or OpenTofu infrastructure.

## Consequences
Fixes to shared code (the Android TV library) land in the kit; the dr4w monorepo then depends on the
kit's packages or keeps a copy, decided at G2.

## Status
Accepted.
