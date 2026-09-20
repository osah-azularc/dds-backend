import userRoutes from "./userRoutes.js";
import authRoutes from "./authRoutes.js";
import notFoundHandler from "./notFoundHandler.js";

const routes = (app) => {
  app.use("/user", userRoutes);
  app.use("/api/auth", authRoutes);
  // 404 handler (For undefined routes)
  app.use(notFoundHandler);
};

export default routes;
