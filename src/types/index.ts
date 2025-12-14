export type CommandType =
  | "say"
  | "volume"
  | "motion"
  | "expression"
  | "listen"
  | "brightness"
  | "status";

export type CommandPayload =
  | { text: string }
  | { volume: number }
  | { motion: string }
  | { expression: string }
  | { listen: boolean }
  | { brightness: number }
  | Record<string, unknown>; // status uses empty payload

export type CommandRequest = {
  type: CommandType;
  payload: CommandPayload;
  userId: string;
  originalText?: string;
};

export type AckMessage = {
  id: string;
  status: "ok" | "error";
  message?: string;
};

export type StackState = {
  battery?: number;
  temperature?: number;
  listening?: boolean;
  lastMotion?: string;
  lastExpression?: string;
  brightness?: number;
  updatedAt?: string;
};

export type Intent = "CHAT" | "COMMAND" | "QUERY";
