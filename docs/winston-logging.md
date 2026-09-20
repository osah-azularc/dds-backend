# Winston API Response Logging

Logs only **failed API responses** (4xx and 5xx). Successful 2xx responses are never logged.

---

## Dependencies

Both packages are already installed in this project.

```bash
npm install winston
npm install winston-daily-rotate-file
```

---

## Files Involved

| File | Role |
|---|---|
| `config/winstonLogger.js` | Logger configuration — formats, transports, file destinations |
| `api/middlewares/responseLogger.js` | Express middleware — intercepts responses and logs non-2xx |
| `app-ecourt.js` | Registers the middleware |
| `logs/` | Output directory — **must exist before the server starts** |

---

## Step 1 — Logger Configuration (`config/winstonLogger.js`)

Two logger instances are exported:

- **`logger`** — JSON format, used by `responseLogger` middleware
- **`activityLogger`** — Human-readable timestamped format, used elsewhere

The `logFormat` printf function prints structured metadata (method, URL, status, body) as pretty JSON below the message line:

```js
format.printf(({ timestamp, level, message, stack, ...meta }) => {
  let log = `${timestamp} ${level.toUpperCase()}: ${message}`;
  const metaKeys = Object.keys(meta).filter((k) => k !== "service");
  if (metaKeys.length) {
    log += `\n${JSON.stringify(metaObj, null, 2)}`;
  }
  if (stack) log += `\nStack: ${stack}`;
  return log;
});
```

Log files written:

| File | Contents |
|---|---|
| `logs/combined.log` | All warnings + errors (400s and 500s) |
| `logs/error.log` | Only 500-level errors |
| `logs/error-YYYY-MM-DD.log` | Daily rotating error log, kept for 30 days |

---

## Step 2 — Response Logger Middleware (`api/middlewares/responseLogger.js`)

Wraps `res.json` to inspect the status code **after** the controller has set it.

```js
import { logger } from "../../config/winstonLogger.js";

const responseLogger = (req, res, next) => {
  const startTime = Date.now();
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    const statusCode = res.statusCode;

    if (statusCode >= 400) {
      const logData = {
        method: req.method,
        url: req.originalUrl,
        statusCode,
        duration: `${Date.now() - startTime}ms`,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        requestBody: req.method !== "GET" ? req.body : undefined,
        responseBody: body,
      };

      if (statusCode >= 500) {
        logger.error(`API FAILED [${statusCode}] ${req.method} ${req.originalUrl}`, logData);
      } else {
        logger.warn(`API WARNING [${statusCode}] ${req.method} ${req.originalUrl}`, logData);
      }
    }

    return originalJson(body);
  };

  next();
};

export default responseLogger;
```

**Rules:**
- `statusCode < 400` → nothing logged
- `400–499` → `logger.warn`
- `500+` → `logger.error`
- GET request bodies are excluded (`requestBody` is omitted)

---

## Step 3 — Register in `app-ecourt.js`

Import and register **after** `express.json()` and **before** `routes(app)`:

```js
import responseLogger from "./api/middlewares/responseLogger";

// after body parsers
app.use(express.json());
app.use(responseLogger);  // <-- here

// routes must come after
routes(app);
```

Order matters — it must be after body parsers so `req.body` is populated.

---

## Step 4 — Ensure the logs/ Directory Exists

Winston creates log **files** automatically but **not the directory**.

```bash
mkdir -p ecourt-backend/logs
```

Run this once. If the folder is deleted while the server is running, **restart the server** after recreating it — Winston opens file handles at startup.

---

## Log Output Examples

**404 — Route not found:**
```json
{
  "level": "warn",
  "message": "API WARNING [404] GET /api/nonexistent-route",
  "method": "GET",
  "url": "/api/nonexistent-route",
  "statusCode": 404,
  "duration": "3ms",
  "ip": "::1",
  "responseBody": { "success": false, "message": "Cannot GET /api/nonexistent-route" }
}
```

**401 — Bad login credentials:**
```json
{
  "level": "warn",
  "message": "API WARNING [401] POST /api/users/login",
  "method": "POST",
  "url": "/api/users/login",
  "statusCode": 401,
  "duration": "18ms",
  "requestBody": { "email": "wrong@test.com" },
  "responseBody": { "success": false, "message": "Invalid credentials." }
}
```

**500 — Server error:**
```json
{
  "level": "error",
  "message": "API FAILED [500] POST /api/users/login",
  "statusCode": 500,
  "duration": "23ms",
  "responseBody": { "message": "Internal Server Error" }
}
```

---

## Reading the Logs

```bash
# All failures (4xx + 5xx)
cat logs/combined.log

# Only 500 errors
cat logs/error.log

# Today's rotating log
cat logs/error-$(date +%Y-%m-%d).log

# Watch live
tail -f logs/combined.log

# Filter by route
grep "/api/users/login" logs/combined.log

# Filter by level
grep "API FAILED" logs/combined.log    # 500s only
grep "API WARNING" logs/combined.log   # 4xxs only
```
