import app from './app.js';
import { env } from './config/env.js';

app.listen(env.port, () => {
  console.log(`🚀 ${env.appName} API running on port ${env.port}`);
  console.log(`Modo: ${env.appMode} | SaaS removido | tenant=false`);
});
