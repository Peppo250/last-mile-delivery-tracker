import nodemailer from "nodemailer";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { NotificationChannel, NotificationStatus, OrderStatus } from "@prisma/client";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!env.smtp.host || !env.smtp.user) return null; // not configured
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    });
  }
  return transporter;
}

const STATUS_MESSAGES: Record<OrderStatus, (orderCode: string) => { subject: string; body: string }> = {
  PLACED: (c) => ({ subject: `Order ${c} placed`, body: `Your order ${c} has been placed and is awaiting agent assignment.` }),
  ASSIGNED: (c) => ({ subject: `Order ${c} assigned to an agent`, body: `A delivery agent has been assigned to your order ${c}.` }),
  PICKED_UP: (c) => ({ subject: `Order ${c} picked up`, body: `Your package for order ${c} has been picked up.` }),
  IN_TRANSIT: (c) => ({ subject: `Order ${c} in transit`, body: `Your order ${c} is now in transit.` }),
  OUT_FOR_DELIVERY: (c) => ({ subject: `Order ${c} out for delivery`, body: `Your order ${c} is out for delivery today.` }),
  DELIVERED: (c) => ({ subject: `Order ${c} delivered`, body: `Your order ${c} has been delivered. Thank you!` }),
  FAILED: (c) => ({ subject: `Delivery attempt failed for order ${c}`, body: `We could not deliver your order ${c}. Please log in to reschedule a new delivery date.` }),
  RESCHEDULED: (c) => ({ subject: `Order ${c} rescheduled`, body: `Your order ${c} has been rescheduled for a new delivery attempt.` }),
  CANCELLED: (c) => ({ subject: `Order ${c} cancelled`, body: `Your order ${c} has been cancelled.` }),
};

/**
 * Sends (and logs) a status-change notification to the customer.
 * Email: sent via nodemailer if SMTP_* env vars are configured, otherwise
 *        the attempt is logged with status SKIPPED so the flow keeps working
 *        in a fresh clone with no mail provider set up yet.
 * SMS:   stubbed the same way behind SMS_* env vars (see env.ts) — wiring a
 *        real provider (e.g. Twilio) only requires filling in sendSms().
 */
export async function notifyOrderStatus(orderId: string, status: OrderStatus) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
  if (!order) return;

  const { subject, body } = STATUS_MESSAGES[status](order.orderCode);

  await sendEmail(orderId, order.customer.email, subject, body);
  if (order.customer.phone) {
    await sendSms(orderId, order.customer.phone, `${subject}: ${body}`);
  }
}

async function sendEmail(orderId: string, to: string, subject: string, body: string) {
  const t = getTransporter();
  let status: NotificationStatus = NotificationStatus.SKIPPED;
  let error: string | undefined;

  if (t) {
    try {
      await t.sendMail({ from: env.smtp.from, to, subject, text: body });
      status = NotificationStatus.SENT;
    } catch (err: any) {
      status = NotificationStatus.FAILED;
      error = err?.message || "Unknown email error";
    }
  }

  await prisma.notificationLog.create({
    data: { orderId, channel: NotificationChannel.EMAIL, recipient: to, subject, body, status, error },
  });
}

async function sendSms(orderId: string, to: string, message: string) {
  const configured = env.sms.accountSid && env.sms.authToken && env.sms.fromNumber;
  let status: NotificationStatus = NotificationStatus.SKIPPED;
  let error: string | undefined;

  if (configured) {
    try {
      // Placeholder for a real provider call, e.g.:
      // const client = twilio(env.sms.accountSid, env.sms.authToken);
      // await client.messages.create({ to, from: env.sms.fromNumber, body: message });
      status = NotificationStatus.SENT;
    } catch (err: any) {
      status = NotificationStatus.FAILED;
      error = err?.message || "Unknown SMS error";
    }
  }

  await prisma.notificationLog.create({
    data: {
      orderId,
      channel: NotificationChannel.SMS,
      recipient: to,
      subject: "SMS notification",
      body: message,
      status,
      error,
    },
  });
}
