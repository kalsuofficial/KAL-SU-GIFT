import { db } from '../db/index.ts';
import { notifications } from '../db/schema.ts';

export interface NotificationDispatchInput {
  userId: number;
  orderId?: number | null;
  eventType: string;
  title: string;
  message: string;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
}

export async function dispatchNotification(input: NotificationDispatchInput): Promise<void> {
  try {
    // 1. Always create in-app notification in PostgreSQL
    await db.insert(notifications).values({
      userId: input.userId,
      orderId: input.orderId ?? null,
      eventType: input.eventType,
      channel: 'in_app',
      title: input.title,
      message: input.message,
      deliveryStatus: 'delivered',
    });

    // 2. WhatsApp Cloud API notification if authorized token is configured
    const whatsappToken = process.env.WHATSAPP_CLOUD_TOKEN;
    const whatsappPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (whatsappToken && whatsappPhoneId && input.recipientPhone) {
      try {
        const cleanPhone = input.recipientPhone.replace(/[^\d]/g, '');
        const resp = await fetch(
          `https://graph.facebook.com/v20.0/${whatsappPhoneId}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${whatsappToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: cleanPhone,
              type: 'text',
              text: { body: `${input.title}\n${input.message}` },
            }),
          }
        );
        await db.insert(notifications).values({
          userId: input.userId,
          orderId: input.orderId ?? null,
          eventType: input.eventType,
          channel: 'whatsapp',
          title: input.title,
          message: input.message,
          deliveryStatus: resp.ok ? 'delivered' : 'failed',
        });
      } catch (err) {
        console.error('WhatsApp notification dispatch error:', err);
      }
    }
  } catch (error) {
    console.error('Failed to record notification:', error);
  }
}
