import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const promptPath = path.resolve(__dirname, 'system-prompt.txt');

export function getPetFunnyAiSystemPrompt() {
  return fs.readFileSync(promptPath, 'utf8').trim();
}

export function getPetFunnyAiPromptMetadata() {
  const prompt = getPetFunnyAiSystemPrompt();
  return {
    name: 'Assistente Inteligente PetFunny',
    business: 'PetFunny - Banho e Tosa',
    language: 'pt-BR',
    mode: 'petfunny_single',
    tenant: false,
    promptLength: prompt.length,
    modules: [
      'Dashboard', 'Agenda', 'Novo Agendamento', 'Tutores / Clientes', 'Pets', 'Serviços',
      'Pacotes', 'Assinaturas / Recorrência', 'Comandas', 'Recibos', 'Financeiro', 'Caixa',
      'CRM', 'Marketing', 'Roleta de Mimos', 'WhatsApp', 'Relatórios', 'Configurações',
      'Branding / Identidade PetFunny', 'Inteligência operacional'
    ]
  };
}
