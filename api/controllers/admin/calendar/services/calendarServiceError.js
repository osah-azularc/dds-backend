// Thrown by service functions to carry the HTTP status the controller should
// respond with; anything else is treated as an unexpected 500.
export class CalendarServiceError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
