// Route Vercel : explique comment corriger un problème de sécurité avec Groq (clé GROQ_API_KEY côté serveur)
const PROBLEMES = {
  dmarc: 'DMARC absent sur le domaine : n\'importe qui peut envoyer des e-mails en son nom.',
  faux: 'Un nom de domaine proche qui imite le site a été repéré (risque de faux site).',
  entetes: 'Deux en-têtes de sécurité HTTP manquent sur le site (par exemple HSTS et Content-Security-Policy).',
  certificat: 'Le certificat HTTPS du site expire bientôt.'
};
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST seulement' });
  const cle = process.env.GROQ_API_KEY;
  if (!cle) return res.status(500).json({ error: 'GROQ_API_KEY manquante' });
  const b = req.body || {};
  const probleme = PROBLEMES[b.type];
  if (!probleme) return res.status(400).json({ error: 'Problème inconnu' });
  const domaine = String(b.domaine || 'le domaine').slice(0, 100);
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
