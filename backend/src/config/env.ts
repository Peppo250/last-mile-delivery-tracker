import dotenv from "dotenv";
dotenv.config();

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  port: parseInt(process.env.PORT || "4000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: required("JWT_SECRET", "dev-only-insecure-secret-change-me"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  corsOrigin: process.env.CORS_ORIGIN || "*",

  smtp: {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "Last-Mile Delivery <no-reply@delivery.local>",
  },

  sms: {
    // Optional Twilio-style config. If not set, SMS notifications are
    // logged to the NotificationLog table with status SKIPPED instead of
    // being sent, so the rest of the flow keeps working without a paid
    // account. See services/notificationService.ts.
    accountSid: process.env.SMS_ACCOUNT_SID || "",
    authToken: process.env.SMS_AUTH_TOKEN || "",
    fromNumber: process.env.SMS_FROM_NUMBER || "",
  },
};
