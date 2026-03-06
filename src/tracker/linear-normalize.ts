import type { BlockerRef, Issue } from "../domain/model.js";
import { ERROR_CODES } from "../errors/codes.js";
import { TrackerError } from "./errors.js";
import type { IssueStateSnapshot } from "./tracker.js";

interface LinearConnection<TNode> {
  nodes?: TNode[];
}

interface LinearIssueNode {
  id?: unknown;
  identifier?: unknown;
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  branchName?: unknown;
  url?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  state?: {
    name?: unknown;
  } | null;
  labels?: LinearConnection<{
    name?: unknown;
  }> | null;
  inverseRelations?: LinearConnection<{
    type?: unknown;
    sourceIssue?: {
      id?: unknown;
      identifier?: unknown;
      state?: {
        name?: unknown;
      } | null;
    } | null;
  }> | null;
}

interface LinearIssueStateNode {
  id?: unknown;
  identifier?: unknown;
  state?: {
    name?: unknown;
  } | null;
}

export function normalizeLinearIssue(node: unknown): Issue {
  const issue = asLinearIssueNode(node);
  const id = requireString(issue.id, "issue.id");
  const identifier = requireString(issue.identifier, "issue.identifier");
  const title = requireString(issue.title, "issue.title");
  const state = requireString(issue.state?.name, "issue.state.name");

  return {
    id,
    identifier,
    title,
    description: optionalString(issue.description),
    priority: normalizePriority(issue.priority),
    state,
    branchName: optionalString(issue.branchName),
    url: optionalString(issue.url),
    labels: normalizeLabels(issue.labels),
    blockedBy: normalizeBlockedBy(issue.inverseRelations),
    createdAt: normalizeTimestamp(issue.createdAt),
    updatedAt: normalizeTimestamp(issue.updatedAt),
  };
}

export function normalizeLinearIssueState(node: unknown): IssueStateSnapshot {
  const issue = asLinearIssueStateNode(node);

  return {
    id: requireString(issue.id, "issue.id"),
    identifier: requireString(issue.identifier, "issue.identifier"),
    state: requireString(issue.state?.name, "issue.state.name"),
  };
}

function asLinearIssueNode(node: unknown): LinearIssueNode {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    throw new TrackerError(
      ERROR_CODES.linearUnknownPayload,
      "Linear issue payload was not an object.",
      { details: node },
    );
  }

  return node as LinearIssueNode;
}

function asLinearIssueStateNode(node: unknown): LinearIssueStateNode {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    throw new TrackerError(
      ERROR_CODES.linearUnknownPayload,
      "Linear issue state payload was not an object.",
      { details: node },
    );
  }

  return node as LinearIssueStateNode;
}

function requireString(value: unknown, field: string): string {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  throw new TrackerError(
    ERROR_CODES.linearUnknownPayload,
    `Linear payload field '${field}' was missing or invalid.`,
    { details: value },
  );
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizePriority(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function normalizeLabels(labels: LinearIssueNode["labels"]): string[] {
  const nodes = labels?.nodes;
  if (!Array.isArray(nodes)) {
    return [];
  }

  return nodes
    .map((entry) => (typeof entry?.name === "string" ? entry.name : null))
    .filter((entry): entry is string => entry !== null)
    .map((entry) => entry.toLowerCase());
}

function normalizeBlockedBy(
  inverseRelations: LinearIssueNode["inverseRelations"],
): BlockerRef[] {
  const nodes = inverseRelations?.nodes;
  if (!Array.isArray(nodes)) {
    return [];
  }

  return nodes.flatMap((relation) => {
    if (relation?.type !== "blocks") {
      return [];
    }

    return [normalizeBlocker(relation.sourceIssue)];
  });
}

function normalizeBlocker(
  sourceIssue:
    | {
        id?: unknown;
        identifier?: unknown;
        state?: {
          name?: unknown;
        } | null;
      }
    | null
    | undefined,
): BlockerRef {
  return {
    id: typeof sourceIssue?.id === "string" ? sourceIssue.id : null,
    identifier:
      typeof sourceIssue?.identifier === "string"
        ? sourceIssue.identifier
        : null,
    state:
      typeof sourceIssue?.state?.name === "string"
        ? sourceIssue.state.name
        : null,
  };
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }

  return parsed.toISOString();
}
