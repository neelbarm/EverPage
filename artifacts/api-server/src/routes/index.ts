import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import socialRouter from "./social";
import bookshelfRouter from "./bookshelf";
import wrappedRouter from "./wrapped";
import notesRouter from "./notes";
import roomsRouter from "./rooms";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(socialRouter);
router.use(bookshelfRouter);
router.use(wrappedRouter);
router.use(notesRouter);
router.use(roomsRouter);

export default router;
