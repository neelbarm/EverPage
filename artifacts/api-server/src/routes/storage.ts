import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  db,
  npStorageUploads,
  npUsers,
  type NpStorageUpload,
} from "@workspace/db";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "../lib/objectStorage";
import { getObjectAclPolicy } from "../lib/objectAcl";

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export type UploadRequestMetadata = {
  name: string;
  size: number;
  contentType: string;
  purpose: "avatar";
};

export type UploadValidationResult =
  | { ok: true; metadata: UploadRequestMetadata }
  | { ok: false; error: string };

/**
 * Validate client metadata before issuing a URL. The server-generated object
 * path is the only identity used later; client-provided names and paths never
 * become storage keys.
 */
export function validateUploadRequest(input: unknown): UploadValidationResult {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Missing or invalid upload metadata" };
  }
  const value = input as Record<string, unknown>;
  const { name, size, contentType } = value;
  const purpose = value.purpose ?? "avatar";
  const normalizedContentType =
    typeof contentType === "string" ? contentType.trim().toLowerCase() : "";

  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    name.length > 255 ||
    name.includes("/") ||
    name.includes("\\") ||
    typeof size !== "number" ||
    !Number.isSafeInteger(size) ||
    size < 0 ||
    size > MAX_UPLOAD_SIZE ||
    purpose !== "avatar" ||
    !ALLOWED_CONTENT_TYPES.has(normalizedContentType)
  ) {
    return {
      ok: false,
      error: "Invalid upload metadata: image name, size, and MIME type are required",
    };
  }

  return {
    ok: true,
    metadata: { name: name.trim(), size, contentType: normalizedContentType, purpose: "avatar" },
  };
}

export function isMatchingUploadedMetadata(
  upload: Pick<NpStorageUpload, "declaredSize" | "declaredContentType">,
  uploaded: { size: number; contentType: string },
): boolean {
  return (
    Number.isSafeInteger(uploaded.size) &&
    uploaded.size > 0 &&
    uploaded.size <= MAX_UPLOAD_SIZE &&
    (upload.declaredSize === 0 || uploaded.size === upload.declaredSize) &&
    uploaded.contentType === upload.declaredContentType
  );
}

export function isOwnedAvatarUpload(
  upload: Pick<NpStorageUpload, "ownerId"> | null | undefined,
  ownerId: string,
): boolean {
  return !!upload && upload.ownerId === ownerId;
}

/**
 * Released 1.0.3 clients request an upload with size 0 and then assign the
 * returned object URL without a separate finalize call. The upload ledger still
 * makes that flow safe: assignment is allowed only for the requesting owner,
 * after the server reads and validates the actual object metadata and applies a
 * private ACL. New clients continue to declare an exact size and finalize first.
 */
export async function assignAvatarUpload(
  ownerId: string,
  avatarUrl: string,
  service = new ObjectStorageService(),
  database: typeof db = db,
): Promise<typeof npUsers.$inferSelect | null> {
  const objectPath = objectPathFromAvatarUrl(avatarUrl);
  if (!objectPath) throw new Error("INVALID_AVATAR_PATH");

  const rows = await database
    .select()
    .from(npStorageUploads)
    .where(eq(npStorageUploads.objectPath, objectPath))
    .limit(1);
  const upload = rows[0];
  if (!isOwnedAvatarUpload(upload, ownerId)) throw new Error("AVATAR_NOT_OWNED");

  const objectFile = await service.getObjectEntityFile(upload.objectPath);
  const uploaded = await service.getUploadedObjectMetadata(objectFile);
  if (!isMatchingUploadedMetadata(upload, uploaded)) {
    throw new Error("AVATAR_METADATA_MISMATCH");
  }
  await service.trySetObjectEntityAclPolicy(upload.objectPath, {
    owner: ownerId,
    visibility: "private",
  });

  return database.transaction(async (tx) => {
    await tx
      .update(npStorageUploads)
      .set({
        status: "finalized",
        uploadedSize: uploaded.size,
        uploadedContentType: uploaded.contentType,
        finalizedAt: upload.finalizedAt ?? new Date(),
      })
      .where(and(
        eq(npStorageUploads.id, upload.id),
        eq(npStorageUploads.ownerId, ownerId),
      ));
    const updated = await tx
      .update(npUsers)
      .set({ avatarUrl, updatedAt: new Date() })
      .where(eq(npUsers.id, ownerId))
      .returning();
    return updated[0] ?? null;
  });
}

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.user.id as string;
}

