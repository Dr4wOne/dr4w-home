# 0006 · Design direction B, "One motif"

**Date:** 2026-10-16

## Context
Three working directions were built for G1 (as prototypes, kept out of this repository): A "The product performs",
B "One motif", C "The well-kept board". All three passed the taste-skill Gate (0 FAIL), axe (0
violations) and Lighthouse (99/100/100/100).

## Decision
The owner picked **B**. One shape, the power ring (a circle with a gap at the top), runs the whole
system: the hero stage, every card's one-tap action, the round D-pad, list bullets and the footer
mark. Type: Albert Sans. Colour: dr4w.io's near-black ground `#0A0A0F` with crimson (`#b11226`, light
theme `#a3101f` on `#f4f3f1`), taken from the red eyes of the dr4w.io robot.

## Consequences
The final `web` and `showcase` are built from the B prototype. Known weaknesses to fix in
the build: the round D-pad does not fit an iPhone in landscape without scrolling, the loud-volume
confirmation uses the browser dialog, and the single script bundle costs one Lighthouse point.

## Status
Accepted.
