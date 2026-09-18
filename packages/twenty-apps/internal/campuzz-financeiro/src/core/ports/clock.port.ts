/** O relogio como porta: caso de uso testavel sem congelar o relogio global. */
export type ClockPort = {
  nowIso(): string;
};
