---
name: export-design
description: Extract Paper design mockups into portable design reference bundles for cross-machine implementation handoff.
argument-hint: <spec-identifier> [artboard-name-or-id]
---

# Export Design — Paper to Design Reference Bundle

You extract a Paper artboard into a portable design reference bundle that implementation agents can consume without Paper MCP access. The bundle is committed to the repo so remote agents pick it up via `git pull`.

## Inputs

1. **spec-identifier** (required): Kebab-case name used as the bundle directory name (e.g., `token-report`, `settings-page`).
2. **artboard** (optional): Paper artboard name or ID. If omitted and only one artboard exists, use it automatically. If multiple exist, list them and ask.
3. **repo-path**: Resolve the same way as spec-gen — explicit path, cwd with project markers, or ask.

**Output directory:** `<repo-path>/pipeline-config/design-refs/<spec-identifier>/`

---

## Step 1: Resolve Inputs & Confirm Paper Connection

1. Parse `spec-identifier` and optional artboard from the skill arguments.
2. Resolve repo-path (explicit → cwd → ask).
3. Call `get_basic_info` — confirms Paper MCP is connected. Note:
   - Available artboard names and IDs
   - Font families loaded in the document
4. Select the artboard:
   - If artboard argument was provided, match by name or ID.
   - If exactly one artboard exists, use it.
   - If multiple and none specified, list them and ask.

---

## Step 2: Map Section Hierarchy

1. Call `get_tree_summary(artboardId, depth=2)` to get the section hierarchy.
2. Each **top-level child** of the artboard = one section. Record for each:
   - Layer name (this becomes the section filename via kebab-case conversion)
   - Dimensions (width × height)
   - Child count
3. Write `structure.md`:

```markdown
# Design Structure: {spec-identifier}

**Artboard**: {artboard-name} ({width}×{height})
**Font families**: {comma-separated from get_basic_info}
**Exported**: {YYYY-MM-DD}

## Sections

| Section | Dimensions | Children |
|---------|-----------|----------|
| {layer-name} | {w}×{h} | {n} |
| ... | ... | ... |

## Component Mapping

| Section | Suggested Component Name | Key Props (from DATA annotations) |
|---------|------------------------|-----------------------|
| {section-name} | {PascalCaseName} | {prop1, prop2, ...} |
| ... | ... | ... |

## Implementation Contract

Each `.jsx` file in `sections/` begins with a `STRUCTURAL CONTRACT` comment (v2 format). This is a compact summary of the design's structural requirements.

Rules for implementors:
1. **Match direct children count.** If the comment says "3 direct children", the component must render 3 top-level elements.
2. **Respect semantic roles.** The "Roles:" line tells you what each child IS — section-header, data-row, chart, content-block. Use this to inform your component structure.
3. **Include all static labels.** Every `static-label` string in the "Labels:" line must appear in the implementation as-is — don't rename. Dynamic values (numbers, IDs, dates) in the Labels line are structural references showing what the design displays; bind them to data props rather than hardcoding.
4. **Match patterns, respect count type.** "5 siblings × 2 children (variable-count)" means render N groups of 2 elements each, where N comes from data. "4 siblings × 3 children (fixed)" means always render exactly 4 groups.
5. **Render data gaps as placeholders.** If the data model lacks a field the design shows, render the label with "—" or 0. Document the gap in the PR description. Never omit designed structure.
6. **Consult companion files.** `behavior.md` for empty/conditional states, `charts.md` for chart semantics, `css-warnings.md` for React compatibility issues. Derive prop bindings from inline `{/* DATA: ... */}` annotations in the JSX files.
```

**Do NOT include node IDs in structure.md** — they are session-ephemeral and meaningless outside Paper.

---

## Step 3: Export Section JSX with Structural Contracts

For each top-level section identified in Step 2:

### 3a. Analyze structure

