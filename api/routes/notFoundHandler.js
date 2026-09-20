// 404 handler (For undefined routes)
const notFoundHandler = (req, res, next) => {
  res.status(404).format({
    "application/json": () => {
      res.json({
        success: false,
        error: "Not Found",
        message: `Cannot ${req.method} ${req.originalUrl}`,
        status: 404
      });
    },
    "application/xml": () => {
      res.type("application/xml");
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
          <error>
            <message>Route not found</message>
            <path>${req.originalUrl}</path>
            <method>${req.method}</method>
            <status>404</status>
            <timestamp>${new Date().toISOString()}</timestamp>
          </error>`);
    },
    default: () => {
      res.type("text/plain");
      res.send(`404 - Cannot ${req.method} ${req.originalUrl}`);
    }
  });
};

export default notFoundHandler;
