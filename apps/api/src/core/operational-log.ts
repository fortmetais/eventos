type OperationalEvent = {
  level: "error" | "warn";
  event: string;
  type?: string;
};

export function logOperationalEvent({ level, event, type }: OperationalEvent) {
  console[level](
    JSON.stringify({
      level,
      event,
      ...(type === undefined ? {} : { type }),
    }),
  );
}
