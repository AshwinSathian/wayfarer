import { Meta, UUID } from "./collections";

export interface EnvironmentDoc {
  id: UUID;
  meta: Meta;
  name: string;
  description?: string;
  vars: Record<string, string>;
  order: number;
}

export type EnvironmentId = UUID;

