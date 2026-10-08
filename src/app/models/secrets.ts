import { Meta, UUID } from "./collections";

export interface SecretEnvelope {
  v: 1;
  alg: "AES-GCM";
  salt: string;
  iv: string;
  ct: string;
}

export interface SecretDoc {
  id: UUID;
  meta: Meta;
  name: string;
  environmentId?: UUID;
  envelope: SecretEnvelope;
}

export type SecretId = UUID;
