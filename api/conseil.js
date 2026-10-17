// Route Vercel : explique comment corriger un problème de sécurité avec Groq (clé GROQ_API_KEY côté serveur)
const PROBLEMES = {
  dmarc: 'DMARC absent sur le domaine : n\'importe qui peut envoyer des e-mails en son nom.',
  faux: 'Un nom de domaine proche qui imite le site a été repéré (risque de faux site).',
  entetes: 'Deux en-têtes de sécurité HTTP manquent sur le site (par exemple HSTS et Content-Security-Policy).',
  certificat: 'Le certificat HTTPS du site expire bientôt.'
};
// Anti-abus : limite simple par IP (mémoire de l'instance) + même origine obligatoire
const VISITES = new Map();
const LIMITE = 10; // requêtes max par IP
const FENETRE = 10 * 60 * 1000; // sur 10 minutes
function tropDeRequetes(ip) {
  const maintenant = Date.now();
  const liste = (VISITES.get(ip) || []).filter(t => maintenant - t < FENETRE);
  liste.push(maintenant);
  VISITES.set(ip, liste);
  if (VISITES.size > 5000) VISITES.clear();
  return liste.length > LIMITE;
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST seulement' });
  const origine = req.headers.origin || req.headers.referer || '';
  let hoteOrigine = '';
  try { hoteOrigine = new URL(origine).host; } catch (e) {}
  if (!hoteOrigine || hoteOrigine !== req.headers.host) return res.status(403).json({ error: 'Origine refusée' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'inconnue';
  if (tropDeRequetes(ip)) return res.status(429).json({ error: 'Trop de demandes, réessayez dans quelques minutes.' });
  const cle = process.env.GROQ_API_KEY;
  if (!cle) return res.status(500).json({ error: 'GROQ_API_KEY manquante' });
  const b = req.body || {};
  const probleme = PROBLEMES[b.type];
  if (!probleme) return res.status(400).json({ error: 'Problème inconnu' });
  const domaineBrut = String(b.domaine || '').toLowerCase().slice(0, 253);
  const domaine = /^[a-z0-9.-]+\.[a-z]{2,63}$/.test(domaineBrut) ? domaineBrut : 'le domaine';
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        max_tokens: 300,
        temperature: 0.3,
        messages: [
          { role: 'system', content: "Tu aides le patron d'une petite entreprise, pas un informaticien. En français simple, 3 étapes numérotées max, 80 mots max, sans jargon. Si une ligne DNS ou un réglage est à copier, donne-le exactement. Pas de markdown gras." },
          { role: 'user', content: `Domaine : ${domaine}. Problème : ${probleme} Comment corriger ?` }
        ]
      })
    });
    const d = await r.json();
    if (!r.ok) return res.status(502).json({ error: d.error?.message || 'Erreur Groq' });
    return res.status(200).json({ conseil: d.choices?.[0]?.message?.content?.trim() || '' });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