1. Call `get_tree_summary(sectionNodeId, depth=4)`.
2. Parse the tree summary output. The format is indented text where each line represents a node:
   - `Text "name" (ID) WxH "content"` — a text node with visible content (the last quoted string is the content)
   - `Frame "name" (ID) WxH` — a container node
   - Indentation = 2 spaces per depth level. The section root itself is at depth 0 (no indentation). Its immediate children are at depth 1 (2 spaces). Their children are at depth 2 (4 spaces).

   **Example** (`get_tree_summary` output for an Outlier Analysis section):
   ```
   Frame "Outlier Analysis" (DU-0) 1440×494          ← depth 0 (section root)
     Text "Outlier Analysis" (DV-0) 1312×14 "..."    ← depth 1 (2 spaces)
     Frame "Outlier Card 1" (DW-0) 1312×192          ← depth 1
       Frame "Frame" (DX-0) 1262×18                  ← depth 2 (4 spaces)
         Text "SYMPH-145" (DY-0) 71×16 "SYMPH-145"  ← depth 3 (6 spaces)
     Frame "Outlier Card 2" (DZ-0) 1312×192          ← depth 1
   ```

3. **Count direct children**: count lines at depth 1 (2 spaces indentation). In the example above: 3 (one Text + two Frames).
4. **Collect labels**: extract the last quoted string from every `Text` node at depth 1, 2, or 3 (2, 4, or 6 spaces indentation). These are the section's headings, labels, and structural reference values. Include them in tree-traversal order (the order `get_tree_summary` returns them). If more than 20 text strings, include the first 20 and note "(truncated)" in the Labels line. If depth ≤ 3 yields 0 text nodes, widen the search to include depth 4 (8 spaces indentation) from the already-fetched data.
5. **Detect repeating patterns**: for each Frame node in the tree at any depth up to depth 2 (since its children would be at depth 3, and their child counts are visible at depth 4), check if ≥3 of its direct Frame children have the same child count. If so, record the shallowest such pattern as "N siblings × M children each at depth D" (where D is the depth of those siblings). If multiple patterns exist at the same depth, report the one with the most siblings.
6. **Classify pattern count**: When a pattern is detected, determine if it represents a **fixed** layout or **variable** (data-driven) count:
   - **variable**: The pattern siblings contain text that looks like unique data values — different numbers, different identifiers (e.g., issue IDs like `SYMPH-145`, `HSUI-34`), different names. This means the design shows N representative items but the implementation should render however many exist.
   - **fixed**: The pattern siblings have identical or structural content (e.g., 4 stage cards always labeled "Investigate", "Implement", "Review", "Merge") — the count is part of the design, not data-driven.
7. **Classify semantic roles**: For each direct child at depth 1, assign a role based on the tree summary:
   - `section-header` — a single Text node, or a Frame whose only children are Text nodes with short uppercase or title-case content
   - `data-row` — a Frame that is part of a detected repeating pattern (use `×N` suffix for the group, e.g., `data-row ×6`)
   - `chart` — provisionally assigned if a Frame's name suggests chart content (e.g., "Chart", "Graph", "Trend"). Confirmed or corrected in Step 3e after JSX export, when SVG elements are visible.
   - `data-group` — a Frame at depth 1 that itself contains a detected repeating pattern at depth 2+. Use this instead of `content-block` to signal that the container holds repeating data (the pattern details appear in the Pattern line).
   - `content-block` — everything else (cards, detail panels, mixed content)
   - Join roles with ` | ` separator, collapsing consecutive identical roles into `×N` notation.
8. **Validate**: if the parse yields 0 direct children, the tree summary may have failed. Log a warning and prepend `// STRUCTURAL CONTRACT UNAVAILABLE — tree summary parse failed` to the JSX instead of the full comment block.

### 3b. Export JSX

