// Correlate one identified relay with its durable dsh turn, never process-wide idle.
export function runNativeTurn(ctx, agent, message, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let turn;
    let currentTurn;
    let answer = '';
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      off();
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(value);
    };
    const abort = () => finish(new Error('Commonly turn interrupted; review the pending journal entry'));
    const off = ctx.on('session/event', (session, event) => {
      if (session !== agent.session) return;
      if (event.type === 'turn/start') currentTurn = event.data.turn;
      if (event.type === 'user/message' && event.data.id === message.id) turn = currentTurn;
      if (turn === undefined) return;
      if (event.type === 'assistant/message' && event.data.turn === turn && !event.data.interrupted) {
        // Only the final assistant message is posted; tool-step chatter stays in dsh.
        const text = event.data.message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
        if (text.trim()) answer = text;
      }
      if (event.type === 'turn/end' && event.data.turn === turn) {
        if (event.data.reason.kind !== 'completed') finish(new Error('Commonly turn did not complete'));
        else finish(null, answer);
      }
    });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    else {
      try { agent.followup(message); } catch (error) { finish(error); }
    }
  });
}
