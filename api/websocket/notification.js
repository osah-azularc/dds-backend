import WebSocket from "ws";
import { clients } from "../../app-ecourt.js";

export const sendNotification = ({ user_email }) => {
  clients.forEach(({ role, email }, ws) => {
    if (user_email == email && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "notification" }));
    }
  });
};
