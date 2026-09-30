import userRoutes from "./userRoutes.js";
import authRoutes from "./authRoutes.js";
import cronRoutes from "./cronRoutes.js";
import dashboardRoutes from "./dashboardRoutes.js";
import ddsForm1Routes from "./ddsForm1Routes.js";
import notFoundHandler from "./notFoundHandler.js";

const routes = (app) => {
  app.use("/user", userRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/cron", cronRoutes);
  app.use("/dashboard", dashboardRoutes);
  app.use("/dds-form1", ddsForm1Routes);
  // 404 handler (For undefined routes)
  app.use(notFoundHandler);
};

export default routes;
