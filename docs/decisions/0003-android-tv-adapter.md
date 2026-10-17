# 0003 · The TV adapter is named for its protocol: Android TV

**Date:** 2026-10-16

## Context
The brief planned `adapter-philips-tv`. The tested TV is Philips-branded, but it has no Philips
JointSPACE API; it is controlled with Google's Android TV Remote v2 protocol, which every Android TV
and Google TV speaks.

## Decision
The adapter is `adapter-android-tv`, built from `packages/android-tv-remote`. Its compatibility line
reads "Works with Android TV and Google TV; tested on a Philips Android TV". Scenes use only what the
protocol offers: power, volume, mute, navigation, apps, and (once tested) HDMI inputs. Ambilight and
picture mode are dropped for this TV.

## Consequences
The adapter is useful to many more people. A JointSPACE adapter for older Philips TVs can be added later
as a separate package.

## Status
Accepted.
