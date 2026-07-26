// Cloudflare Pages Function — POST /api/extract
// Reads a tax form and returns the key numbers as JSON.
// Accepts EITHER an image/PDF (imageBase64 + mimeType) OR plain text (text),
// so Word documents can be converted to text in the browser and sent here.
// The API key lives in env.GEMINI_API_KEY (a Cloudflare secret) — never the browser.

// Confirm the current model name in Google AI Studio. Gemini 1.5 and 2.0 Flash
// were retired in 2026; 2.5-flash reads both images and PDFs. If you get a 404,
// this name is the thing to change.
const MODEL = "gemini-2.5-flash";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.GEMINI_API_KEY) {
    return json({ error: "Server is missing GEMINI_API_KEY. Add it in Cloudflare → your Pages project → Settings → Variables and secrets, then redeploy." }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Expected a JSON body." }, 400);
  }

  const { imageBase64, mimeType, text } = payload;
  if (!imageBase64 && !text) return json({ error: "No document was provided." }, 400);

  const instruction = `You are reading a United States tax form (a W-2 or a 1099).
Extract the values below as plain numbers only — no dollar signs, no commas.
Return ONLY a JSON object with exactly these keys, using null when a value is not present:

{"wages": number|null, "federalWithheld": number|null, "selfEmployment": number|null, "interestDividends": number|null}

Guidance:
- wages = W-2 Box 1 (wages, tips, other compensation)
- federalWithheld = W-2 Box 2 (federal income tax withheld)
- selfEmployment = nonemployee compensation or business income (1099-NEC / 1099-MISC)
- interestDividends = interest or dividend income (1099-INT / 1099-DIV)`;

  const parts = [{ text: instruction }];
  if (text) {
    parts.push({ text: "\n\nHere is the text of the document:\n" + text });
  } else {
    parts.push({ inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } });
  }

  const body = {
    contents: [{ parts }],
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

  const raw = await resp.text();

  if (!resp.ok) {
    return json({
      error: `Gemini returned ${resp.status}. 404 usually means the model name is wrong; 400/403 usually means the API key is bad or missing.`,
      detail: raw
    }, 502);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return json({ error: "Gemini's reply wasn't valid JSON.", detail: raw }, 502);
  }

  let out = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  out = out.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim(); // strip fences just in case

  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch {
    return json({ error: "Couldn't parse the extracted values.", detail: out }, 502);
  }

  return json(parsed, 200);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
