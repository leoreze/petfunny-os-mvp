import crypto from 'crypto';

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();

const publicKey = toBase64Url(ecdh.getPublicKey());
const privateKey = toBase64Url(ecdh.getPrivateKey());

console.log('\nChaves VAPID geradas para o Web Push do PetFunny OS:\n');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:contato@petfunny.com.br\n');
console.log('Copie essas variáveis para o .env local ou para as variáveis do Render.');
