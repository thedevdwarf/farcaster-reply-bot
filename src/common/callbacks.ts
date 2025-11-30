import { Content, HandlerCallback, IAgentRuntime, logger, Memory, UUID } from '@elizaos/core';
import { Cast as NeynarCast } from '@neynar/nodejs-sdk/build/api';
import { FarcasterClient } from '../client';
import { CastId, FarcasterConfig } from './types';
import { createCastMemory, neynarCastToCast } from './utils';

export function standardCastHandlerCallback({
  client,
  runtime,
  config,
  roomId,
  onCompletion,
  onError,
  inReplyTo,
}: {
  inReplyTo?: CastId;
  client: FarcasterClient;
  runtime: IAgentRuntime;
  config: FarcasterConfig;
  roomId: UUID;
  onCompletion?: (casts: NeynarCast[], memories: Memory[]) => Promise<void>;
  onError?: (error: unknown) => Promise<void>;
}): HandlerCallback {
  const callback: HandlerCallback = async (content: Content, _files?: any) => {
    logger.info(`[Farcaster Callback] Received content to post: "${content.text?.substring(0, 50)}..."`);
    try {
      if (config.FARCASTER_DRY_RUN) {
        logger.info(`[Farcaster] Dry run enabled. Would have posted: ${content.text}`);
        return [];
      }

      logger.debug(`[Farcaster Callback] Sending cast to API...`);
      const casts = await client.sendCast({ content, inReplyTo });

      if (casts.length === 0) {
        logger.warn('[Farcaster Callback] No casts returned from API (empty array)');
        return [];
      }

      const memories: Memory[] = [];
      for (let i = 0; i < casts.length; i++) {
        const cast = casts[i];
        logger.success(`[Farcaster Callback] Successfully published cast ${cast.hash}`);

        const memory = createCastMemory({
          roomId,
          senderId: runtime.agentId,
          runtime,
          cast: neynarCastToCast(cast),
        });

        if (i === 0) {
          // sendCast removes the response action, so we need to add it back here
          memory.content.actions = content.actions;
        }

        await runtime.createMemory(memory, 'messages');
        memories.push(memory);
      }

      if (onCompletion) {
        await onCompletion(casts, memories);
      }

      return memories;
    } catch (error) {
      logger.error('[Farcaster Callback] Error posting cast:', error instanceof Error ? error.message : String(error));
      
      if (onError) {
        await onError(error);
      }

      return [];
    }
  };

  return callback;
}
