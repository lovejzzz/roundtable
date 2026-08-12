import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

async function readIdentity(keyPath) {
  const pem = await readFile(keyPath);
  const privateKey = createPrivateKey(pem);
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("Roundtable message-attestation identity must be an Ed25519 private key.");
  }
  return {
    keys: {
      privateKey,
      publicKey: createPublicKey(privateKey),
    },
    keyPath,
  };
}

export async function loadOrCreateMessageAttestationIdentity({ keyPath }) {
  if (!keyPath) throw new Error("Roundtable message-attestation key path is required.");
  await mkdir(dirname(keyPath), { recursive: true, mode: 0o700 });

  try {
    const identity = await readIdentity(keyPath);
    await chmod(keyPath, 0o600);
    return { ...identity, created: false };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const generated = generateKeyPairSync("ed25519");
  const privateKeyPem = generated.privateKey.export({ format: "pem", type: "pkcs8" });
  try {
    await writeFile(keyPath, privateKeyPem, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  await chmod(keyPath, 0o600);
  const identity = await readIdentity(keyPath);
  return { ...identity, created: true };
}
