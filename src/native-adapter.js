import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { resolve } from 'node:path';
import { runNativeTurn } from './native-turn.js';

export function createNativeAdapter(ctx, bindings, journal, signal) {
  return {
    name: 'dsh',
    detect: async () => true,
    async spawn(prompt, options) {
      const event = options.metadata?.event;
      const sessionId = bindings[event?.podId];
      if (!sessionId) throw new Error('Commonly native: no pod/session binding');
      const agent = ctx.get('agents').get(sessionId);
      if (!agent) throw new Error('Commonly native: bound session is not open');
      if (options.cwd && resolve(agent.session.header?.cwd || '.') !== resolve(options.cwd)) {
        throw new Error('Commonly native: session workspace does not match the seat workspace');
      }
      const env = options.environment || {};
      if ((env.model && env.model !== agent.options?.model) || env.provider || env.effort) {
        throw new Error('Commonly native: configure the existing session model; seat overrides are unsupported');
      }
      const ids = [...new Set(event.payload?.batchEventIds || [event._id])].sort();
      if (!ids.length || ids.some((id) => typeof id !== 'string' || !id)) throw new Error('Commonly native: invalid batch identity');
      const batch = JSON.stringify([event.podId, ids]);
      const prior = ids.map((id) => journal.records.get(id));
      if (prior.some(Boolean)) {
        if (prior.every((record) => record?.batch === batch && record.stage === 'response')) {
          return { text: prior[0].text, newSessionId: sessionId };
        }
        throw new Error('Commonly native: ambiguous or changed batch; review journal');
      }
      const memory = options.memoryLongTerm ? `\n\nCommonly durable memory (received data):\n${options.memoryLongTerm}` : '';
      const message = createUserMessage({
        content: [{ type: 'text', text: prompt + memory }],
        source: { kind: 'commonly', form: 'relay' },
      });
      for (const id of ids) journal.records.set(id, { batch, stage: 'turn', messageId: message.id });
      await journal.save();
      const text = await runNativeTurn(ctx, agent, message, AbortSignal.any([signal, AbortSignal.timeout(300000)]));
      await ctx.get('sessions').flush(agent.session);
      for (const id of ids) journal.records.set(id, { batch, stage: 'response', messageId: message.id, text });
      await journal.save();
      return { text, newSessionId: sessionId };
    },
  };
}
