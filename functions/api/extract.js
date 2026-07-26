// Cloudflare Pages Function — POST /api/extract
// Receives a base64 image of a tax form, asks Gemini to read the key numbers,
// and returns them as JSON. The API key lives in env.GEMINI_API_KEY (a Cloudflare
// secret) and is NEVER sent to the browser.

// Confirm the current model name in Google AI Studio → "Get API key" / model list.
// Gemini 1.5 and 2.0 Flash were retired in 2026; 2.5-flash is a safe multimodal choice.
// You can bump this to a newer flash model (e.g. gemini-3.6-flash) once you confirm it.
const MODEL = "gemini-2.5-flash";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.GEMINI_API_KEY) {
    return json({ error: "Server is missing GEMINI_API_KEY. Set it in Cloudflare Pages settings." }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Expected a JSON body." }, 400);
  }

  const { imageBase64, mimeType } = payload;
  if (!imageBase64) return json({ error: "No document image provided." }, 400);

  const prompt = `You are reading a United States tax form (a W-2 or a 1099).
Extract the values below as plain numbers only — no dollar signs, no commas.
Return ONLY a JSON object with exactly these keys, using null when a value is not on the form:

{"wages": number|null, "federalWithheld": number|null, "selfEmployment": number|null, "interestDividends": number|null}

Guidance:
- wages = W-2 Box 1 (wages, tips, other compensation)
- federalWithheld = W-2 Box 2 (federal income tax withheld)
- selfEmployment = nonemployee compensation or business income (1099-NEC / 1099-MISC)
- interestDividends = interest or dividend income (1099-INT / 1099-DIV)`;

  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } }
      ]
    }],
    generationConfig: { responseMimeType: "application/json", temperature: 0 }
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY
      },
      body: JSON.stringify(body)
    });
  } catch (e) {
    return json({ error: "Could not reach Gemini.", detail: String(e) }, 502);
  }

  if (!resp.ok) {
    const detail = await resp.text();
    return json({ error: `Gemini returned ${resp.status}.`, detail }, 502);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return json({ error: "Model reply was not valid JSON.", raw: text }, 502);
  }

  return json(parsed, 200);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
