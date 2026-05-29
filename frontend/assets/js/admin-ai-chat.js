import { api } from './api.js';
import { toast } from './toast.js';

const MODULE_CONTEXTS = {
  Dashboard: {
    icon: '📊',
    title: 'IA do Dashboard',
    intro: 'Analise os indicadores do dia, riscos operacionais e próximas ações para manter o PetFunny girando bem.',
    prompts: [
      'Analise os indicadores de hoje e sugira 3 ações práticas.',
      'Quais riscos operacionais eu deveria olhar agora?',
      'Crie um resumo executivo rápido para a operação.'
    ]
  },
  Agenda: {
    icon: '📅',
    title: 'IA da Agenda',
    intro: 'Ajuda para encaixes, confirmações, gargalos, atrasos, pacotes e mensagens para tutores.',
    prompts: [
      'Analise a agenda e aponte horários críticos.',
      'Crie uma mensagem de confirmação amigável para WhatsApp.',
      'Como organizar melhor os atendimentos de hoje?'
    ]
  },
  Tutores: {
    icon: '👥',
    title: 'IA de Tutores',
    intro: 'Use para relacionamento, histórico, recuperação de clientes e comunicação mais humana.',
    prompts: [
      'Sugira uma abordagem para reativar tutores inativos.',
      'Crie uma mensagem carinhosa para um tutor frequente.',
      'Que informações importantes devo observar neste cliente?'
    ]
  },
  Pets: {
    icon: '🐾',
    title: 'IA de Pets',
    intro: 'Apoio para observações, preferências, cuidados recorrentes e histórico de cada pet.',
    prompts: [
      'Crie uma observação profissional sobre o cuidado do pet.',
      'Sugira perguntas para entender melhor a rotina do pet.',
      'Como transformar histórico do pet em atendimento personalizado?'
    ]
  },
  Serviços: {
    icon: '✂️',
    title: 'IA de Serviços',
    intro: 'Ajuda para precificação, descrição de serviços, combos e oportunidades de venda.',
    prompts: [
      'Sugira melhorias na descrição dos serviços.',
      'Quais combos fazem sentido para banho e tosa?',
      'Como explicar melhor os serviços premium ao tutor?'
    ]
  },
  Pacotes: {
    icon: '🎁',
    title: 'IA de Pacotes',
    intro: 'Apoio para recorrência, renovação, comunicação de sessões e pacotes mais atrativos.',
    prompts: [
      'Crie uma mensagem para vender pacote recorrente.',
      'Analise oportunidades de renovação de pacotes.',
      'Explique o benefício do pacote para o tutor de forma simples.'
    ]
  },
  Financeiro: {
    icon: '💳',
    title: 'IA Financeira',
    intro: 'Use para entender entradas, pendências, fluxo de caixa e decisões comerciais.',
    prompts: [
      'Analise o financeiro e destaque pontos de atenção.',
      'Sugira ações para reduzir pendências de pagamento.',
      'Crie um resumo financeiro para o fim do dia.'
    ]
  },
  Relatórios: {
    icon: '📈',
    title: 'IA de Relatórios',
    intro: 'Compare períodos, crescimento, desempenho dos serviços, agenda e pacotes.',
    prompts: [
      'Compare os períodos e explique o crescimento.',
      'Quais indicadores merecem atenção esta semana?',
      'Crie uma leitura gerencial dos relatórios.'
    ]
  },
  'CRM & Marketing': {
    icon: '📣',
    title: 'IA de CRM & Marketing',
    intro: 'Crie campanhas, mensagens de WhatsApp, reativação e relacionamento com tutores.',
    prompts: [
      'Crie uma campanha curta para WhatsApp.',
      'Sugira uma ação para clientes que sumiram.',
      'Escreva uma mensagem para divulgar pacotes.'
    ]
  },
  'Roleta de Mimos': {
    icon: '🎡',
    title: 'IA da Roleta de Mimos',
    intro: 'Sugestões de prêmios, regras, custo-benefício e campanhas para aumentar retorno.',
    prompts: [
      'Sugira mimos de baixo custo e alto encantamento.',
      'Crie uma campanha para ativar a roleta.',
      'Analise quais prêmios podem gerar retorno.'
    ]
  },
  Notificações: {
    icon: '🔔',
    title: 'IA de Notificações',
    intro: 'Transforme alertas em ações práticas para a equipe e mensagens para clientes.',
    prompts: [
      'Priorize estas notificações por urgência.',
      'Transforme os alertas em uma lista de ações.',
      'Crie uma mensagem para resolver o alerta principal.'
    ]
  },
  WhatsApp: {
    icon: '💬',
    title: 'IA do WhatsApp',
    intro: 'Crie mensagens claras, humanas e prontas para enviar aos tutores.',
    prompts: [
      'Crie uma mensagem de confirmação de agendamento.',
      'Crie uma mensagem sobre pacote e próximas datas.',
      'Crie uma resposta simpática para dúvida de preço.'
    ]
  },
  'Assistente IA': {
    icon: '✨',
    title: 'Assistente IA Global',
    intro: 'Pergunte sobre qualquer módulo do PetFunny OS com contexto operacional.',
    prompts: [
      'Como posso melhorar a operação hoje?',
      'Quais dados devo olhar primeiro?',
      'Crie uma rotina diária usando os módulos do sistema.'
    ]
  },
  Configurações: {
    icon: '⚙️',
    title: 'IA de Configurações',
    intro: 'Apoio para ajustar horários, capacidade, documentos e padrões de operação.',
    prompts: [
      'Sugira uma configuração operacional ideal.',
      'Quais dados do comércio devo revisar?',
      'Como melhorar o padrão de documentos e WhatsApp?'
    ]
  }
};

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeAnswer(payload) {
  const answer = payload?.answer || {};
  if (typeof answer === 'string') return { diagnosis: answer };
  return answer;
}