function getWildcardParam(value: string | string[]): string {
  return Array.isArray(value) ? value.join("/") : value;
}

export function objectPathFromAvatarUrl(value: string): string | null {
  try {
    const pathname = new URL(value, "https://legacy-avatar.invalid").pathname;
    const marker = "/storage/objects/";
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex >= 0) {
      const objectId = decodeURIComponent(pathname.slice(markerIndex + marker.length));
      return objectId ? `/objects/${objectId}` : null;
    }
    if (pathname.startsWith("/objects/")) {
      return decodeURIComponent(pathname);
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Old clients stored the serving URL directly on the profile before ACL
 * metadata existed. Only an object explicitly referenced by a user's avatar
 * field qualifies for this narrow compatibility path.
 */
export async function isRecognizedLegacyPublicAvatar(
  database: typeof db,
  objectPath: string,
): Promise<boolean> {
  // A path tracked by the new upload ledger is never legacy, even if a
  // client has prematurely written it into a profile field.
  const tracked = await database
    .select({ id: npStorageUploads.id })
    .from(npStorageUploads)
    .where(eq(npStorageUploads.objectPath, objectPath))
    .limit(1);
  if (tracked.length > 0) return false;

  const rows = await database
    .select({ avatarUrl: npUsers.avatarUrl })
    .from(npUsers)
    .where(isNotNull(npUsers.avatarUrl));
  return rows.some(
    (row) => row.avatarUrl != null && objectPathFromAvatarUrl(row.avatarUrl) === objectPath,
  );
}

async function isAssignedFinalizedAvatar(
  database: typeof db,
  objectPath: string,
): Promise<boolean> {
  const uploads = await database
    .select({ id: npStorageUploads.id })
    .from(npStorageUploads)
    .where(and(
      eq(npStorageUploads.objectPath, objectPath),
      eq(npStorageUploads.status, "finalized"),
      eq(npStorageUploads.purpose, "avatar"),
    ))
    .limit(1);
  if (!uploads[0]) return false;
  const users = await database
    .select({ avatarUrl: npUsers.avatarUrl })
    .from(npUsers)
    .where(isNotNull(npUsers.avatarUrl));
  return users.some(
    (user) => user.avatarUrl != null && objectPathFromAvatarUrl(user.avatarUrl) === objectPath,
  );
}

export function createStorageRouter(
  service = new ObjectStorageService(),
  database: typeof db = db,
): IRouter {
  const router: IRouter = Router();

  router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
    const ownerId = requireAuth(req, res);
    if (!ownerId) return;

    const validation = validateUploadRequest(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    try {
      const target = await service.createObjectEntityUploadURL();
      const uploadId = randomUUID();
      await database.insert(npStorageUploads).values({
        id: uploadId,
        ownerId,
        objectPath: target.objectPath,
        name: validation.metadata.name,
        purpose: validation.metadata.purpose,
        declaredSize: validation.metadata.size,
        declaredContentType: validation.metadata.contentType,
        status: "pending",
      });
      res.json({
        uploadId,
        uploadURL: target.uploadURL,
        objectPath: target.objectPath,
        metadata: validation.metadata,
      });
    } catch (error) {
      req.log?.error?.({ err: error }, "Error generating upload URL");
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  const finalizeUpload = async (req: Request, res: Response) => {
    const ownerId = requireAuth(req, res);
    if (!ownerId) return;

    const uploadId = typeof req.body?.uploadId === "string" ? req.body.uploadId : "";
    const requestedObjectPath =
      typeof req.body?.objectPath === "string" ? req.body.objectPath : "";
    if (!uploadId && !requestedObjectPath) {
      res.status(400).json({ error: "uploadId or objectPath is required" });
      return;
    }

    try {
      const rows = await database
        .select()
        .from(npStorageUploads)
        .where(
          uploadId
            ? eq(npStorageUploads.id, uploadId)
            : eq(npStorageUploads.objectPath, requestedObjectPath),
        )
        .limit(1);
      const upload = rows[0];
      // Do not reveal whether an upload exists to a different account.
      if (!upload || upload.ownerId !== ownerId) {
        res.status(403).json({ error: "Upload is not owned by this account" });
        return;
      }
      if (
        requestedObjectPath &&
        requestedObjectPath !== upload.objectPath
      ) {
        res.status(400).json({ error: "Upload path does not match upload record" });
        return;
      }
      const objectFile = await service.getObjectEntityFile(upload.objectPath);
      const uploaded = await service.getUploadedObjectMetadata(objectFile);
      if (
        !isMatchingUploadedMetadata(upload, {
          size: uploaded.size,
          contentType: uploaded.contentType,
        })
      ) {
        res.status(422).json({ error: "Uploaded object metadata does not match request" });
        return;
      }

      await service.trySetObjectEntityAclPolicy(upload.objectPath, {
        owner: ownerId,
        visibility: "private",
      });
      if (upload.status === "pending") {
        await database
          .update(npStorageUploads)
          .set({
            status: "finalized",
            uploadedSize: uploaded.size,
            uploadedContentType: uploaded.contentType,
            finalizedAt: new Date(),
          })
          .where(
            and(
              eq(npStorageUploads.id, upload.id),
              eq(npStorageUploads.ownerId, ownerId),
              eq(npStorageUploads.status, "pending"),
            ),
          );
      }

      res.json({
        uploadId: upload.id,
        objectPath: upload.objectPath,
        status: "finalized",
      });
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(409).json({ error: "Upload has not reached object storage" });
        return;
      }
      req.log?.error?.({ err: error }, "Error finalizing upload");
      res.status(500).json({ error: "Failed to finalize upload" });
    }
  };
  // Keep the shorter endpoint as the public client contract while accepting
  // the original uploads-scoped spelling for older clients.
  router.post(["/storage/finalize", "/storage/uploads/finalize"], finalizeUpload);

  router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
    try {
      const raw = getWildcardParam(req.params.filePath);
      if (!raw || raw.split("/").some((part) => part === ".." || part === ".")) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const file = await service.searchPublicObject(raw);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const response = await service.downloadObject(file);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (response.body) {
        Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log?.error?.({ err: error }, "Error serving public object");
      res.status(500).json({ error: "Failed to serve public object" });
    }
  });

  router.get("/storage/objects/*path", async (req: Request, res: Response) => {
    const userId = req.isAuthenticated() ? (req.user.id as string) : undefined;
    try {
      const wildcardPath = getWildcardParam(req.params.path);
      const objectPath = `/objects/${wildcardPath}`;
      const objectFile = await service.getObjectEntityFile(objectPath);
      const policy = await getObjectAclPolicy(objectFile);
      let allowed = await service.canAccessObjectEntity({ userId, objectFile });
      if (!allowed && !policy) {
        allowed = await isRecognizedLegacyPublicAvatar(database, objectPath);
      }
      if (!allowed) {
        // Avatar bytes remain private in object storage. The API exposes only a
        // finalized object that is actively assigned as a user's avatar, which
        // keeps ordinary image requests working without opening private uploads.
        allowed = await isAssignedFinalizedAvatar(database, objectPath);
      }
      if (!allowed) {
        res.status(userId ? 403 : 401).json({
          error: userId ? "You do not have access to this object" : "Authentication required",
        });
        return;
      }

      const response = await service.downloadObject(objectFile);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (response.body) {
        Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      req.log?.error?.({ err: error }, "Error serving object");
      res.status(500).json({ error: "Failed to serve object" });
    }
  });

  return router;
}

export default createStorageRouter();
