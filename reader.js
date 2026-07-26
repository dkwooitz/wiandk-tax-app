// AI document reader — supports images, PDFs, and Word (.docx).
//   • Images and PDFs are sent straight to Gemini (it reads both natively).
//   • Word .docx is converted to text in the browser first, because Gemini
//     cannot read .docx directly. Old .doc (legacy binary) is unreliable —
//     if a Word file fails, saving it as PDF is the most dependable fix.

const MAMMOTH_URL = "https://cdn.jsdelivr.net/npm/mammoth/mammoth.browser.min.js";

async function readTaxDocument(file) {
  const name = (file.name || "").toLowerCase();
  const isWord =
    name.endsWith(".docx") || name.endsWith(".doc") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  let payload;
  if (isWord) {
    const text = await extractWordText(file);
    if (!text || !text.trim()) {
      throw new Error("That Word file had no readable text. Save it as a PDF and try again.");
    }
    payload = { text };
  } else {
    const imageBase64 = await fileToBase64(file);
    payload = { imageBase64, mimeType: file.type || guessMime(name) };
  }

  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("The server sent back something unreadable — check the Functions log in Cloudflare.");
  }

  if (!res.ok) {
    console.error("Extract endpoint error:", data);
    const detail = data.detail ? " — " + trim(data.detail) : "";
    throw new Error((data.error || `Request failed (${res.status}).`) + detail);
  }
  return data;
}

function guessMime(name) {
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function trim(s) {
  s = String(s);
  return s.length > 200 ? s.slice(0, 200) + "…" : s;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]); // strip the "data:...;base64," prefix
    r.onerror = () => reject(new Error("Could not read the file from disk."));
    r.readAsDataURL(file);
  });
}

// Load mammoth.js once (only when a Word file is actually chosen).
let mammothLoading;
function loadMammoth() {
  if (window.mammoth) return Promise.resolve(window.mammoth);
  if (!mammothLoading) {
    mammothLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = MAMMOTH_URL;
      s.onload = () => resolve(window.mammoth);
      s.onerror = () => reject(new Error("Couldn't load the Word reader. Check your connection, or save the file as PDF."));
      document.head.appendChild(s);
    });
  }
  return mammothLoading;
}

async function extractWordText(file) {
  const mammoth = await loadMammoth();
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

function setField(id, value) {
  if (value == null) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true })); // recalculates the worksheet
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("docUpload");
  const status = document.getElementById("docStatus");
  if (!input) return;

  input.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (status) status.textContent = "Reading the document…";

    try {
      const d = await readTaxDocument(file);
      setField("wages", d.wages);
      setField("withheld", d.federalWithheld);
      setField("se", d.selfEmployment);
      setField("ordinv", d.interestDividends);

      const gotSomething = [d.wages, d.federalWithheld, d.selfEmployment, d.interestDividends]
        .some(v => v != null);
      if (status) {
        status.textContent = gotSomething
          ? "Filled in — double-check every figure before relying on it."
          : "The reader ran but found none of the expected boxes. Make sure it's a W-2 or 1099, or enter the values by hand.";
      }
    } catch (err) {
      console.error(err);
      if (status) status.textContent = err.message || "Couldn't read that file.";
    } finally {
      input.value = ""; // allow re-uploading the same file
    }
  });
});
