import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadOrCreateMessageAttestationIdentity } from "../scripts/message-attestation-identity.mjs";

function fingerprint(identity) {
  const publicKey = identity.keys.publicKey.export({ format: "der", type: "spki" });
  return createHash("sha256").update(publicKey).digest("hex");
}

test("persists one Ed25519 bridge identity across restarts", async () => {
  const root = await mkdtemp(join(tmpdir(), "roundtable-attestation-"));
  const keyPath = join(root, "identity.pem");
  try {
    const first = await loadOrCreateMessageAttestationIdentity({ keyPath });
    const second = await loadOrCreateMessageAttestationIdentity({ keyPath });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(fingerprint(first), fingerprint(second));
    assert.equal((await stat(keyPath)).mode & 0o777, 0o600);
    assert.match(await readFile(keyPath, "utf8"), /BEGIN PRIVATE KEY/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails closed when the persisted identity is not a valid Ed25519 private key", async () => {
  const root = await mkdtemp(join(tmpdir(), "roundtable-attestation-invalid-"));
  const keyPath = join(root, "identity.pem");
  try {
    await writeFile(keyPath, "not a private key", { mode: 0o600 });
    await assert.rejects(
      loadOrCreateMessageAttestationIdentity({ keyPath }),
      /private key|decoder|unsupported/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
