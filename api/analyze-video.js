import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MODEL = "gpt-4.1-mini";
const MAX_DURATION_S = 30;

function computeTimes(durationSec, frames = 12) {
  const start = Math.max(0.5, durationSec * 0.02);
  const end = Math.max(start + 0.5, durationSec - 0.5);
  const arr = [];
  for (let i = 0; i < frames; i++) {
    const t = start + (i * (end - start)) / (frames - 1);
    arr.push(Math.round(t * 1000) / 1000);
  }
  return arr;
}

function frameUrl({ cloud, publicId, second }) {
  return `https://res.cloudinary.com/${cloud}/video/upload/f_jpg,q_auto,w_1024,so_${second}/${publicId}.jpg`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { public_id, duration } = req.body || {};
    if (!public_id) return res.status(400).json({ error: "missing_public_id" });

    // 1) durata
    let videoDuration = Number(duration);
    if (!videoDuration) {
      const info = await cloudinary.api.resource(public_id, { resource_type: "video" });
      videoDuration = info?.duration;
    }
    if (!videoDuration) return res.status(400).json({ error: "missing_duration" });
    if (videoDuration > MAX_DURATION_S) {
      return res.status(400).json({ error: "video_too_long", max_seconds: MAX_DURATION_S, got: videoDuration });
    }

    // 2) 12 frame Cloudinary
    const times = computeTimes(videoDuration, 12);
    const frames = times.map(t =>
      frameUrl({ cloud: process.env.CLOUDINARY_CLOUD_NAME, publicId: public_id, second: t })
    );

    // 3) prompt + contenuto
    const systemPrompt =
      "Sei un'istruttrice equestre virtuale. Parla a un'allieva di livello principianti avanzati. Valuta solo ciò che si vede nei fotogrammi: ritmo del galoppo, postura (mani, busto, gambe), assetto in sospensione e atterraggio. Tono semplice, costruttivo, concreto. Non dare consigli pericolosi e non suggerire modifiche dell'attrezzatura. Restituisci SOLO JSON valido secondo lo schema fornito.";

    const userText =
      'Sport: equitazione (salto con due barriere). Obiettivi: ritmo continuo al galoppo; mani basse e ferme; assetto in sospensione/bilanciamento; collegamento tra due salti. I seguenti 12 fotogrammi sono in ordine temporale. Rispondi SOLO con JSON secondo lo schema: { "summary": { "highlights": [..], "to_improve": [..], "one_line_cue": "..", "sensation": ".." } }';

    const content = [{ type: "text", text: userText }];
    frames.forEach(url => content.push({ type: "image_url", image_url: { url } }));

    // 4) /v1/responses — uso fetch nativo di Node (niente librerie extra)
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content },
        ],
      }),
    });
    const data = await r.json();

    let jsonText =
      data.output_text ||
      data.output?.[0]?.content?.[0]?.text ||
      "";

    let parsed;
    try { parsed = JSON.parse(jsonText); }
    catch { return res.status(200).json({ raw_text: jsonText, frames_used: frames, duration: videoDuration }); }

    return res.status(200).json({ analysis: parsed, frames_used: frames, duration: videoDuration });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "analyze-error", details: e.message });
  }
}
