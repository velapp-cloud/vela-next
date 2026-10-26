/**
 * lib/chats/chatAbierto.ts
 *
 * Mismo patron que ChatAbierto en la version de Expo: guarda cual chat
 * tiene abierto la persona en este momento, para que el sistema de
 * toasts de mensajes (ToastMensajes.tsx) NO le muestre una notificacion
 * emergente de un mensaje que le acaba de caer en la conversacion que
 * ya esta viendo — eso seria redundante, como en WhatsApp no te salta
 * un banner de un chat que ya tienes abierto.
 */
let chatAbiertoId: string | null = null;

export function setChatAbierto(id: string | null) {
  chatAbiertoId = id;
}

export function getChatAbierto(): string | null {
  return chatAbiertoId;
}