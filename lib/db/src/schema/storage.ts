import {
  pgTable,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { npUsers } from "./social";

// A row is created before a client receives a presigned URL.  The object is
// not usable until the owner finalizes it after the server has inspected the
// bytes and metadata uploaded to that URL.
export const npStorageUploads = pgTable(
  "np_storage_uploads",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => npUsers.id, { onDelete: "cascade" }),
    objectPath: text("object_path").notNull().unique(),
    name: text("name").notNull(),
    purpose: text("purpose").notNull().default("avatar"),
    declaredSize: integer("declared_size").notNull(),
    declaredContentType: text("declared_content_type").notNull(),
    status: text("status").notNull().default("pending"), // pending | finalized
    uploadedSize: integer("uploaded_size"),
    uploadedContentType: text("uploaded_content_type"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    finalizedAt: timestamp("finalized_at"),
  },
  (table) => [
    index("IDX_np_storage_uploads_owner").on(table.ownerId),
    index("IDX_np_storage_uploads_status").on(table.status),
  ],
);

export const insertNpStorageUploadSchema = createInsertSchema(npStorageUploads).omit({
  createdAt: true,
  finalizedAt: true,
});

export type NpStorageUpload = typeof npStorageUploads.$inferSelect;
export type InsertNpStorageUpload = z.infer<typeof insertNpStorageUploadSchema>;
