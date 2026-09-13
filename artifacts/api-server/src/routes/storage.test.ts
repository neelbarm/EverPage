import { test } from "node:test";
import assert from "node:assert/strict";
import type { File } from "@google-cloud/storage";
import { canAccessObject, ObjectPermission } from "../lib/objectAcl";
import {
  isMatchingUploadedMetadata,
  validateUploadRequest,
} from "./storage";

test("upload validation preserves legacy zero-size requests but rejects unsafe metadata", () => {
  assert.equal(validateUploadRequest({ name: "avatar.png", size: 12, contentType: "image/png" }).ok, true);
  assert.equal(validateUploadRequest({ name: "avatar.png", size: 0, contentType: "image/png" }).ok, true);
  assert.equal(validateUploadRequest({ name: "avatar.png", size: -1, contentType: "image/png" }).ok, false);
  assert.equal(validateUploadRequest({ name: "avatar.png", size: 11 * 1024 * 1024, contentType: "image/png" }).ok, false);
  assert.equal(validateUploadRequest({ name: "avatar.png", size: 12, contentType: "text/html" }).ok, false);
  assert.equal(validateUploadRequest({ name: "../private", size: 12, contentType: "image/png" }).ok, false);
});

test("finalization metadata comparison requires exact server-declared size and MIME", () => {
  const upload = { declaredSize: 12, declaredContentType: "image/png" };
  assert.equal(isMatchingUploadedMetadata(upload, { size: 12, contentType: "image/png" }), true);
  assert.equal(isMatchingUploadedMetadata(upload, { size: 13, contentType: "image/png" }), false);
  assert.equal(isMatchingUploadedMetadata(upload, { size: 12, contentType: "image/jpeg" }), false);
});

test("ACL fake denies anonymous and cross-user reads while allowing owner reads", async () => {
  const file = {
    getMetadata: async () => [{
      metadata: {
        "custom:aclPolicy": JSON.stringify({ owner: "user-a", visibility: "private" }),
      },
    }],
  } as unknown as File;

  assert.equal(await canAccessObject({
    objectFile: file,
    requestedPermission: ObjectPermission.READ,
  }), false);
  assert.equal(await canAccessObject({
    userId: "user-b",
    objectFile: file,
    requestedPermission: ObjectPermission.READ,
  }), false);
  assert.equal(await canAccessObject({
    userId: "user-a",
    objectFile: file,
    requestedPermission: ObjectPermission.READ,
  }), true);
});
