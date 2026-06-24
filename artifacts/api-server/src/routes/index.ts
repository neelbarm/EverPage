import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import localAuthRouter from "./local-auth";
import socialRouter from "./social";
import storageRouter from "./storage";
import bookshelfRouter from "./bookshelf";
import wrappedRouter from "./wrapped";
import notesRouter from "./notes";
import roomsRouter from "./rooms";
import reportRouter from "./report";
import legalRouter from "./legal";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(localAuthRouter);
router.use(socialRouter);
router.use(storageRouter);
router.use(bookshelfRouter);
router.use(wrappedRouter);
router.use(notesRouter);
router.use(roomsRouter);
router.use(reportRouter);
router.use(legalRouter);

export default router;
