// Tell React's scheduler this is a test environment so it wraps state
// updates in act() automatically and suppresses related warnings.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