1. Call `get_jsx(sectionNodeId, format="inline-styles")`.
2. Prepend the structural contract comment.
3. Save to `sections/<kebab-case-layer-name>.jsx`.
4. **DATA annotation pass** — scan the saved JSX for ambiguous data values and insert `{/* DATA: description */}` comments inline, directly before each ambiguous element. This helps implementors distinguish data-bound content from static layout.

   **Annotate these four categories** (scan in order):

   1. **Conditional colors**: Two or more sibling elements with the same structure but different inline `color` or `backgroundColor` values (e.g., one badge `#EF4444`, another `#F59E0B`). Insert before the element:
      ```jsx
      {/* DATA: color indicates threshold/status — bind to condition */}
      ```
   2. **Computed text**: Text content matching numbers combined with `%`, `×`, `▲`, `▼`, `+`, `-` (e.g., "+42%", "3.2× avg"). Insert before the text element:
      ```jsx
      {/* DATA: computed value — bind to prop */}
      ```
   3. **SVG chart coordinates**: `points`, `d`, `cx`/`cy` attributes on chart SVG elements (`<polyline>`, `<path>`, `<circle>`, `<rect>` inside chart containers — not icons). Insert before the SVG element:
      ```jsx
      {/* DATA: chart coordinates — replace with real data */}
      ```
   4. **Template text**: Mixed static + interpolated text where part is a label and part is a data value (e.g., "3/5 tickets COMPLEX"). Insert before the text element:
      ```jsx
      {/* DATA: template — decompose into static + dynamic parts */}
      ```

   **Exclusions — do NOT annotate:**
   - Colors in style objects (`backgroundColor`, `color`, `borderColor` in `style={{...}}`) that are uniform across siblings — these are design tokens, not data
   - Spacing values (`padding`, `margin`, `gap`)
   - Border radius values
   - Font sizes, font weights, line heights
   - Static label text (ALL CAPS headings, section titles)

   After inserting all annotations, re-save the JSX file.

### Structural contract comment format

```jsx
{/*
  STRUCTURAL CONTRACT v2 — {N} direct children
  Roles: {role1} | {role2} | {role3 ×N}
  Labels: {comma-separated static labels from depth ≤ 3, max 20, tree-traversal order; dynamic values included for structural reference only}
  Pattern: {N siblings × M children each at depth D} ({fixed|variable-count})
  Count: {fixed|variable} — {brief rationale, e.g., "data-driven, design shows 6 representative rows"}
  PRESERVE: all children, all labels, all repeating groups
*/}
<div style={{ ... }}>
  ...
</div>
```

**Rules:**
- Line 1: `STRUCTURAL CONTRACT v2 — N direct children` (always present; `v2` for format versioning)
- Line 2: `Roles:` semantic role for each direct child, joined with ` | `. Consecutive identical roles collapse to `×N` (e.g., `section-header | data-row ×6`). Always present.
- Line 3: `Labels:` followed by text strings in tree-traversal order. If no text nodes at depth ≤ 3 (or ≤ 4 on fallback): `Labels: (none — N Image, M SVG, K Frame nodes)` (per-type count)
- Line 4: `Pattern:` only if ≥3 siblings with same child count detected. Append `(fixed)` or `(variable-count)` per Step 3a.6 classification. Omit line entirely if no pattern.
- Line 5: `Count:` only present when Pattern line exists. `fixed` or `variable`, followed by dash and brief rationale.
- Last line: `PRESERVE: all children, all labels, all repeating groups` (always present, verbatim)
- Total: 4-6 lines. No blank lines. No explanatory paragraphs.

**Kebab-case conversion**: lowercase, replace spaces/underscores with hyphens, strip non-alphanumeric characters except hyphens.

Example: layer name `"Executive Summary"` → `sections/executive-summary.jsx`

### 3d. Generate behavior.md

Infer behavioral specifications from design structure patterns. This captures information that is invisible in static JSX but critical for a working implementation.

**This file MUST be written even when all tables are empty.** Use "None detected" content for empty tables rather than omitting the file.

1. **Conditional styling**: Scan all section JSX for cases where visually similar elements use different colors. For example, if one badge is `#EF4444` (red) and another is `#F59E0B` (amber) within the same section, that implies threshold-based conditional rendering.
2. **Empty/loading states**: For every section classified as `variable-count` in Step 3a.6, infer that the implementation needs an empty state (0 items) and possibly a loading state.
3. **Variable-count sections**: Summarize which sections show representative data vs fixed structure.

Write `behavior.md`:

