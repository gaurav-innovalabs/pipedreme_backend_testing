export class ConnectionTokenError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.name = "ConnectTokenError";
    this.statusCode = statusCode;
  }
}