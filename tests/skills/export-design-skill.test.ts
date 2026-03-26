import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SKILL_PATH = resolve(__dirname, "../../skills/export-design/SKILL.md");
const skillContent = readFileSync(SKILL_PATH, "utf-8");

describe("export-design SKILL.md", () => {
  describe("Step 3b: Inline DATA annotations", () => {
    it("contains Step 3b heading for DATA annotations", () => {
      expect(skillContent).toContain(
        "### Step 3b: Annotate Ambiguous Dynamic Values",
      );
    });

    it("specifies the DATA comment syntax", () => {
      expect(skillContent).toContain("{/* DATA:");
    });

    it("covers conditional colors pattern", () => {
      expect(skillContent).toMatch(/conditional colors/i);
      expect(skillContent).toContain("trendColor[m.trend]");
    });

    it("covers computed text pattern (numbers with units)", () => {
      expect(skillContent).toMatch(/computed text/i);
      expect(skillContent).toMatch(/(%, ×, K, M)/);
    });

    it("covers SVG chart coordinates pattern", () => {
      expect(skillContent).toMatch(/SVG chart coordinates/i);
      expect(skillContent).toContain("toPath(s.data)");
    });

    it("covers template text mixing labels with values", () => {
      expect(skillContent).toMatch(/template text mixing labels with values/i);
      expect(skillContent).toContain("Last updated: {lastUpdated}");
    });

    it("explicitly excludes static style values from annotation", () => {
      expect(skillContent).toContain("Do NOT annotate");
      expect(skillContent).toMatch(
        /colors in.*style.*objects that are constant/i,
      );
      expect(skillContent).toMatch(/spacing.*padding.*margin/i);
    });

    it("specifies in-place annotation (no separate file)", () => {
      expect(skillContent).toContain(
        "Apply annotations in-place within each `sections/<name>.jsx` file",
      );
      expect(skillContent).toContain(
        "Do not create a separate file for annotations",
      );
    });

    it("provides before/after annotation example", () => {
      // Before example
      expect(skillContent).toContain("{trendIcon[m.trend]} {m.delta}");
      // After example with DATA comments
      expect(skillContent).toContain("{/* DATA: color varies by trend status");
      expect(skillContent).toContain("{/* DATA: delta percentage value");
    });
  });

  describe("Step 5b: Per-section screenshots", () => {
    it("contains Step 5b heading for per-section screenshots", () => {
      expect(skillContent).toContain(
        "### Step 5b: Capture Per-Section Screenshots",
      );
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

    it("saves per-section screenshots to sections/<kebab-case-name>.png", () => {
      expect(skillContent).toContain("sections/SECTION_NAME.png");
    });

    it("re-uses existing MCP session from Step 5", () => {
      expect(skillContent).toContain(
        "Re-use the existing $SESSION_ID from Step 5",
      );
    });

    it("specifies minimum file size threshold for section screenshots", () => {
      expect(skillContent).toMatch(/each.*>.*5KB/i);
    });

    it("keeps full-artboard screenshot alongside per-section screenshots", () => {
      expect(skillContent).toContain(
        "full-artboard screenshot (`screenshot.png`) is always kept",
      );
    });
  });

  describe("Bundle structure", () => {
    it("includes section .png files in the bundle tree", () => {
      expect(skillContent).toContain("<kebab-case-name>.png");
    });

    it("includes section .jsx files with DATA annotations in the bundle tree", () => {
      expect(skillContent).toContain("(with DATA annotations)");
    });

    it("preserves structural contract v2 references", () => {
      // The skill should not alter the structural contract format
      expect(skillContent).not.toContain("STRUCTURAL CONTRACT v3");
    });
  });

  describe("Quality checklist", () => {
    it("includes DATA annotation check", () => {
      expect(skillContent).toContain(
        "Each `.jsx` file contains `{/* DATA: ... */}` annotations",
      );
    });

    it("includes per-section screenshot check", () => {
      expect(skillContent).toContain(
        "Every section has a corresponding `.png` file in `sections/`",
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
