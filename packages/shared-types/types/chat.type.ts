import { Chat, ChatMessage } from '@repo/db';
import { z } from 'zod';
import { UpdateChatSchema } from '../schemas';

export type ChatType = Chat & {
  chatMessages: ChatMessage[];
};

export type UpdateChatInput = z.infer<typeof UpdateChatSchema>;
