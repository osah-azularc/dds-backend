import userRoutes from "./userRoutes.js";
import authRoutes from "./authRoutes.js";
import docketDetailRoutes from "./docketDetailRoutes.js";
import notFoundHandler from "./notFoundHandler.js";

const routes = (app) => {
  app.use("/user", userRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/docketDetail", docketDetailRoutes);
  // 404 handler (For undefined routes)
  app.use(notFoundHandler);
};

export default routes;
