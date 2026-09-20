// Broadcasts a check-in/attendance-status change to every connected
// WebSocket client, so any open Check-In Info page (any tab, any user)
// refetches its grid - mirrors the legacy AngularJS checkin-info-controller
// (WebSocketService.sendMessage() -> Chat-Prod.php relay -> every other
// tab's $watch(WebSocketService.messages) -> getStartCheckinData()), but
// server-driven (fired right after the DB commit, not by the client
// re-sending over its own socket) and typed - unlike the legacy relay,
// which had no message-type filtering so any WebSocket message at all
// triggered a refetch, this tags the payload with `type` so only
// checkin-info listeners react (see WebSocketContext.jsx's subscribe()).
import WebSocket from "ws";
import { clients } from "../../app-ecourt.js";

export const broadcastAttendanceStatusUpdated = (payload = {}) => {
  const message = JSON.stringify({ type: "attendanceStatusUpdated", ...payload });
  clients.forEach((_client, ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  });
};
