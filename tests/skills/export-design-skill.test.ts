import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SKILL_PATH = resolve(__dirname, "../../skills/export-design/SKILL.md");
const skillContent = readFileSync(SKILL_PATH, "utf-8");

describe("export-design SKILL.md", () => {
  describe("Step 3b: Inline DATA annotations", () => {
    it("contains Step 3b heading for DATA annotations", () => {
      expect(skillContent).toContain("### 3b. Export JSX");
    });

    it("specifies the DATA comment syntax", () => {
      expect(skillContent).toContain("{/* DATA:");
    });

    it("covers conditional colors pattern", () => {
      expect(skillContent).toMatch(/conditional colors/i);
      expect(skillContent).toContain("DATA: color indicates threshold/status");
    });

    it("covers computed text pattern (numbers with units)", () => {
      expect(skillContent).toMatch(/computed text/i);
      expect(skillContent).toContain("`%`, `×`, `▲`, `▼`");
    });

    it("covers SVG chart coordinates pattern", () => {
      expect(skillContent).toMatch(/SVG chart coordinates/i);
      expect(skillContent).toContain(
        "DATA: chart coordinates — replace with real data",
      );
    });

    it("covers template text pattern", () => {
      expect(skillContent).toMatch(/template text/i);
      expect(skillContent).toContain(
        "DATA: template — decompose into static + dynamic parts",
      );
    });

    it("explicitly excludes static style values from annotation", () => {
      expect(skillContent).toContain("do NOT annotate");
      expect(skillContent).toMatch(
        /colors in style objects.*that are uniform across siblings/i,
      );
      expect(skillContent).toMatch(/spacing.*padding.*margin/i);
    });

    it("specifies re-save after annotation insertion", () => {
      expect(skillContent).toContain(
        "After inserting all annotations, re-save the JSX file.",
      );
    });
  });

  describe("Per-section screenshots", () => {
    it("contains per-section screenshots heading", () => {
      expect(skillContent).toContain("### Per-section screenshots");
    });

    it("uses $BASE_URL for the HTTP endpoint (no hardcoded localhost)", () => {
      // All curl commands should use ${BASE_URL:-...} pattern
      const curlLines = skillContent
        .split("\n")
        .filter((line) => line.includes("curl") && line.includes("/mcp"));
      expect(curlLines.length).toBeGreaterThan(0);
      for (const line of curlLines) {
        expect(line).toContain("${BASE_URL:-");
      }
    });

    it("re-uses existing MCP session from Step 5", () => {
      expect(skillContent).toContain("same** `$SESSION_ID`");
    });

    it("specifies minimum file size threshold for section screenshots", () => {
      expect(skillContent).toMatch(/section screenshot.*>.*5KB/i);
    });

    it("keeps full-artboard screenshot alongside per-section screenshots", () => {
      expect(skillContent).toContain("full-artboard screenshot is verified");
    });
  });

  describe("Bundle structure", () => {
    it("includes section .png files in the bundle tree", () => {
      expect(skillContent).toContain("<kebab-case-name>.png");
    });

    it("includes section .jsx files in the bundle tree", () => {
      expect(skillContent).toContain("<kebab-case-name>.jsx");
    });

    it("preserves structural contract v2 references", () => {
      expect(skillContent).toContain("STRUCTURAL CONTRACT v2");
      expect(skillContent).not.toContain("STRUCTURAL CONTRACT v3");
    });

    it("does not include data-map.md in the bundle", () => {
      expect(skillContent).not.toContain("data-map.md");
      expect(skillContent).not.toContain("data-map");
    });
  });

  describe("Quality checklist", () => {
    it("includes per-section PNG verification", () => {
      expect(skillContent).toContain(
        "Every section in `sections/` has both a `.jsx` and a matching `.png` file",
      );
    });

    it("includes inline annotation spot-check", () => {
      expect(skillContent).toContain(
        "Spot-check 3 sections: each JSX file with ambiguous data values has at least one `{/* DATA: ... */}` annotation",
      );
    });

    it("preserves existing checklist items", () => {
      expect(skillContent).toContain(
        "Every top-level artboard child has a corresponding `.jsx` file",
      );
      expect(skillContent).toContain("`screenshot.png` exists and is > 10KB");
      expect(skillContent).toContain(
        "`styles.json` contains at least `colors` and `typography` keys",
      );
      expect(skillContent).toContain(
        "`structure.md` lists all sections with dimensions",
      );
      expect(skillContent).toContain("No node IDs appear in any output file");
    });

    it("does not reference data-map.md in checklist", () => {
      const checklistSection = skillContent.split("Quality Checklist")[1];
      expect(checklistSection).not.toContain("data-map");
    });
  });

  describe("MUST-write instructions for artifact reliability", () => {
    it("requires behavior.md to be written even when empty", () => {
      expect(skillContent).toContain(
        "**This file MUST be written even when all tables are empty.**",
      );
    });

    it("requires charts.md to be written even when no charts detected", () => {
      expect(skillContent).toContain(
        "**This file MUST be written even when no charts are detected.**",
      );
    });

    it("requires css-warnings.md to be written even when no issues found", () => {
      expect(skillContent).toContain(
        "**This file MUST be written even when no issues are found.**",
      );
    });
  });

  describe("Step 6: Component Mapping derives from DATA annotations", () => {
    it("references DATA annotations instead of data-map.md", () => {
      const step6Section = skillContent.split(
        "## Step 6: Populate Component Mapping",
      )[1];
      expect(step6Section).toContain(
        "section JSX files with inline DATA annotations",
      );
      expect(step6Section).toContain(
        "Scan the section's JSX file for `{/* DATA: ... */}` annotations",
      );
      expect(step6Section).not.toContain("data-map.md");
    });
  });

  describe("Implementation Contract references", () => {
    it("derives prop bindings from DATA annotations, not data-map.md", () => {
      expect(skillContent).toContain(
        "Derive prop bindings from inline `{/* DATA: ... */}` annotations",
      );
    });

    it("references DATA annotations in Component Mapping column header", () => {
      expect(skillContent).toContain("Key Props (from DATA annotations)");
    });
  });

  describe("No hardcoded localhost", () => {
    it("does not contain bare localhost or 127.0.0.1 URLs", () => {
      // All localhost refs should be inside ${BASE_URL:-...} fallback patterns
      const lines = skillContent.split("\n");
      for (const line of lines) {
        if (line.includes("localhost") || line.includes("127.0.0.1")) {
          // Must be inside a ${BASE_URL:-...} pattern
          expect(line).toMatch(/\$\{BASE_URL:-/);
        }
      }
    });
  });
});
