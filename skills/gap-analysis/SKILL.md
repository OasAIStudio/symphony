---
name: gap-analysis
description: Analyze a design bundle against a target codebase to find missing data, features, components, and integrations before implementation begins.
argument-hint: <bundle-path> <codebase-path>
---

# Gap Analysis — Design Bundle vs Codebase

You compare a design reference bundle (produced by `/export-design`) against a target codebase to surface gaps — things the design expects that the codebase doesn't yet provide. The output is an interactive gap report the user reviews, challenges, and uses to decide which gaps warrant `/spec-gen` tickets.

---

## Inputs

### Bundle Path

The path to a design reference bundle directory. Contains the artifacts produced by `/export-design`.

**Resolution order:**
1. **Explicit argument** — if the user provides a path (e.g., `pipeline-config/design-refs/token-report`), use it
2. **Spec identifier** — if the user provides a kebab-case name, resolve to `<codebase-path>/pipeline-config/design-refs/<name>/`
3. **Ask** — if neither resolves to an existing directory, ask: "Where is the design bundle?"

### Codebase Path

The local filesystem path to the target repository for exploration.

**Resolution order:**
1. **Explicit in arguments** — if the user includes a path, use it
2. **Current working directory** — if cwd contains project markers (`package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `.git`, etc.), use cwd
3. **Ask** — if neither, ask: "What's the local path to the target codebase?"

---

## Bundle Reading

Extract requirements from each bundle artifact. Not every artifact will be present — v1 bundles may lack `behavior.md` and `charts.md`. Handle missing files gracefully by noting their absence rather than failing.

### What to extract from each artifact

- **`structure.md`** — Section inventory, component mapping table, font families, artboard dimensions. This is the master index of what the design contains. The Component Mapping table lists suggested component names and key props derived from DATA annotations.
- **`sections/*.jsx`** — JSX files with inline `{/* DATA: ... */}` annotations marking dynamic values the design expects, and `STRUCTURAL CONTRACT` comments describing child counts, roles, labels, and repeating patterns. DATA annotations are the primary source for identifying data gaps.
- **`behavior.md`** — Conditional styling rules, empty/loading state requirements, variable-count sections. These reveal behavioral expectations that go beyond static layout.
- **`charts.md`** — Chart specifications including type, series count, axis labels, data point counts, and colors. Each chart implies a data pipeline that must exist in the codebase.
- **`styles.json`** — Design tokens (colors, typography, spacing, borders). Compare against the codebase's existing design system or theme configuration.

Build a complete picture of what the design requires: every data field, every behavioral rule, every component, every external data source.

---

## Codebase Exploration

Search the codebase to determine what already exists and what's missing. The goal is to match each design requirement against codebase reality.

### What to search for

- **Type definitions and interfaces** — TypeScript types, Go structs, Python dataclasses, database schema definitions. These reveal what data the system models.
- **API responses** — Route handlers, controller methods, GraphQL resolvers. Check the shape of data returned by endpoints the design would consume.
- **Database schemas** — Migration files, ORM models, schema definitions. Determine whether the data the design needs is persisted or derivable.
- **Existing UI components** — Component libraries, shared components, design system implementations. Identify which design patterns already have codebase equivalents.
- **Data pipeline logic** — Aggregation queries, computed fields, ETL jobs, analytics pipelines. Charts and computed values in the design imply specific data transformations.
- **External service integrations** — API clients, webhook handlers, third-party SDK usage. The design may reference data from systems the codebase doesn't yet integrate with.
- **Configuration and environment** — Feature flags, environment variables, config files. Some design elements may depend on configuration that doesn't exist.

Explore in whatever order makes sense for the specific bundle and codebase. Start with the highest-signal artifacts (DATA annotations in JSX, chart specs) and work outward.

---

## Gap Categories

Classify each gap into one of four categories. Include concrete examples from the bundle and codebase in each gap entry.

### Data Gaps
The design shows values that the codebase's data model doesn't have.

*Examples:*
- Design shows a "z-score" field on outlier cards, but the analytics pipeline only computes mean and standard deviation
- Chart expects 30 days of per-ticket cost history, but the cost table only stores current-period totals
- KPI card displays "tokens per stage," but the token_usage table has no stage foreign key

### Feature Gaps
The design implies behavior that no existing code implements.

*Examples:*
- Design shows conditional red/amber/green badges based on thresholds, but no threshold evaluation logic exists
- Variable-count section implies pagination or "show more," but the API endpoint returns all results without limit/offset
- Empty state shown in behavior.md, but the component has no zero-data branch

### Component Gaps
The design uses UI patterns absent from the codebase's component library.

*Examples:*
- Design uses sparkline charts, but the codebase has no charting library
- Section layout uses a card grid pattern not present in existing shared components
- Design references a tooltip component that doesn't exist in the UI kit

### Integration Gaps
The design references external systems or data sources the codebase doesn't connect to.

*Examples:*
- Chart pulls data from a metrics API the codebase has no client for
- Design shows GitHub issue status, but there's no GitHub API integration
- Design expects real-time data updates, but no WebSocket or polling infrastructure exists

---

## Output Format

Present the gap analysis as an interactive report in two parts.

### Part 1: Summary Table

```markdown
## Gap Analysis Summary: <bundle-name>

