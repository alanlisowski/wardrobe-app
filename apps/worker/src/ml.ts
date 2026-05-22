import { env } from "./env.js";

export interface MlResult {
  cutoutPngBase64: string;
  colors: Array<{ hex: string; proportion: number }>;
  embedding: number[];
}

const ML_TIMEOUT_MS = 60_000;

/** Call the Python ML service /process endpoint (SPEC §9 steps 2–4). */
export async function callMlProcess(
  imageBuf: Buffer,
  filename: string,
  contentType: string,
): Promise<MlResult> {
  const form = new FormData();
  form.append("file", new Blob([imageBuf], { type: contentType }), filename);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${env.mlServiceUrl}/process`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`ML /process timed out after ${ML_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ML /process failed: ${res.status} ${text.slice(0, 500)}`);
  }
  return (await res.json()) as MlResult;
}
