// Structured logs: one JSON object per line.
//
// Only room codes, event names and error codes are ever logged. Never log a
// player's name, token, role, vote, card or any payload: logs are not secret
// storage, and Render keeps them.

let silent = false;
export function setSilent(value) {
  silent = value;
}

function write(level, event, fields) {
  if (silent) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...fields });
  (level === 'error' ? console.error : console.log)(line);
}

export const log = {
  info: (event, fields = {}) => write('info', event, fields),
  warn: (event, fields = {}) => write('warn', event, fields),
  // For errors, log the message and stack only: they come from our own code.
  error: (event, err, fields = {}) => write('error', event, { ...fields, message: err?.message, stack: err?.stack }),
};
