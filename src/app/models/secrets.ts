import type { SecretEnvelope } from "@wayfarer/core";
import { Meta } from "./collections";

export interface SecretDoc {
  id: string;
  meta: Meta;
  name: string;
  environmentId?: string;
  envelope: SecretEnvelope;
}
