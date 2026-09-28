/* ============================================================
   PixelDoc: JPG to PDF Converter
   Standalone vanilla JS (no React, no Next.js)
   Uses pdf-lib loaded from CDN in index.html
   ============================================================ */

(() => {
  "use strict";

  // ── State ──
  let images = [];      // { id, file, previewUrl, rotation }
  let dragItemIdx = null;
  let dragOverIdx = null;

  // ── DOM refs ──
  const dropzone      = document.getElementById("dropzone");
  const fileInput      = document.getElementById("fileInput");
  const imageSection   = document.getElementById("imageSection");
  const imageGrid      = document.getElementById("imageGrid");
  const pageSizeSel    = document.getElementById("pageSize");
  const orientationSel = document.getElementById("orientation");
  const marginSel      = document.getElementById("margin");
  const fitSel         = document.getElementById("fit");
  const outputNameIn   = document.getElementById("outputName");
  const convertBtn     = document.getElementById("convertBtn");
  const progressArea   = document.getElementById("progressArea");
  const phaseText      = document.getElementById("phaseText");
  const progressBar    = document.getElementById("progressBar");
  const progressPct    = document.getElementById("progressPct");
  const errorMsg       = document.getElementById("errorMsg");
  const successMsg     = document.getElementById("successMsg");

  // ── Unique ID helper ──
  function uid() { return Math.random().toString(36).slice(2); }

  // ── Show / hide helpers ──
  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  // ── Handle added files ──
  function handleFiles(fileList) {
    const files = Array.from(fileList);
    const items = files.map(f => ({
      id: uid(),
      file: f,
      previewUrl: URL.createObjectURL(f),
      rotation: 0,
    }));
    images = images.concat(items);
    hide(errorMsg);
    hide(successMsg);
    renderGrid();
    show(imageSection);
  }

  // ── Remove an image ──
  function removeImage(id) {
    const item = images.find(i => i.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    images = images.filter(i => i.id !== id);
    renderGrid();
    if (images.length === 0) hide(imageSection);
  }

  // ── Rotate an image 90° ──
  function rotateImage(id) {
    images = images.map(i =>
      i.id === id ? { ...i, rotation: (i.rotation + 90) % 360 } : i
    );
    renderGrid();
  }

  // ── Render the image grid ──
  function renderGrid() {
    imageGrid.innerHTML = "";
    images.forEach((item, idx) => {
      const tile = document.createElement("div");
      tile.className = "image-tile";
      tile.draggable = true;

      tile.addEventListener("dragstart", () => {
        dragItemIdx = idx;
        tile.classList.add("dragging");
      });
      tile.addEventListener("dragenter", (e) => {
        e.preventDefault();
        dragOverIdx = idx;
        tile.classList.add("drag-over-tile");
      });
      tile.addEventListener("dragleave", () => {
        tile.classList.remove("drag-over-tile");
      });
      tile.addEventListener("dragover", (e) => e.preventDefault());
      tile.addEventListener("dragend", () => {
        tile.classList.remove("dragging");
        document.querySelectorAll(".drag-over-tile").forEach(el =>
          el.classList.remove("drag-over-tile")
        );
        if (dragItemIdx !== null && dragOverIdx !== null && dragItemIdx !== dragOverIdx) {
          const newImages = [...images];
          const [moved] = newImages.splice(dragItemIdx, 1);
          newImages.splice(dragOverIdx, 0, moved);
          images = newImages;
          renderGrid();
        }
        dragItemIdx = null;
        dragOverIdx = null;
      });

      const img = document.createElement("img");
      img.src = item.previewUrl;
      img.alt = item.file.name;
      img.style.transform = `rotate(${item.rotation}deg)`;
      tile.appendChild(img);

      const controls = document.createElement("div");
      controls.className = "image-tile-controls";

      const rotateBtn = document.createElement("button");
      rotateBtn.className = "btn-rotate";
      rotateBtn.title = "Rotate";
      rotateBtn.textContent = "🔄";
      rotateBtn.addEventListener("click", () => rotateImage(item.id));

      const removeBtn = document.createElement("button");
      removeBtn.className = "btn-remove";
      removeBtn.title = "Remove";
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => removeImage(item.id));

      controls.appendChild(rotateBtn);
      controls.appendChild(removeBtn);
      tile.appendChild(controls);
      imageGrid.appendChild(tile);
    });
  }

  // ── Dropzone events ──
  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-over");
  });
  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("drag-over");
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
    handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener("change", (e) => {
    handleFiles(e.target.files);
    fileInput.value = ""; // allow re-selecting same files
  });

  // ── Convert ──
  convertBtn.addEventListener("click", async () => {
    if (images.length === 0) return;

    convertBtn.disabled = true;
    convertBtn.textContent = "Converting...";
    hide(errorMsg);
    hide(successMsg);
    show(progressArea);

    const DURATION = 4000;
    const TICK = 50;
    const steps = DURATION / TICK;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      const pct = Math.min(Math.round((step / steps) * 100), 100);
      progressBar.style.width = pct + "%";
      progressPct.textContent = pct + "%";

      if (pct < 30)      phaseText.textContent = "Initializing PDF compiler...";
      else if (pct < 65)  phaseText.textContent = "Configuring page margins & dimensions...";
      else if (pct < 90)  phaseText.textContent = "Embedding JPG image streams...";
      else                phaseText.textContent = "Compiling final PDF document...";

      if (step >= steps) clearInterval(timer);
    }, TICK);

    try {
      const { PDFDocument, degrees } = PDFLib;

      const buildPromise = (async () => {
        const pdfDoc = await PDFDocument.create();
        const pageSizes = { A4: [595.28, 841.89], Letter: [612, 792] };
        const pageSize = pageSizeSel.value;
        const orientation = orientationSel.value;
        const margin = marginSel.value;
        const fit = fitSel.value;

        for (const item of images) {
          const arrayBuffer = await item.file.arrayBuffer();
          const imgBytes = new Uint8Array(arrayBuffer);

          // Detect format and embed accordingly
          let imgEmbed;
          const name = item.file.name.toLowerCase();
          if (name.endsWith(".png")) {
            imgEmbed = await pdfDoc.embedPng(imgBytes);
          } else {
            imgEmbed = await pdfDoc.embedJpg(imgBytes);
          }

          const imgDims = imgEmbed.scale(1);

          let pw, ph;
          if (pageSize === "Original") {
            pw = imgDims.width;
            ph = imgDims.height;
          } else {
            [pw, ph] = pageSizes[pageSize];
          }

          const isLandscape = orientation === "Landscape" ||
            (orientation === "Auto" && imgDims.width > imgDims.height);
          if (isLandscape && pageSize !== "Original") {
            [pw, ph] = [ph, pw];
          }

          const marginPx = { None: 0, Small: 10, Normal: 30 };
          const m = marginPx[margin];
          const page = pdfDoc.addPage([pw, ph]);
          const availW = pw - m * 2;
          const availH = ph - m * 2;

          let drawW = availW;
          let drawH = availH;
          if (fit === "Fit") {
            const scale = Math.min(availW / imgDims.width, availH / imgDims.height);
            drawW = imgDims.width * scale;
            drawH = imgDims.height * scale;
          } else if (fit === "Fill") {
            const scale = Math.max(availW / imgDims.width, availH / imgDims.height);
            drawW = imgDims.width * scale;
            drawH = imgDims.height * scale;
          } else {
            drawW = imgDims.width;
            drawH = imgDims.height;
          }

          const x = m + (availW - drawW) / 2;
          const y = m + (availH - drawH) / 2;
          page.drawImage(imgEmbed, {
            x, y, width: drawW, height: drawH,
            rotate: degrees(item.rotation),
          });
        }

        return await pdfDoc.save();
      })();

      const delayPromise = new Promise(resolve => setTimeout(resolve, DURATION));
      const [pdfBytes] = await Promise.all([buildPromise, delayPromise]);

      progressBar.style.width = "100%";
      progressPct.textContent = "100%";

      const safeName = (outputNameIn.value.trim().replace(/[/\\?%*:|"<>]/g, "-") || "images") + ".pdf";
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = safeName;
      a.click();
      URL.revokeObjectURL(a.href);

      show(successMsg);
    } catch (err) {
      clearInterval(timer);
      errorMsg.textContent = err.message || "Conversion failed.";
      show(errorMsg);
    } finally {
      clearInterval(timer);
      convertBtn.disabled = false;
      convertBtn.textContent = "Convert to PDF";
      setTimeout(() => hide(progressArea), 1500);
    }
  });
})();
