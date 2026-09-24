import { argon2id } from "hash-wasm";

self.onmessage = async (e: MessageEvent) => {
  const { id, password, salt, iterations, memorySize, parallelism, hashLength } =
    e.data;

  try {
    const hash = await argon2id({
      password,
      salt: new Uint8Array(salt),
      iterations,
      memorySize,
      parallelism,
      hashLength,
      outputType: "binary",
    });

    const result = new Uint8Array(hash);
    (self as unknown as Worker).postMessage(
      { id, ok: true, hash: result.buffer },
      [result.buffer],
    );
  } catch (err: any) {
    (self as unknown as Worker).postMessage({
      id,
      ok: false,
      error: err?.message || String(err),
    });
  }
};
