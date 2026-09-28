import userRoutes from "./userRoutes.js";
import authRoutes from "./authRoutes.js";
import cronRoutes from "./cronRoutes.js";
import notFoundHandler from "./notFoundHandler.js";

const routes = (app) => {
  app.use("/user", userRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/cron", cronRoutes);
  // 404 handler (For undefined routes)
  app.use(notFoundHandler);
};

export default routes;
