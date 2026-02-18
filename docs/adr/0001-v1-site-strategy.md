# ADR 0001: V1 Site Strategy

## Status
Accepted

## Context
We need to decide how to structure our lead-generation site network: one domain per metro per vertical (domain-farm mode) or one domain per vertical with metro pages.

## Decision
**V1: One domain per metro per vertical (15 domains for launch).**

- 3 verticals × 5 metros = 15 domains
- Each domain is a single-vertical, single-metro site
- Domain naming is geographically inclined (e.g., BostonInteriorPainting.com)
- Domain-farm mode (hundreds of micro-domains) is explicitly deferred

## Rationale
- Strongest local SEO signal from geo-keyword domains
- Each domain is a standalone asset that can be independently optimized
- Manageable at 15 domains; scales linearly
- Reduces cross-domain footprint risk vs. hundreds of thin sites

## Consequences
- More domain ops (15 vs 3), but manageable
- Each site is relatively thin (homepage + legal pages) for V1
- Internal linking across metros happens within the same vertical only
