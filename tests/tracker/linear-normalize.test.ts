import { describe, expect, it } from "vitest";

import { ERROR_CODES } from "../../src/errors/codes.js";
import {
  type TrackerError,
  normalizeLinearIssue,
  normalizeLinearIssueState,
} from "../../src/index.js";

describe("linear-normalize", () => {
  it("normalizes labels, blockers, integer priority, and timestamps", () => {
    const issue = normalizeLinearIssue({
      id: "issue-1",
      identifier: "ENG-123",
      title: "Implement adapter",
      description: "Tracker integration",
      priority: 2,
      branchName: "eng-123",
      url: "https://linear.app/eng/issue/ENG-123",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-02T12:34:56.789Z",
      state: {
        name: "Todo",
      },
      labels: {
        nodes: [{ name: "Backend" }, { name: "TRACKER" }],
      },
      inverseRelations: {
        nodes: [
          {
            type: "blocks",
            sourceIssue: {
              id: "issue-0",
              identifier: "ENG-100",
              state: {
                name: "In Progress",
              },
            },
          },
          {
            type: "relatesTo",
            sourceIssue: {
              id: "issue-x",
              identifier: "ENG-X",
              state: {
                name: "Todo",
              },
            },
          },
        ],
      },
    });

    expect(issue).toEqual({
      id: "issue-1",
      identifier: "ENG-123",
      title: "Implement adapter",
      description: "Tracker integration",
      priority: 2,
      state: "Todo",
      branchName: "eng-123",
      url: "https://linear.app/eng/issue/ENG-123",
      labels: ["backend", "tracker"],
      blockedBy: [
        {
          id: "issue-0",
          identifier: "ENG-100",
          state: "In Progress",
        },
      ],
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-02T12:34:56.789Z",
    });
  });

  it("returns null for non-integer priority and invalid timestamps", () => {
    const issue = normalizeLinearIssue({
      id: "issue-1",
      identifier: "ENG-123",
      title: "Implement adapter",
      priority: 1.5,
      createdAt: "not-a-date",
      updatedAt: null,
      state: {
        name: "Todo",
      },
    });

    expect(issue.priority).toBeNull();
    expect(issue.createdAt).toBeNull();
    expect(issue.updatedAt).toBeNull();
  });

  it("normalizes issue state snapshots for reconciliation", () => {
    expect(
      normalizeLinearIssueState({
        id: "issue-1",
        identifier: "ENG-123",
        state: {
          name: "Done",
        },
      }),
    ).toEqual({
      id: "issue-1",
      identifier: "ENG-123",
      state: "Done",
    });
  });

  it("rejects malformed issue payloads with a typed tracker error", () => {
    expect(() => normalizeLinearIssue(null)).toThrowError(
      expect.objectContaining<Partial<TrackerError>>({
        code: ERROR_CODES.linearUnknownPayload,
      }),
    );
  });
});
