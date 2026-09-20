import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import expressSessionSequelize from "express-session-sequelize";
import methodOverride from "method-override";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket, { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import cookie from "cookie";

import { mysqlSequelize } from "./connections/seqDB.js";
import { checkVersion } from "./api/middlewares/checkVersion.js";
import responseLogger from "./api/middlewares/responseLogger.js";
import routes from "./api/routes/index.js";
import { crons } from "./api/cron/index.js";
import "./api/models/setupAssociations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const clients = new Map();
let wss;

const closeServer = (server) => new Promise((resolve, reject) => {
  if (!server.listening) return resolve();
  server.close((error) => (error ? reject(error) : resolve()));
});

export const startApplication = async () => {
  const app = express();
  const server = http.createServer(app);
  const jwtSecret = process.env.TOKEN_SECRET;

  app.use("/public", express.static(path.join(__dirname, "public")));
  app.use("/upload", express.static(path.join(__dirname, "public/upload")));
  app.use("/common", express.static(path.join(__dirname, "api/views/emails/common")));

  wss = new WebSocketServer({ server });
  wss.on("connection", (ws, req) => {
    const cookies = cookie.parse(req.headers.cookie || "");
    const token = cookies.token;
    if (!token) { ws.close(); return; }

    try {
      const user = jwt.verify(token, jwtSecret);
      clients.set(ws, { role: user.role, email: user.email });
      ws.on("close", () => clients.delete(ws));
    } catch { ws.close(); }
  });

  const getClientsByRole = (role) => Array.from(clients.values())
    .filter((client) => !role || client.role === role)
    .map(({ email, role: clientRole }) => ({ email, role: clientRole }));

  app.get("/getClients", (req, res) => res.send(getClientsByRole()));
  app.set("view engine", "ejs");
  app.use(cookieParser());
  app.use(bodyParser.json({ limit: "500mb" }));
  app.use(bodyParser.urlencoded({ limit: "500mb", extended: true, parameterLimit: 50000 }));
  app.use(methodOverride("_method"));
  app.use(cors({
    origin: ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5500", "http://localhost:5500"],
    credentials: true,
  }));
  app.use(express.json());
  app.use(responseLogger);

  const SessionStore = expressSessionSequelize(session.Store);
  const sequelizeSessionStore = new SessionStore({ db: mysqlSequelize });
  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sequelizeSessionStore,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: (process.env.NODE_ENV || "local") !== "local",
      sameSite: "lax",
    },
  }));

  app.use("/assets", express.static(path.join(__dirname, "assets")));
  checkVersion(app);
  routes(app);
  const stopCrons = crons();

  const sendMessageToRole = (role, message, type, permission) => {
    clients.forEach(({ role: clientRole, email }, ws) => {
      if (clientRole === role && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ message, email, type, permission }));
        console.log(`${type}: Message sent to ${email} with role ${role}: ${message} ${permission}`);
      }
    });
  };
  app.post("/sendMessage", (req, res) => {
    const { role, message, type, permission } = req.body;
    if (!role || !message || !type || !permission) return res.status(400).json({ error: "Invalid request body" });
    sendMessageToRole(role, message, type, permission);
    return res.status(200).json({ success: true });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(process.env.APP_PORT), () => {
      server.removeListener("error", reject);
      console.log(`Listening on port: ${process.env.APP_PORT}`);
      resolve();
    });
  });

  return {
    app,
    server,
    wss,
    close: async () => {
      stopCrons?.();
      clients.clear();
      wss?.close();
      await closeServer(server);
    },
  };
};
