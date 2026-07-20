interface ParsePrettyJob {
  kind: "parse-pretty";
  input: string;
  indent?: number;
}

interface MinifyJob {
  kind: "minify";
  input: string;
}

interface SearchJob {
  kind: "search";
  input: string;
  query: string;
}

type Job = ParsePrettyJob | MinifyJob | SearchJob;

interface WorkerRequest {
  id: number;
  job: Job;
}

interface SearchExcerpt {
  index: number;
  context: string;
}

interface SearchResult {
  count: number;
  excerpts: SearchExcerpt[];
}

interface WorkerSuccess {
  id: number;
  ok: true;
  result: string | SearchResult;
}

interface WorkerFailure {
  id: number;
  ok: false;
  error: string;
}

type WorkerResponse = WorkerSuccess | WorkerFailure;

const CONTEXT_RADIUS = 48;
const MAX_EXCERPTS = 50;

const selfRef = self as unknown as DedicatedWorkerGlobalScope;

const respond = (response: WorkerResponse): void => selfRef.postMessage(response);

selfRef.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, job } = event.data;

  Promise.resolve(handleJob(job))
    .then((result) => {
      respond({ id, ok: true, result });
    })
    .catch((error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
          ? error
          : "Unknown error";
      respond({ id, ok: false, error: message });
    });
};

function handleJob(job: Job): string | SearchResult {
  switch (job.kind) {
    case "parse-pretty":
      return parsePretty(job.input, job.indent);
    case "minify":
      return minify(job.input);
    case "search":
      return search(job.input, job.query);
    default:
      throw new Error(`Unsupported job kind: ${(job as Job).kind}`);
  }
}

function parsePretty(input: string, indent = 2): string {
  const value = JSON.parse(input);
  return JSON.stringify(value, null, indent ?? 2);
}

function minify(input: string): string {
  const value = JSON.parse(input);
  return JSON.stringify(value);
}

function search(input: string, rawQuery: string): SearchResult {
  const query = rawQuery.trim();
  if (!query) {
    return { count: 0, excerpts: [] };
  }

  const haystack = input;

  // TODO: Support JSONPath when a utility is available in the application bundle.
  const lowerHaystack = haystack.toLowerCase();
  const lowerNeedle = query.toLowerCase();
  const excerpts: SearchExcerpt[] = [];

  let index = 0;
  while (index <= lowerHaystack.length) {
    const foundIndex = lowerHaystack.indexOf(lowerNeedle, index);
    if (foundIndex === -1) {
      break;
    }

    const contextStart = Math.max(0, foundIndex - CONTEXT_RADIUS);
    const contextEnd = Math.min(
      haystack.length,
      foundIndex + query.length + CONTEXT_RADIUS
    );

    excerpts.push({
      index: foundIndex,
      context: haystack.slice(contextStart, contextEnd),
    });

    if (excerpts.length >= MAX_EXCERPTS) {
      break;
    }

    index = foundIndex + query.length;
  }

  return {
    count: excerpts.length,
    excerpts,
  };
}

export {};
