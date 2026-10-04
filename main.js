import fs from 'node:fs/promises';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { RodiumAI } from 'rodiumai';

async function loadEnv() {
  try {
    for (const line of (await fs.readFile('.env', 'utf8')).split('\n')) {
      if (line.includes('=') && !line.trim().startsWith('#')) {
        const [key, ...rest] = line.trim().split('=');
        if (!process.env[key]) process.env[key] = rest.join('=').replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {}
}

const rl = readline.createInterface({ input, output });
const ask = (question) => rl.question(question);

async function main() {
  await loadEnv();
  if (!process.env.RODIUMAI_API_KEY) throw new Error('RODIUMAI_API_KEY est absente du fichier .env.');
  const client = new RodiumAI({ apiKey: process.env.RODIUMAI_API_KEY, timeout: 150000 });
  const models = {
    chat: process.env.RODIUMAI_CHAT_MODEL || 'openai/gpt-4o-mini',
    image: process.env.RODIUMAI_IMAGE_MODEL,
    video: process.env.RODIUMAI_VIDEO_MODEL,
  };
  const steps = [chat, image, video];
  let index = 0;
  while (index < 3) {
    console.log(`\n=== Étape ${index + 1} : ${['Chat', 'Image', 'Vidéo'][index]} ===`);
    await steps[index](client, models);
    const choices = index === 0 ? { r: 0, s: 1 } : index === 2 ? { b: 1, r: 2, q: 3 } : { b: 0, r: 1, s: 2 };
    const prompt = index === 0 ? 'Rester (r) ou suivant (s) ? ' : index === 2 ? 'Retour (b), rester (r) ou quitter (q) ? ' : 'Retour (b), rester (r) ou suivant (s) ? ';
    let choice = (await ask(prompt)).trim().toLowerCase();
    while (!(choice in choices)) choice = (await ask('Choix invalide. Réessayez : ')).trim().toLowerCase();
    index = choices[choice];
  }
  rl.close();
}

async function chat(client, models) {
  const response = await client.chat.completions.create({ model: models.chat, messages: [{ role: 'user', content: await ask('Votre question : ') }] });
  console.log(response.choices[0].message.content);
  console.log(`Coût : ${response.cost_rodi ?? response.usage?.cost_rodi ?? 'inconnu'} RODI`);
}

async function image(client, models) {
  if (!models.image) return console.log('Configurez RODIUMAI_IMAGE_MODEL dans .env.');
  const response = await client.images.generate({ model: models.image, prompt: await ask("Décrivez l'image : "), n: 1, response_format: 'b64_json' });
  const filename = (await ask('Nom du fichier (Entrée = image.png) : ')).trim() || 'image.png';
  await fs.writeFile(filename, Buffer.from(response.data[0].b64_json, 'base64'));
  console.log(`Image enregistrée : ${filename}`);
}

async function video(client, models) {
  if (!models.video) return console.log('Configurez RODIUMAI_VIDEO_MODEL dans .env.');
  const response = await client.video.generations.create({ model: models.video, prompt: await ask('Décrivez la vidéo courte : '), duration: 4, timeout: 150000 });
  const item = response.data[0];
  const filename = (await ask('Nom du fichier (Entrée = video.mp4) : ')).trim() || 'video.mp4';
  if (item.b64_json) await fs.writeFile(filename, Buffer.from(item.b64_json, 'base64'));
  else await fs.writeFile(filename, Buffer.from(await (await fetch(item.url)).arrayBuffer()));
  console.log(`Vidéo enregistrée : ${filename}`);
}

main().catch((error) => { console.error(`Erreur : ${error.message}`); rl.close(); process.exitCode = 1; });
