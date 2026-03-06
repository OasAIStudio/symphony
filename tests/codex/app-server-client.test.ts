import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  CodexAppServerClient,
  type CodexAppServerClientError,
  type CodexClientEvent,
} from "../../src/codex/app-server-client.js";
import { ERROR_CODES } from "../../src/errors/codes.js";

const roots: string[] = [];
const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/codex-fake-server.mjs",
);

afterEach(async () => {
  await Promise.allSettled(
    roots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

describe("CodexAppServerClient", () => {
  it("launches the app-server, buffers partial stdout lines, and auto-resolves approvals/tool calls", async () => {
    const workspace = await createWorkspace();
    const events: CodexClientEvent[] = [];
    const client = createClient("happy", workspace, events);

    const result = await client.startSession({
      prompt: "Implement the ticket",
      title: "ABC-123: Example",
    });

    expect(result).toMatchObject({
      status: "completed",
      threadId: "thread-1",
      turnId: "turn-1",
      sessionId: "thread-1-turn-1",
      usage: {
        inputTokens: 14,
        outputTokens: 9,
        totalTokens: 23,
      },
      rateLimits: {
        requestsRemaining: 10,
        tokensRemaining: 1000,
      },
      message: "First turn finished",
    });

    expect(events.map((event) => event.event)).toContain("session_started");
    expect(events.map((event) => event.event)).toContain(
      "approval_auto_approved",
    );
    expect(events.map((event) => event.event)).toContain(
      "unsupported_tool_call",
    );
    expect(events.map((event) => event.event)).toContain("turn_completed");
    expect(events).toContainEqual(
      expect.objectContaining({
        event: "other_message",
        message: "diagnostic from stderr",
      } satisfies Partial<CodexClientEvent>),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        event: "notification",
        usage: {
          inputTokens: 11,
          outputTokens: 7,
          totalTokens: 18,
        },
      } satisfies Partial<CodexClientEvent>),
    );

    await client.close();
  });

  it("reuses the same thread id across continuation turns", async () => {
    const workspace = await createWorkspace();
    const events: CodexClientEvent[] = [];
    const client = createClient("happy", workspace, events);

    const first = await client.startSession({
      prompt: "First prompt",
      title: "ABC-123: Example",
    });
    const second = await client.continueTurn(
      "Continue the same issue",
      "ABC-123: Example",
    );

    expect(first.threadId).toBe("thread-1");
    expect(second.threadId).toBe("thread-1");
    expect(second.turnId).toBe("turn-2");
    expect(second.sessionId).toBe("thread-1-turn-2");

    const started = events.filter((event) => event.event === "session_started");
    expect(started).toHaveLength(2);
    expect(started[0]?.threadId).toBe("thread-1");
    expect(started[1]?.threadId).toBe("thread-1");
    expect(started[1]?.turnId).toBe("turn-2");

    await client.close();
  });

  it("fails the turn when the app-server asks for user input", async () => {
    const workspace = await createWorkspace();
    const events: CodexClientEvent[] = [];
    const client = createClient("user-input", workspace, events);

    await expect(
      client.startSession({
        prompt: "Need help?",
        title: "ABC-123: Example",
      }),
    ).rejects.toMatchObject({
      name: "CodexAppServerClientError",
      code: ERROR_CODES.codexUserInputRequired,
    } satisfies Partial<CodexAppServerClientError>);

    expect(events).toContainEqual(
      expect.objectContaining({
        event: "turn_input_required",
        errorCode: ERROR_CODES.codexUserInputRequired,
      }),
    );

    await client.close();
  });

  it("enforces read timeouts during the startup handshake", async () => {
    const workspace = await createWorkspace();
    const events: CodexClientEvent[] = [];
    const client = createClient("read-timeout", workspace, events, {
      readTimeoutMs: 50,
    });

    await expect(
      client.startSession({
        prompt: "Start",
        title: "ABC-123: Example",
      }),
    ).rejects.toMatchObject({
      name: "CodexAppServerClientError",
      code: ERROR_CODES.codexReadTimeout,
    } satisfies Partial<CodexAppServerClientError>);

    expect(events).toContainEqual(
      expect.objectContaining({
        event: "startup_failed",
      }),
    );
  });

  it("enforces per-turn timeouts after turn/start succeeds", async () => {
    const workspace = await createWorkspace();
    const events: CodexClientEvent[] = [];
    const client = createClient("turn-timeout", workspace, events, {
      turnTimeoutMs: 60,
      stallTimeoutMs: 500,
    });

    await expect(
      client.startSession({
        prompt: "Hang forever",
        title: "ABC-123: Example",
      }),
    ).rejects.toMatchObject({
      name: "CodexAppServerClientError",
      code: ERROR_CODES.codexTurnTimeout,
    } satisfies Partial<CodexAppServerClientError>);

    expect(events).toContainEqual(
      expect.objectContaining({
        event: "turn_ended_with_error",
        errorCode: ERROR_CODES.codexTurnTimeout,
      }),
    );

    await client.close();
  });

  it("sends the expected startup handshake payloads and advertises tools", async () => {
    const workspace = await createWorkspace();
    const capturePath = join(workspace, "requests.json");
    const client = createClient("capture-startup", workspace, [], {
      command: `${process.execPath} "${fixturePath}" capture-startup "${capturePath}"`,
      capabilities: {
        roots: ["workspace"],
      },
      tools: [
        {
          name: "linear_graphql",
          description: "Run one GraphQL operation",
        },
      ],
    });

    await expect(
      client.startSession({
        prompt: "Start",
        title: "ABC-123: Example",
      }),
    ).resolves.toMatchObject({
      status: "completed",
      threadId: "thread-1",
      turnId: "turn-1",
    });

    const requests = JSON.parse(await readFile(capturePath, "utf8")) as Array<{
      id?: number;
      method?: string;
      params?: Record<string, unknown>;
    }>;

    expect(
      requests.map((request) => request.method ?? `response:${request.id}`),
    ).toEqual(["initialize", "initialized", "thread/start", "turn/start"]);
    expect(requests[0]?.params).toEqual({
      clientInfo: {
        name: "symphony-ts",
        version: "0.1.0",
      },
      capabilities: {
        roots: ["workspace"],
      },
    });
    expect(requests[2]?.params).toMatchObject({
      approvalPolicy: "full-auto",
      sandbox: "workspace-write",
      cwd: workspace,
      tools: [
        {
          name: "linear_graphql",
          description: "Run one GraphQL operation",
        },
      ],
    });
    expect(requests[3]?.params).toMatchObject({
      threadId: "thread-1",
      cwd: workspace,
      title: "ABC-123: Example",
      approvalPolicy: "full-auto",
      sandboxPolicy: {
        type: "workspace-write",
      },
      input: [{ type: "text", text: "Start" }],
    });

    await client.close();
  });

  it("launches the command through bash -lc", async () => {
    const workspace = await createWorkspace();
    const shellMarkerPath = join(workspace, "shell.txt");
    const scriptPath = join(workspace, "server.mjs");
    await writeFile(
      scriptPath,
      [
        "import readline from 'node:readline';",
        "const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });",
        "rl.on('line', (line) => {",
        "  const message = JSON.parse(line);",
        "  if (message.method === 'initialize') {",
        "    process.stdout.write(JSON.stringify({ id: message.id, result: { serverInfo: { name: 'capture' } } }) + '\\n');",
        "    return;",
        "  }",
        "  if (message.method === 'thread/start') {",
        "    process.stdout.write(JSON.stringify({ id: message.id, result: { thread: { id: 'thread-1' } } }) + '\\n');",
        "    return;",
        "  }",
        "  if (message.method === 'turn/start') {",
        "    process.stdout.write(JSON.stringify({ id: message.id, result: { turn: { id: 'turn-1' } } }) + '\\n');",
        "    setTimeout(() => {",
        "      process.stdout.write(JSON.stringify({ method: 'turn/completed', params: { message: 'ok' } }) + '\\n');",
        "    }, 10);",
        "  }",
        "});",
      ].join("\n"),
      "utf8",
    );

    const client = createClient("happy", workspace, [], {
      command: `printf '%s' \"$0\" > "${shellMarkerPath}"; exec ${process.execPath} "${scriptPath}"`,
    });

    await expect(
      client.startSession({
        prompt: "Start",
        title: "ABC-123: Example",
      }),
    ).resolves.toMatchObject({
      status: "completed",
      sessionId: "thread-1-turn-1",
    });

    await expect(readFile(shellMarkerPath, "utf8")).resolves.toBe("bash");
    await client.close();
  });
});

function createClient(
  scenario: string,
  workspace: string,
  events: CodexClientEvent[],
  overrides?: Partial<{
    command: string;
    capabilities: Record<string, unknown>;
    readTimeoutMs: number;
    turnTimeoutMs: number;
    stallTimeoutMs: number;
    tools: Array<{
      name: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
    }>;
  }>,
): CodexAppServerClient {
  return new CodexAppServerClient({
    command:
      overrides?.command ?? `${process.execPath} "${fixturePath}" ${scenario}`,
    cwd: workspace,
    approvalPolicy: "full-auto",
    threadSandbox: "workspace-write",
    turnSandboxPolicy: {
      type: "workspace-write",
    },
    readTimeoutMs: overrides?.readTimeoutMs ?? 1_000,
    turnTimeoutMs: overrides?.turnTimeoutMs ?? 1_000,
    stallTimeoutMs: overrides?.stallTimeoutMs ?? 1_000,
    ...(overrides?.capabilities === undefined
      ? {}
      : { capabilities: overrides.capabilities }),
    ...(overrides?.tools === undefined ? {} : { tools: overrides.tools }),
    onEvent: (event) => {
      events.push(event);
    },
  });
}

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "symphony-task9-"));
  const workspace = join(root, "ABC-123");
  await mkdir(workspace, { recursive: true });
  roots.push(root);
  return workspace;
}