```markdown
# Behavior Spec: {spec-identifier}

> All inferences below are best-guesses from static design analysis. Override with product requirements where they conflict.

## Conditional Styling
| Section | Element | Condition (inferred) | Variants |
|---------|---------|---------------------|----------|
| {section} | {element description} | {threshold/state-based} | {color1 for X, color2 for Y} |

## Empty / Loading States
| Section | Trigger | Behavior (inferred) |
|---------|---------|-------------------|
| {section} | 0 data items | Show placeholder message (design shows N items) |

## Variable-Count Sections
| Section | Design Shows | Likely Intent |
|---------|-------------|---------------|
| {section} | {N} items | {description, e.g., "Top N, data-dependent"} |
```

If no conditional styling is detected, omit that table (keep the heading with "None detected"). Same for empty states. Always include the Variable-Count table if any `variable-count` patterns were found in Step 3a.6.

### 3e. Generate charts.md + inline CHART comments

SVG chart elements in JSX (polylines, rects, circles) are meaningless coordinates to implementing agents. This step extracts chart semantics.

**This file MUST be written even when no charts are detected.** Write `No charts detected in this design.` as the content.

1. For each section JSX, detect chart patterns (apply in order — more specific rules take priority over general):
   **Important**: These heuristics target data visualization SVGs, not icons or decorative artwork. Skip SVG elements that are likely icons (single `<path>` in a small container ≤ 48px, or inside elements with `role`, `aria-label`, or class names suggesting icons). Only flag SVGs as charts when multiple data-like elements (≥3 `<rect>`, `<circle>`, or coordinate pairs in `<polyline>`/`<path>`) suggest structured data.
   - A single `<polyline>` in a small container (< 300px wide) → sparkline
   - `<polyline>` or `<path>` with `points` or `d` attributes → line/area chart
   - Multiple `<rect>` elements with varying heights/widths → bar chart
   - `<circle>` elements → scatter or dot markers
2. For each detected chart, extract:
   - Chart type (line, bar, area, sparkline, scatter)
   - Container dimensions from parent element's width/height styles
   - Number of data points (count coordinate pairs in `points`, or count `<rect>` / `<circle>` elements)
   - Axis labels (scan sibling/nearby text nodes for axis-like content — dates on X, numbers with units on Y)
   - Color(s) used (stroke and fill values on chart elements)
   - Grid presence (dashed lines near the chart)
3. Write `charts.md`:

```markdown
# Chart Specifications: {spec-identifier}

## {section-name}
- **Type**: {multi-series area chart | bar chart | sparkline | ...}
- **Dimensions**: {W}×{H}
- **Series**: {count} ({description of what each series represents, if inferrable from axis labels or legend})
- **X-axis**: {label type, e.g., "dates (7 labels visible)"}
- **Y-axis**: {label type, e.g., "token count (K suffix)"}
- **Data points per series**: ~{N}
- **Colors**: {hex values from stroke/fill}
- **Grid**: {horizontal dashed | vertical dashed | none}
- **Notes**: {any special features — gradients, fill-to-zero, stacked, etc.}
```

If a section contains multiple charts, add a separate block for each (e.g., `### Chart 1: {description}`, `### Chart 2: {description}`) under the section heading.

4. In each section JSX file that contains charts, insert a `CHART:` comment directly above each `<svg` element (not just the first):

```jsx
{/* CHART: {type}, {N} series, ~{M} points each, {W}×{H}
    X-axis: {description} | Y-axis: {description}
    Series colors: {hex1}, {hex2}, ...
    Implementor: use real data; coordinates below are placeholder layout only */}
<svg ...>
```

Re-write the JSX file with the CHART comment inserted. If a section has no charts, skip it.

If chart detection finds NO chart SVG elements in a section whose structural contract Roles line contains `chart`, update the structural contract to change `chart` to `content-block` before re-writing the file.

Conversely, if chart SVG elements ARE found in a section whose structural contract Roles line does NOT contain `chart`, update the Roles line to change the relevant role (e.g., `content-block`) to `chart`.

If no charts are detected in any section, write `charts.md` with a single line: `No charts detected in this design.`

### 3f. Generate css-warnings.md

Paper's JSX export may include CSS values that are valid in browsers but problematic in React inline styles.

**This file MUST be written even when no issues are found.** Write `No CSS compatibility issues detected.` as the content.

