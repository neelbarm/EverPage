import { Router, type IRouter, type Request, type Response } from "express";
import { getSession, getSessionId } from "../lib/auth";

const router: IRouter = Router();

router.post("/report", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  const session = sid ? await getSession(sid) : null;
  if (!session) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { contentType, contentId, reason } = req.body ?? {};
  if (!contentType || !contentId) {
    res.status(400).json({ error: "contentType and contentId are required" });
    return;
  }

  console.warn(
    `[REPORT] user=${session.user.id} contentType=${contentType} contentId=${contentId} reason=${reason ?? "not specified"}`
  );

  res.json({ success: true, message: "Thank you. We'll review this report." });
});

export default router;
