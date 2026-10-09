import type { SecretEnvelope } from "@wayfarer/core";
import { Meta, UUID } from "./collections";

export interface SecretDoc {
  id: UUID;
  meta: Meta;
  name: string;
  environmentId?: UUID;
  envelope: SecretEnvelope;
}

export type SecretId = UUID;
