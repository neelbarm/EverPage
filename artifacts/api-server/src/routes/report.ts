import { Router, type IRouter, type Request, type Response } from "express";
import { getSession, getSessionId } from "../lib/auth";
import { db } from "@workspace/db";
import { npReports } from "@workspace/db/schema";

const router: IRouter = Router();

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

const VALID_CONTENT_TYPES = ["user", "room_message", "margin_note", "activity"];

router.post("/report", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  const session = sid ? await getSession(sid) : null;
  if (!session) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { contentType, contentId, reportedUserId, reason } = req.body ?? {};
  if (!contentType || !contentId) {
    res.status(400).json({ error: "contentType and contentId are required" });
    return;
  }
  const resolvedType = VALID_CONTENT_TYPES.includes(contentType) ? contentType : "activity";

  // Persist the report so it can be reviewed and acted on. App Store Guideline 1.2
  // requires a real moderation pipeline, not a fire-and-forget acknowledgement.
  await db.insert(npReports).values({
    id: generateId(),
    reporterId: session.user.id,
    contentType: resolvedType,
    contentId: String(contentId),
    reportedUserId: reportedUserId ? String(reportedUserId) : null,
    reason: reason ? String(reason).slice(0, 500) : null,
  });

  console.warn(
    `[REPORT] reporter=${session.user.id} type=${resolvedType} contentId=${contentId} reportedUser=${reportedUserId ?? "-"} reason=${reason ?? "not specified"}`
  );

  res.json({ success: true, message: "Thank you. We'll review this within 24 hours." });
});

export default router;