function renderAnswer(payload) {
  const item = normalizeAnswer(payload);
  return `
    <div class="context-ai-answer-block">
      <strong>${escapeHtml(item.title || 'Resposta da IA PetFunny')}</strong>
      ${item.diagnosis ? `<p><b>Diagnóstico:</b> ${escapeHtml(item.diagnosis)}</p>` : ''}
      ${item.impact ? `<p><b>Impacto:</b> ${escapeHtml(item.impact)}</p>` : ''}
      ${item.recommendedAction ? `<p><b>Ação recomendada:</b> ${escapeHtml(item.recommendedAction)}</p>` : ''}
      ${item.readyMessage ? `<div class="context-ai-ready-message"><b>Mensagem pronta:</b><br>${escapeHtml(item.readyMessage)}</div>` : ''}
      <small>${payload?.openaiConfigured ? 'Resposta gerada com IA real configurada.' : 'Resposta local segura. Configure OPENAI_API_KEY para ativar IA real.'}</small>
    </div>
  `;
}

export function setupAdminContextChat({ active = 'Dashboard', title = '' } = {}) {
  const moduleName = active || title || 'Dashboard';
  const config = MODULE_CONTEXTS[moduleName] || MODULE_CONTEXTS['Assistente IA'];
  const previous = document.getElementById('context-ai-assistant');
  if (previous) previous.remove();

  const widget = document.createElement('aside');
  widget.id = 'context-ai-assistant';
  widget.className = 'context-ai-assistant';
  widget.innerHTML = `
    <button class="context-ai-fab" id="context-ai-fab" type="button" aria-label="Abrir assistente de IA">
      <span aria-hidden="true">✦</span>
    </button>
    <section class="context-ai-panel" id="context-ai-panel" hidden>
      <header>
        <div>
          <span>${config.icon}</span>
          <strong>${escapeHtml(config.title)}</strong>
          <small>${escapeHtml(moduleName)}</small>
        </div>
        <button type="button" id="context-ai-close" aria-label="Fechar">×</button>
      </header>
      <p class="context-ai-intro">${escapeHtml(config.intro)}</p>
      <div class="context-ai-prompts">
        ${config.prompts.map((prompt) => `<button type="button" data-ai-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join('')}
      </div>
      <textarea id="context-ai-question" rows="4" placeholder="Pergunte algo sobre ${escapeHtml(moduleName)}..."></textarea>
      <button class="btn btn-primary context-ai-send" id="context-ai-send" type="button">Perguntar para IA</button>
      <div class="context-ai-output" id="context-ai-output"><p>Escolha uma sugestão ou escreva sua pergunta.</p></div>
    </section>
  `;
  document.body.appendChild(widget);

  const fab = widget.querySelector('#context-ai-fab');
  const panel = widget.querySelector('#context-ai-panel');
  const close = widget.querySelector('#context-ai-close');
  const textarea = widget.querySelector('#context-ai-question');
  const output = widget.querySelector('#context-ai-output');
  const send = widget.querySelector('#context-ai-send');

  function openPanel() { panel.hidden = false; textarea.focus(); }
  function closePanel() { panel.hidden = true; }

  async function ask(question) {
    const cleanQuestion = String(question || '').trim();
    if (!cleanQuestion) {
      toast.warning('Digite uma pergunta para a IA.');
      return;
    }
    output.innerHTML = '<div class="context-ai-thinking"><span></span> Analisando o contexto do módulo...</div>';
    send.disabled = true;
    try {
      const payload = await api.post('/assistente-ia/analyze', {
        module: moduleName,
        question: cleanQuestion,
        context: {
          origem: 'chatbot-contextual-admin',
          path: window.location.pathname,
          title: title || moduleName,
          timestamp: new Date().toISOString()
        }
      });
      output.innerHTML = renderAnswer(payload);
    } catch (error) {
      output.innerHTML = `<p class="context-ai-error">${escapeHtml(error.message || 'Não foi possível consultar a IA agora.')}</p>`;
    } finally {
      send.disabled = false;
    }
  }

  fab.addEventListener('click', () => panel.hidden ? openPanel() : closePanel());
  close.addEventListener('click', closePanel);
  widget.querySelectorAll('[data-ai-prompt]').forEach((button) => {
    button.addEventListener('click', () => {
      textarea.value = button.dataset.aiPrompt || '';
      ask(textarea.value);
    });
  });
  send.addEventListener('click', () => ask(textarea.value));
  textarea.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') ask(textarea.value);
  });
}
