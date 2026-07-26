// Front-end for the AI document reader.
// Add this to the page and include an <input type="file" id="docUpload"> and
// an optional status element <p id="docStatus"></p>. See the snippet at the
// bottom of this file for the HTML to drop into index.html.

async function readTaxDocument(file) {
  const imageBase64 = await fileToBase64(file);
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mimeType: file.type })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Extraction failed");
  return data;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]); // strip the "data:...;base64," prefix
    r.onerror = () => reject(new Error("Could not read the file"));
    r.readAsDataURL(file);
  });
}

function setField(id, value) {
  if (value == null) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true })); // triggers the worksheet to recalculate
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
      if (status) status.textContent = "Filled in — double-check every figure before relying on it.";
    } catch (err) {
      if (status) status.textContent = "Couldn't read that file. Try a clearer photo, or enter the values by hand.";
    } finally {
      input.value = ""; // allow re-uploading the same file
    }
  });
});

/*  ---- HTML to add inside the "Income" section of index.html ----

  <div class="field">
    <label>Read from a document <span class="hint">photo or scan of a W-2 / 1099</span></label>
    <input type="file" id="docUpload" accept="image/*">
    <p id="docStatus" class="hint" style="margin-top:6px"></p>
  </div>

  ---- and near the bottom, alongside <script src="script.js"></script> ----

  <script src="reader.js"></script>
*/
