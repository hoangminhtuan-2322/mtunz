'use strict';

// A server window may resolve after a newer WebSocket event. Only replace the
// overlapping IDs; never discard already received messages outside the window.
function mergeRecentWindow(existing, recent) {
  if (!recent.length) return [...existing];
  const ids = recent.map(message => Number(message.id));
  const first = Math.min(...ids);
  const last = Math.max(...ids);
  const kept = existing.filter(message => Number(message.id) < first || Number(message.id) > last);
  return [...new Map([...kept, ...recent].map(message => [Number(message.id), message])).values()]
    .sort((left, right) => Number(left.id) - Number(right.id));
}

// Coalesce refresh intents without allowing a list-only event to cancel a
// pending catch-up from a reconnect (or vice versa).
function createRefreshQueue(flush, delay = 300) {
  let timer = null;
  let all = false;
  let stopped = false;
  const pending = new Set();
  const schedule = kinds => {
    if (stopped) return;
    if (kinds == null) all = true;
    else for (const kind of kinds) pending.add(kind);
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const work = all ? null : [...pending];
      pending.clear();
      all = false;
      if (!stopped) flush(work);
    }, delay);
  };
  const stop = () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending.clear();
  };
  return {schedule, stop};
}

module.exports = {createRefreshQueue, mergeRecentWindow};