| Category    | Count | Critical | Notes                        |
|-------------|-------|----------|------------------------------|
| Data        | N     | N        | <one-line summary>           |
| Feature     | N     | N        | <one-line summary>           |
| Component   | N     | N        | <one-line summary>           |
| Integration | N     | N        | <one-line summary>           |
| **Total**   | **N** | **N**    |                              |
```

Mark a gap as "Critical" when it blocks implementation of a design section entirely (not just degrades it).

### Part 2: Per-Section Gap List

For each section in the design bundle, list all identified gaps:

```markdown
### <Section Name> (from structure.md)

| # | Category | Design Shows | Codebase Provides | Suggested Resolution |
|---|----------|-------------|-------------------|---------------------|
| 1 | Data     | <what the design expects> | <file path if partial match, "MISSING" if absent> | <brief suggestion> |
| 2 | Feature  | <behavioral requirement> | <existing code or "MISSING"> | <brief suggestion> |
```

- **Design Shows**: What the bundle requires — reference the specific artifact and annotation
- **Codebase Provides**: The closest match found, with a file path. Use "MISSING" only when nothing related exists
- **Suggested Resolution**: A brief, actionable suggestion (e.g., "Add `zScore` field to `OutlierAnalysis` type", "Install recharts or similar charting library")

---

## Interactive Review

This skill is interactive. After presenting the gap report:

1. **Invite the user to challenge gaps.** Some reported gaps may not be real — the user has context you don't. Ask: "Which of these gaps look incorrect or overstated?"
2. **Let the user prioritize.** Not all gaps need resolution before implementation. Some can be deferred, others are blockers.
3. **Let the user decide next steps.** The user chooses which gaps warrant `/spec-gen` tickets. Never auto-create Linear issues or assume all gaps need immediate action.

The gap report is a conversation starter, not a final verdict.

---

## Gotchas

- **Cold-start data is not a gap.** Some "missing" data just needs time to accumulate after a feature ships (e.g., 30-day trend charts on a new metric). Flag these as "available after data accumulates" rather than "MISSING." The design is forward-looking; the data model may already support it.
- **Partial matches are not gaps.** If the codebase has the data but in a different shape than the design expects (e.g., flat array vs nested object, different field name, aggregated vs raw), that's a transformation task — not a missing-data gap. Note the shape difference and suggest the mapping.
- **Don't over-report.** Not every dynamic value in a JSX DATA annotation is a gap. Many are standard fields the codebase already provides — check before listing. A gap report full of false positives erodes trust.
- **Bundle version compatibility.** v1 bundles may be missing `behavior.md` and `charts.md`. Handle gracefully — skip those extraction steps and note "behavioral/chart analysis unavailable (v1 bundle)" in the report. Never fail on a missing optional artifact.
- **"Doesn't have" vs "has differently."** Distinguish between the codebase lacking a capability entirely and the codebase implementing it in a way the design doesn't expect. The former is a gap; the latter is an alignment task. Report them differently.
- **Design tokens are rarely gaps.** Unless the codebase has no theming system at all, mismatched colors or fonts are styling tasks, not structural gaps. Don't list every color difference as a gap — focus on missing data and behavior.
- **Don't invent architecture.** The gap report identifies what's missing, not how to build it. Suggested resolutions should be brief pointers, not design documents. That's what `/spec-gen` is for.
- **Screenshots are reference, not specification.** Section PNGs in the bundle are visual context. The JSX, structural contracts, and DATA annotations are the source of truth for gap identification.

---

## Related Skills

- `/export-design` — Produce the design reference bundles this skill consumes
- `/spec-gen` — Generate structured specs from identified gaps, create Linear issues for implementation