1. Scan all section JSX files for these patterns:
   - CSS functions as numeric style values: `round()`, `clamp()`, `min()`, `max()`, `calc()` — these work in React inline styles ONLY as string values (e.g., `width: 'clamp(200px, 50%, 400px)'`). If Paper exports them as bare values without quotes, they need string wrapping. Flag each occurrence with the correct string form.
   - CSS custom properties: `var(--...)` — works in React inline styles as string values (e.g., `color: 'var(--primary)'`). Flag if not already string-wrapped.
   - `round()` specifically — limited browser support as of 2025; suggest computing the rounded value in JavaScript before applying as a style (CSS `round()` operates on values with units at layout time, so there is no direct `Math.round()` equivalent).
   - Non-standard values that won't parse in JavaScript style objects.
2. Write `css-warnings.md`:

```markdown
# CSS Compatibility Warnings: {spec-identifier}

| File | Property | Value | Issue | Suggested Fix |
|------|----------|-------|-------|---------------|
| {filename}.jsx | {property} | {value} | {description} | {fix} |
```

If no issues found, write: `No CSS compatibility issues detected.`

---

## Step 4: Extract Design Tokens

1. Collect a representative sample of node IDs: all section roots plus 2-3 key text/color nodes per section (e.g., headings, accent-colored elements).
2. Call `get_computed_styles` on these nodes (batch into a single call).
3. Distill into `styles.json`:

```json
{
  "colors": {
    "primary": "#...",
    "secondary": "#...",
    "background": "#...",
    "text": "#...",
    "accent": "#..."
  },
  "typography": {
    "heading": { "fontFamily": "...", "fontSize": "...", "fontWeight": "...", "lineHeight": "..." },
    "subheading": { "fontFamily": "...", "fontSize": "...", "fontWeight": "...", "lineHeight": "..." },
    "body": { "fontFamily": "...", "fontSize": "...", "fontWeight": "...", "lineHeight": "..." },
    "caption": { "fontFamily": "...", "fontSize": "...", "fontWeight": "...", "lineHeight": "..." }
  },
  "spacing": {
    "sectionGap": "...",
    "groupGap": "...",
    "elementGap": "..."
  },
  "borders": {
    "radius": "...",
    "color": "...",
    "width": "..."
  }
}
```

Populate only the keys you observe — omit any category with no clear data.

---

## Step 5: Capture Screenshot via HTTP

Paper MCP's `get_screenshot` tool returns image data inline in the conversation — the agent can see it visually but **cannot extract the raw bytes to write to disk**. Use the Paper MCP HTTP endpoint directly instead:

```bash
# 1. Initialize MCP session
curl -s -D /tmp/paper_headers.txt -X POST "${BASE_URL:-http://localhost:29979}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"export-design","version":"1.0.0"}}}'
SESSION_ID=$(grep -i "mcp-session-id" /tmp/paper_headers.txt | cut -d' ' -f2 | tr -d '\r')

# 2. Send initialized notification
curl -s -X POST "${BASE_URL:-http://localhost:29979}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'

# 3. Call get_screenshot, capture SSE response
curl -s -X POST "${BASE_URL:-http://localhost:29979}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_screenshot","arguments":{"nodeId":"ARTBOARD_ID","scale":2,"transparent":false}}}' \
  -o /tmp/paper_screenshot_response.raw

# 4. Extract base64 and decode to PNG
python3 -c "
import json, base64
with open('/tmp/paper_screenshot_response.raw') as f:
    for line in f.read().split('\n'):
        if line.startswith('data: '):
            parsed = json.loads(line[6:])
            img = parsed['result']['content'][0]['data']
            with open('OUTPUT_PATH/screenshot.png', 'wb') as out:
                out.write(base64.b64decode(img))
            break
"
```

Replace `ARTBOARD_ID` with the actual artboard ID from Step 1, and `OUTPUT_PATH` with `<repo-path>/pipeline-config/design-refs/<spec-identifier>`.

**Verify the screenshot is real** (not a placeholder):
```bash
ls -la OUTPUT_PATH/screenshot.png  # Must be > 10KB
```

If the file is under 10KB, the capture failed — re-run the curl sequence.

### Per-section screenshots

