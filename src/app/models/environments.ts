import type { Row } from "@wayfarer/core";
import { Meta, UUID } from "./collections";

export interface EnvironmentDoc {
  id: UUID;
  meta: Meta;
  name: string;
  description?: string;
  /** Ordered. A later enabled row wins over an earlier one of the same name. */
  vars: Row[];
  order: number;
}

export type EnvironmentId = UUID;

export const ENVIRONMENTS_FORMAT = "wayfarer/environments/2";
