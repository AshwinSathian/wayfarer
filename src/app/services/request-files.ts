import { Injectable, inject } from "@angular/core";
import { fileIdsOf, newId, type FileRef, type RequestBody } from "@wayfarer/core";
import { Idb } from "../data/idb";
import { MAX_FILE_BYTES } from "../data/request-files";

/**
 * The files of multipart and binary bodies. A picked file is held here, in
 * memory, until its request is saved: only then is it written to the `files`
 * store, in the same transaction as the request. So an abandoned draft
 * leaves nothing behind.
 */
@Injectable({ providedIn: "root" })
export class RequestFiles {
  private readonly idb = inject(Idb);
  private readonly picked = new Map<string, Blob>();

  /** Takes a picked file and returns the reference a body holds, or the reason it is refused. */
  pick(file: File): FileRef | string {
    if (file.size > MAX_FILE_BYTES) {
      const megabytes = (file.size / (1024 * 1024)).toFixed(1);
      return `"${file.name}" is ${megabytes} MB. A file in a request body can be 50 MB at most.`;
    }
    const fileId = newId();
    this.picked.set(fileId, file);
    return { fileId, fileName: file.name };
  }

  /** The file's bytes, or undefined when this browser does not have them (a request that came from a file). */
  async read(fileId: string): Promise<Blob | undefined> {
    return this.picked.get(fileId) ?? (this.idb.memoryOnly() ? undefined : this.idb.readFile(fileId));
  }

  /** The picked files a body names: what a save has to store with the request. */
  unsaved(body: RequestBody): Map<string, Blob> {
    const files = new Map<string, Blob>();
    for (const id of fileIdsOf(body)) {
      const blob = this.picked.get(id);
      if (blob) files.set(id, blob);
    }
    return files;
  }
}