After the full-artboard screenshot is verified, capture a screenshot for each section using the **same** `$SESSION_ID`:

```bash
mkdir -p OUTPUT_PATH/sections

# Loop through each section node ID collected in Step 2
for SECTION in "SECTION_NODE_ID:kebab-case-name" "SECTION_NODE_ID_2:kebab-case-name-2"; do
  NODE_ID="${SECTION%%:*}"
  NAME="${SECTION##*:}"

  # Reuse the existing MCP session — no need to re-initialize
  curl -s -X POST "${BASE_URL:-http://localhost:29979}/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"get_screenshot\",\"arguments\":{\"nodeId\":\"$NODE_ID\",\"scale\":2,\"transparent\":false}}}" \
    -o /tmp/paper_section_response.raw

  python3 -c "
import json, base64
with open('/tmp/paper_section_response.raw') as f:
    for line in f.read().split('\n'):
        if line.startswith('data: '):
            parsed = json.loads(line[6:])
            img = parsed['result']['content'][0]['data']
            with open('OUTPUT_PATH/sections/${NAME}.png', 'wb') as out:
                out.write(base64.b64decode(img))
            break
"
done
```

Replace the `for SECTION in ...` list with the actual section node IDs and kebab-case names from Step 2. Replace `OUTPUT_PATH` as before.

**Verify each section screenshot:**
```bash
for f in OUTPUT_PATH/sections/*.png; do
  SIZE=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f")
  if [ "$SIZE" -lt 5120 ]; then
    echo "WARNING: $f is only ${SIZE} bytes — capture may have failed"
  fi
done
```

Each section screenshot must be > 5KB. If any fails, re-run the curl for that section.

---

## Step 6: Populate Component Mapping in structure.md

Now that all section JSX files with inline DATA annotations exist, populate the Component Mapping table that was stubbed in Step 2's `structure.md`.

1. For each section in the Sections table:
   - **Suggested Component Name**: PascalCase of the section layer name. Expand common abbreviations (e.g., "Per-Stage Utilization Trend" → `PerStageUtilizationTrend`). Drop redundant words if the name exceeds ~30 chars.
   - **Key Props**: Scan the section's JSX file for `{/* DATA: ... */}` annotations. For each annotation, derive a prop name using camelCase, scoped to the section (e.g., `totalTokens`, `outlier.zScore`). Group into arrays where the section has `variable-count` patterns (e.g., `outliers[]` instead of listing each outlier field).
2. Edit `structure.md` to fill in the Component Mapping table rows.

---

## Step 7: Write Bundle & Verify

Write all files to `<repo-path>/pipeline-config/design-refs/<spec-identifier>/`:

```
pipeline-config/design-refs/{spec-identifier}/
├── screenshot.png
├── structure.md          # Section hierarchy + Component Mapping + Implementation Contract
├── styles.json           # Design tokens (colors, typography, spacing, borders)
├── behavior.md           # Inferred empty states, conditional styling, variable-count sections
├── charts.md             # Chart semantics (type, series, axes, colors)
├── css-warnings.md       # React inline style compatibility warnings
└── sections/
    ├── <kebab-case-name>.jsx   # One per top-level artboard child (v2 contracts + CHART + DATA comments)
    └── <kebab-case-name>.png   # Per-section screenshot
```

### Quality Checklist (verify before declaring done)

**Bundle completeness:**
- [ ] Every top-level artboard child has a corresponding `.jsx` file in `sections/`
- [ ] Every top-level artboard child has a corresponding `.png` screenshot in `sections/` (each > 5KB)
- [ ] `screenshot.png` exists and is > 10KB (smaller means the capture failed)
- [ ] `styles.json` contains at least `colors` and `typography` keys
- [ ] `structure.md` lists all sections with dimensions, Component Mapping, and Implementation Contract
- [ ] Every section in `sections/` has both a `.jsx` and a matching `.png` file
- [ ] `behavior.md` exists (even if tables say "None detected")
- [ ] `css-warnings.md` exists (may be a single "no issues" line)
- [ ] `charts.md` exists (even if just "No charts detected in this design.")
- [ ] No node IDs appear in any output file

