/**
 * Core message handler for the Slack bot.
 *
 * Receives messages via the Chat SDK, manages reaction indicators,
 * invokes Claude Code via the AI SDK streamText, and posts threaded replies.
 * Supports session continuity (thread replies resume CC sessions) and
 * runtime channel-to-project mapping via /project set slash commands.
 */
import { streamText } from "ai";
import { claudeCode } from "ai-sdk-provider-claude-code";
import type { Adapter, Message, Thread } from "chat";

import { resolveClaudeModelId } from "../runners/claude-code-runner.js";
import type { CcSessionStore } from "./session-store.js";
import { getCcSessionId, setCcSessionId } from "./session-store.js";
import { parseSlashCommand } from "./slash-commands.js";
import type { ChannelProjectMap, SessionMap } from "./types.js";

export interface HandleMessageOptions {
  /** Channel ID → project directory mapping */
  channelMap: ChannelProjectMap;
  /** In-memory session store */
  sessions: SessionMap;
  /** In-memory CC session store (thread ID → CC session ID) */
  ccSessions: CcSessionStore;
  /** Claude Code model identifier (default: "sonnet") */
  model?: string;
}

/**
 * Split a response into paragraph-sized chunks at `\n\n` boundaries.
 * Returns the original text as a single-element array if no paragraph breaks exist.
 */
export function splitAtParagraphs(text: string): string[] {
  const chunks = text.split(/\n\n+/).filter((chunk) => chunk.trim().length > 0);
  return chunks.length > 0 ? chunks : [text];
}

/**
 * Creates a message handler function for use with `chat.onNewMessage()`.
 */
export function createMessageHandler(options: HandleMessageOptions) {
  const { channelMap, sessions, ccSessions, model = "sonnet" } = options;

  return async (thread: Thread, message: Message): Promise<void> => {
    const adapter: Adapter = thread.adapter;

    // Check for slash commands before anything else
    const command = parseSlashCommand(message.text);
    if (command) {
      if (command.type === "project-set") {
        channelMap.set(thread.channelId, command.path);
        await thread.post(
          `Project directory for this channel set to \`${command.path}\`.`,
        );
      }
      return;
    }

    // Add eyes reaction to indicate processing
    await adapter.addReaction(thread.id, message.id, "eyes");

    try {
      // Resolve channel → project directory
      const projectDir = channelMap.get(thread.channelId);
      if (!projectDir) {
        await thread.post(
          `No project directory mapped for channel \`${thread.channelId}\`. Please configure a channel-to-project mapping.`,
        );
        await adapter.removeReaction(thread.id, message.id, "eyes");
        await adapter.addReaction(thread.id, message.id, "warning");
        return;
      }

      // Track session
      sessions.set(thread.id, {
        channelId: thread.channelId,
        projectDir,
        lastActiveAt: new Date(),
      });

      // Build CC provider options with session continuity
      const resolvedModel = resolveClaudeModelId(model);
      const existingSessionId = getCcSessionId(ccSessions, thread.id);
      const ccOptions: {
        cwd: string;
        permissionMode: "bypassPermissions";
        resume?: string;
      } = {
        cwd: projectDir,
        permissionMode: "bypassPermissions",
      };
      if (existingSessionId) {
        ccOptions.resume = existingSessionId;
      }

      // Invoke Claude Code via AI SDK streamText
      const result = streamText({
        model: claudeCode(resolvedModel, ccOptions),
        prompt: message.text,
      });

      // Collect full response text for paragraph chunking
      let fullText = "";
      for await (const chunk of result.textStream) {
        fullText += chunk;
      }

      // Extract and store session ID from provider metadata for continuity
      const response = await result.response;
      const lastMsg = response.messages?.[response.messages.length - 1] as
        | { providerMetadata?: { "claude-code"?: { sessionId?: string } } }
        | undefined;
      const ccSessionId = lastMsg?.providerMetadata?.["claude-code"]?.sessionId;
      if (ccSessionId) {
        setCcSessionId(ccSessions, thread.id, ccSessionId);
      }

      // Split at paragraph boundaries and post each chunk as a thread reply
      const chunks = splitAtParagraphs(fullText);
      for (const chunk of chunks) {
        await thread.post(chunk);
      }

      // Replace eyes with checkmark on success
      await adapter.removeReaction(thread.id, message.id, "eyes");
      await adapter.addReaction(thread.id, message.id, "white_check_mark");
    } catch (error) {
      // Replace eyes with error indicator on failure
      await adapter.removeReaction(thread.id, message.id, "eyes");
      await adapter.addReaction(thread.id, message.id, "x");

      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      await thread.post(`Error: ${errorMessage}`);
    }
  };
}
