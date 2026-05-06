import { api } from './api.js';
import { showLoading, hideLoading } from './loading.js';
import { showToast } from './toast.js';

export function openWhatsAppUrl(url) {
  if (!url) {
    showToast('Não há WhatsApp válido para abrir a conversa.', 'warning');
    return false;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

export async function generateWhatsAppMessage(payload = {}) {
  return api.post('/whatsapp/message', payload);
}

export async function sendHybridWhatsApp(payload = {}, loadingMessage = 'Preparando mensagem para WhatsApp...') {
  showLoading(loadingMessage, 'Gerando texto, preenchendo dados do cliente e abrindo o WhatsApp para envio manual.');
  try {
    const data = await generateWhatsAppMessage(payload);
    if (!data?.url) {
      showToast('Mensagem gerada, mas o cliente não tem WhatsApp cadastrado.', 'warning');
      return data;
    }
    openWhatsAppUrl(data.url);
    showToast('Mensagem aberta no WhatsApp para revisão e envio.', 'success');
    return data;
  } catch (error) {
    showToast(error.message || 'Não foi possível gerar a mensagem para WhatsApp.', 'error');
    throw error;
  } finally {
    hideLoading();
  }
}

export function bindHybridWhatsAppButtons(scope = document) {
  scope.querySelectorAll('[data-whatsapp-action]').forEach((button) => {
    if (button.dataset.whatsappBound === '1') return;
    button.dataset.whatsappBound = '1';
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = {
        type: button.dataset.whatsappAction || 'personalizada',
        appointmentId: button.dataset.appointmentId || '',
        tutorId: button.dataset.tutorId || '',
        transactionId: button.dataset.transactionId || '',
        leadId: button.dataset.leadId || '',
        customerPackageId: button.dataset.customerPackageId || '',
        receiptToken: button.dataset.receiptToken || '',
        phone: button.dataset.phone || '',
        custom: {
          message: button.dataset.message || '',
          petName: button.dataset.petName || '',
          service: button.dataset.service || '',
          when: button.dataset.when || '',
          sessionsRemaining: button.dataset.sessionsRemaining || '',
          receiptUrl: button.dataset.receiptUrl || ''
        }
      };
      await sendHybridWhatsApp(payload);
    });
  });
}