**Style fidelity:**
- [ ] Section filenames are kebab-case derived from Paper layer names
- [ ] Each JSX file references the font families from `structure.md` (e.g., grep for the primary font family)
- [ ] `grep -rl 'className=' sections/*.jsx` returns no matches (inline-styles format should not produce className attributes)
- [ ] At least 3 hex color values from `styles.json` appear in the corresponding JSX files (spot-check design token fidelity)

**Structural fidelity:**
- [ ] `grep -l 'STRUCTURAL CONTRACT v2' sections/*.jsx | wc -l` matches the total section count (minus any sections with `STRUCTURAL CONTRACT UNAVAILABLE`)
- [ ] Every structural contract (excluding `UNAVAILABLE` fallbacks) has a `Roles:` line
- [ ] Spot-check 3 sections: the "direct children" count in the comment matches the number of direct child elements inside the root wrapper element in the JSX below
- [ ] Pick 1 label string from each of min(5, total_sections) section comments. For each, verify the label text appears in the JSX below the comment (search for the text between `>` and `<` tags, not quoted strings).
- [ ] No section has `Labels: (none)` unless it truly contains zero text at depth ≤ 4

**Data & behavior fidelity:**
- [ ] Every section JSX containing a `CHART:` comment has a corresponding entry in `charts.md`
- [ ] Every `<svg` element in chart-containing JSX files has a `CHART:` comment directly above it (not just the first `<svg`)
- [ ] `structure.md` Component Mapping table has a row for every section
- [ ] Spot-check 3 sections: each JSX file with ambiguous data values has at least one `{/* DATA: ... */}` annotation
- [ ] JSX files with ambiguous data values contain `{/* DATA: ... */}` annotations (spot-check 2-3 sections)
- [ ] DATA annotations cover: conditional colors, computed text, SVG chart coordinates, template text — but NOT static style values

If any check fails, fix the issue before continuing.

---

## Gotchas

- **Node IDs are session-ephemeral.** Never include them in output files — they become meaningless once the Paper session ends.
- **NEVER convert from existing code.** The bundle must be generated exclusively from Paper MCP `get_jsx` calls. If existing code in the repo appears to match the design, ignore it — Paper's `get_jsx` output is the sole source of truth. Per D60, the design IS the implementation.
- **Structure is specification, not suggestion.** If the structural contract says "5 siblings × 2 children" with labels "Investigate", "Implement", "Review", "Merge", "Total" — the implementation must have 5 groups with those labels. Missing data → placeholder state ("—"), not omission.
- **Data gaps are the implementor's responsibility.** The export agent doesn't know the target data model. The structural contract shows what the design expects. The implementor documents gaps in the PR description.
- **Responsive behavior is out of scope.** The structural contract specifies desktop layout. Responsive breakpoints are implementation decisions.
- **Sections with no text nodes.** If `get_tree_summary` shows a section with only Image, SVG, or Frame nodes (no Text nodes at depth ≤ 3, and none at depth 4 on fallback), the Labels line becomes: `Labels: (none — N Image, M SVG, K Frame nodes)` (per-type count). The direct children count and pattern detection still apply.
- **Depth limit.** The structural contract uses `get_tree_summary(depth=4)`. Patterns nested beyond depth 4 (e.g., form fields inside modals inside cards) will not be detected. For complex designs with deeply nested structure, manually verify the JSX against the screenshot.
- **Commit the bundle.** The transport mechanism is `git push` → `git pull`. The bundle lives in the repo alongside pipeline configs.
- **One bundle per spec.** Re-running the skill overwrites the previous bundle for that spec-identifier.
- **`get_screenshot` cannot save to disk.** The Paper MCP tool returns image data inline in the conversation layer — the agent sees it visually but cannot extract raw bytes to write a file. Step 5 uses the Paper MCP HTTP endpoint directly via curl to get the base64 data and decode it. If you call `get_screenshot` normally, you'll end up with a tiny placeholder PNG instead of the actual screenshot.

## Related Skills

- `/spec-gen` — Generate structured specs from brain dumps, create parent issue in Draft
- `/spec-freeze` — Freeze a drafted spec into Linear sub-issues for autonomous pipeline execution
