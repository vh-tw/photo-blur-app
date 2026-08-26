const imageInput = document.querySelector("#imageInput");
const photoCanvas = document.querySelector("#photoCanvas");
const emptyState = document.querySelector("#emptyState");
const imageInfo = document.querySelector("#imageInfo");
const brushSize = document.querySelector("#brushSize");
const brushSizeValue = document.querySelector("#brushSizeValue");
const brushPreviewDot = document.querySelector("#brushPreviewDot");
const blurAmount = document.querySelector("#blurAmount");
const blurAmountValue = document.querySelector("#blurAmountValue");
const blurPreviewSample = document.querySelector("#blurPreviewSample");
const featherAmount = document.querySelector("#featherAmount");
const featherAmountValue = document.querySelector("#featherAmountValue");
const featherPreviewDot = document.querySelector("#featherPreviewDot");
const paintMode = document.querySelector("#paintMode");
const rectangleMode = document.querySelector("#rectangleMode");
const ellipseMode = document.querySelector("#ellipseMode");
const eraseMode = document.querySelector("#eraseMode");
const undoButton = document.querySelector("#undoButton");
const clearButton = document.querySelector("#clearButton");
const downloadButton = document.querySelector("#downloadButton");
const exportType = document.querySelector("#exportType");
const canvasWrap = document.querySelector("#canvasWrap");
const brushCursor = document.querySelector("#brushCursor");

const ctx = photoCanvas.getContext("2d", { willReadFrequently: true });
const sourceCanvas = document.createElement("canvas");
const sourceCtx = sourceCanvas.getContext("2d");
const paddedSourceCanvas = document.createElement("canvas");
const paddedSourceCtx = paddedSourceCanvas.getContext("2d");
const effectCanvas = document.createElement("canvas");
const effectCtx = effectCanvas.getContext("2d", { willReadFrequently: true });
const compositeCanvas = document.createElement("canvas");
const compositeCtx = compositeCanvas.getContext("2d");
const strokeCanvas = document.createElement("canvas");
const strokeCtx = strokeCanvas.getContext("2d", { willReadFrequently: true });
const featherCanvas = document.createElement("canvas");
const featherCtx = featherCanvas.getContext("2d");
const blurredCanvas = document.createElement("canvas");
const blurredCtx = blurredCanvas.getContext("2d");
const layerCanvas = document.createElement("canvas");
const layerCtx = layerCanvas.getContext("2d");

let originalImage = null;
let imageName = "blurred-photo";
let drawing = false;
let mode = "paint";
let undoStack = [];
let lastPoint = null;
let shapeStart = null;
let viewZoom = 1;
let baseDisplayWidth = 0;
let baseDisplayHeight = 0;
let imageDimensionsText = "";
let dragDepth = 0;
const maxUndo = 24;
const minViewZoom = 0.2;
const maxViewZoom = 12;

function setCanvasSize(width, height) {
  [photoCanvas, sourceCanvas, effectCanvas, compositeCanvas, strokeCanvas, featherCanvas, blurredCanvas, layerCanvas].forEach((canvas) => {
    canvas.width = width;
    canvas.height = height;
  });
  paddedSourceCanvas.width = width + 120;
  paddedSourceCanvas.height = height + 120;
}

function setEnabled(enabled) {
  undoButton.disabled = !enabled || undoStack.length === 0;
  clearButton.disabled = !enabled;
  downloadButton.disabled = !enabled;
}

function formatPx(value) {
  return `${Number(value).toFixed(1)} px`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function calculateBaseDisplaySize() {
  if (!originalImage) return;

  const wrapWidth = Math.max(1, canvasWrap.clientWidth - 2);
  const wrapHeight = Math.max(1, canvasWrap.clientHeight - 2);
  const fitScale = Math.min(
    wrapWidth / photoCanvas.width,
    wrapHeight / photoCanvas.height,
    1
  );

  baseDisplayWidth = Math.max(1, photoCanvas.width * fitScale);
  baseDisplayHeight = Math.max(1, photoCanvas.height * fitScale);
}

function applyViewZoom() {
  if (!originalImage) return;
  photoCanvas.style.width = `${baseDisplayWidth * viewZoom}px`;
  photoCanvas.style.height = `${baseDisplayHeight * viewZoom}px`;
  imageInfo.textContent = `${imageDimensionsText} | ${Math.round(viewZoom * 100)}%`;
  updateLabels();
}

function resetViewZoom() {
  viewZoom = 1;
  calculateBaseDisplaySize();
  applyViewZoom();
  canvasWrap.scrollLeft = Math.max(0, (photoCanvas.offsetWidth - canvasWrap.clientWidth) / 2);
  canvasWrap.scrollTop = Math.max(0, (photoCanvas.offsetHeight - canvasWrap.clientHeight) / 2);
}

function displayedBrushSize() {
  const size = Number(brushSize.value);
  const rect = photoCanvas.getBoundingClientRect();
  const scale = originalImage && photoCanvas.width ? rect.width / photoCanvas.width : 1;
  return Math.max(0, size * scale);
}

function updateBrushCursorSize() {
  const displaySize = displayedBrushSize();
  brushCursor.style.width = `${displaySize}px`;
  brushCursor.style.height = `${displaySize}px`;
}

function updateLabels() {
  const size = Number(brushSize.value);
  const previewSize = Math.max(2, displayedBrushSize());
  brushSizeValue.value = formatPx(size);
  blurAmountValue.value = formatPx(blurAmount.value);
  featherAmountValue.value = formatPx(featherAmount.value);
  brushPreviewDot.style.width = `${previewSize}px`;
  brushPreviewDot.style.height = `${previewSize}px`;
  brushPreviewDot.style.opacity = size > 0 ? "1" : "0.28";
  blurPreviewSample.style.filter = `blur(${blurAmount.value}px)`;
  const featherCore = Math.max(25, 86 - Number(featherAmount.value) * 4);
  featherPreviewDot.style.setProperty("--feather-core", `${featherCore}%`);
  updateBrushCursorSize();
}

function drawSource() {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  sourceCtx.clearRect(0, 0, width, height);
  sourceCtx.fillStyle = "#ffffff";
  sourceCtx.fillRect(0, 0, width, height);
  sourceCtx.drawImage(originalImage, 0, 0, width, height);
}

function render() {
  if (!originalImage) return;

  ctx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);
  ctx.drawImage(sourceCanvas, 0, 0);
  ctx.drawImage(effectCanvas, 0, 0);
}

function renderStrokePreview() {
  if (!originalImage) return;
  const activeStrokeCanvas = applyFeatherToStroke();

  if (mode !== "erase") {
    prepareBlurredSource();
    layerCtx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
    layerCtx.globalCompositeOperation = "source-over";
    layerCtx.drawImage(blurredCanvas, 0, 0);
    layerCtx.globalCompositeOperation = "destination-in";
    layerCtx.drawImage(activeStrokeCanvas, 0, 0);
    layerCtx.globalCompositeOperation = "source-over";

    render();
    ctx.drawImage(layerCanvas, 0, 0);
    return;
  }

  layerCtx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
  layerCtx.globalCompositeOperation = "source-over";
  layerCtx.drawImage(effectCanvas, 0, 0);
  layerCtx.globalCompositeOperation = "destination-out";
  layerCtx.drawImage(activeStrokeCanvas, 0, 0);
  layerCtx.globalCompositeOperation = "source-over";

  ctx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);
  ctx.drawImage(sourceCanvas, 0, 0);
  ctx.drawImage(layerCanvas, 0, 0);
}

function canvasPoint(event) {
  const rect = photoCanvas.getBoundingClientRect();
  const scaleX = photoCanvas.width / rect.width;
  const scaleY = photoCanvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function zoomAtPointer(event) {
  if (!originalImage || !event.ctrlKey) return;
  event.preventDefault();

  const oldZoom = viewZoom;
  const zoomFactor = Math.exp(-event.deltaY * 0.0015);
  const nextZoom = clamp(oldZoom * zoomFactor, minViewZoom, maxViewZoom);
  if (Math.abs(nextZoom - oldZoom) < 0.001) return;

  const wrapRect = canvasWrap.getBoundingClientRect();
  const pointerX = event.clientX - wrapRect.left;
  const pointerY = event.clientY - wrapRect.top;
  const contentX = canvasWrap.scrollLeft + pointerX;
  const contentY = canvasWrap.scrollTop + pointerY;
  const ratio = nextZoom / oldZoom;

  viewZoom = nextZoom;
  applyViewZoom();

  canvasWrap.scrollLeft = contentX * ratio - pointerX;
  canvasWrap.scrollTop = contentY * ratio - pointerY;
  showBrushCursor(event);
}

function saveUndo() {
  if (!originalImage) return;
  undoStack.push(effectCtx.getImageData(0, 0, effectCanvas.width, effectCanvas.height));
  if (undoStack.length > maxUndo) undoStack.shift();
  undoButton.disabled = false;
}

function prepareBlurredSource() {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const padding = 60;

  compositeCtx.clearRect(0, 0, width, height);
  compositeCtx.drawImage(sourceCanvas, 0, 0);
  compositeCtx.drawImage(effectCanvas, 0, 0);

  paddedSourceCtx.clearRect(0, 0, paddedSourceCanvas.width, paddedSourceCanvas.height);
  paddedSourceCtx.fillStyle = "#ffffff";
  paddedSourceCtx.fillRect(0, 0, paddedSourceCanvas.width, paddedSourceCanvas.height);
  paddedSourceCtx.drawImage(compositeCanvas, padding, padding);

  paddedSourceCtx.drawImage(compositeCanvas, 0, 0, 1, height, 0, padding, padding, height);
  paddedSourceCtx.drawImage(compositeCanvas, width - 1, 0, 1, height, padding + width, padding, padding, height);
  paddedSourceCtx.drawImage(compositeCanvas, 0, 0, width, 1, padding, 0, width, padding);
  paddedSourceCtx.drawImage(compositeCanvas, 0, height - 1, width, 1, padding, padding + height, width, padding);
  paddedSourceCtx.drawImage(compositeCanvas, 0, 0, 1, 1, 0, 0, padding, padding);
  paddedSourceCtx.drawImage(compositeCanvas, width - 1, 0, 1, 1, padding + width, 0, padding, padding);
  paddedSourceCtx.drawImage(compositeCanvas, 0, height - 1, 1, 1, 0, padding + height, padding, padding);
  paddedSourceCtx.drawImage(compositeCanvas, width - 1, height - 1, 1, 1, padding + width, padding + height, padding, padding);

  blurredCtx.clearRect(0, 0, width, height);
  blurredCtx.filter = `blur(${blurAmount.value}px)`;
  blurredCtx.drawImage(paddedSourceCanvas, padding, padding, width, height, 0, 0, width, height);
  blurredCtx.filter = "none";
}

function drawStrokeShape(from, to) {
  const size = Number(brushSize.value);
  if (size <= 0) return false;

  strokeCtx.save();
  strokeCtx.fillStyle = "rgba(0, 0, 0, 1)";
  strokeCtx.strokeStyle = "rgba(0, 0, 0, 1)";
  strokeCtx.lineCap = "round";
  strokeCtx.lineJoin = "round";

  if (to) {
    strokeCtx.lineWidth = size;
    strokeCtx.beginPath();
    strokeCtx.moveTo(from.x, from.y);
    strokeCtx.lineTo(to.x, to.y);
    strokeCtx.stroke();
  } else {
    strokeCtx.beginPath();
    strokeCtx.arc(from.x, from.y, size / 2, 0, Math.PI * 2);
    strokeCtx.fill();
  }

  strokeCtx.restore();
  return true;
}

function drawSelectionShape(from, to) {
  const left = Math.min(from.x, to.x);
  const top = Math.min(from.y, to.y);
  const width = Math.abs(to.x - from.x);
  const height = Math.abs(to.y - from.y);

  strokeCtx.clearRect(0, 0, strokeCanvas.width, strokeCanvas.height);
  strokeCtx.save();
  strokeCtx.fillStyle = "rgba(0, 0, 0, 1)";

  if (mode === "rectangle") {
    strokeCtx.fillRect(left, top, width, height);
  } else {
    strokeCtx.beginPath();
    strokeCtx.ellipse(
      left + width / 2,
      top + height / 2,
      width / 2,
      height / 2,
      0,
      0,
      Math.PI * 2
    );
    strokeCtx.fill();
  }

  strokeCtx.restore();
}

function applyFeatherToStroke() {
  const feather = Number(featherAmount.value);
  featherCtx.clearRect(0, 0, featherCanvas.width, featherCanvas.height);

  if (feather <= 0) {
    featherCtx.filter = "none";
    featherCtx.drawImage(strokeCanvas, 0, 0);
    return featherCanvas;
  }

  featherCtx.filter = `blur(${feather}px)`;
  featherCtx.drawImage(strokeCanvas, 0, 0);
  featherCtx.filter = "none";
  featherCtx.globalCompositeOperation = "destination-in";
  featherCtx.drawImage(strokeCanvas, 0, 0);
  featherCtx.globalCompositeOperation = "source-over";
  return featherCanvas;
}

function commitActiveStroke() {
  const activeStrokeCanvas = applyFeatherToStroke();

  if (mode !== "erase") {
    prepareBlurredSource();
    layerCtx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
    layerCtx.globalCompositeOperation = "source-over";
    layerCtx.drawImage(blurredCanvas, 0, 0);
    layerCtx.globalCompositeOperation = "destination-in";
    layerCtx.drawImage(activeStrokeCanvas, 0, 0);
    layerCtx.globalCompositeOperation = "source-over";
    effectCtx.drawImage(layerCanvas, 0, 0);
  } else {
    effectCtx.save();
    effectCtx.globalCompositeOperation = "destination-out";
    effectCtx.drawImage(activeStrokeCanvas, 0, 0);
    effectCtx.restore();
  }

  render();
}

function showBrushCursor(event) {
  if (!originalImage) return;

  if (mode === "rectangle" || mode === "ellipse") {
    brushCursor.style.display = "none";
    return;
  }

  const size = Number(brushSize.value);
  if (size <= 0) {
    brushCursor.style.display = "none";
    return;
  }

  const canvasRect = photoCanvas.getBoundingClientRect();
  const wrapRect = canvasWrap.getBoundingClientRect();
  const inside =
    event.clientX >= canvasRect.left &&
    event.clientX <= canvasRect.right &&
    event.clientY >= canvasRect.top &&
    event.clientY <= canvasRect.bottom;

  if (!inside) {
    brushCursor.style.display = "none";
    return;
  }

  updateBrushCursorSize();
  brushCursor.style.display = "block";
  brushCursor.style.left = `${event.clientX - wrapRect.left + canvasWrap.scrollLeft}px`;
  brushCursor.style.top = `${event.clientY - wrapRect.top + canvasWrap.scrollTop}px`;
}

photoCanvas.addEventListener("pointerdown", (event) => {
  if (!originalImage) return;
  event.preventDefault();
  photoCanvas.setPointerCapture(event.pointerId);
  saveUndo();
  strokeCtx.clearRect(0, 0, strokeCanvas.width, strokeCanvas.height);
  drawing = true;
  lastPoint = canvasPoint(event);
  shapeStart = lastPoint;
  if (mode === "paint" || mode === "erase") {
    drawStrokeShape(lastPoint);
  }
  renderStrokePreview();
  showBrushCursor(event);
});

photoCanvas.addEventListener("pointermove", (event) => {
  event.preventDefault();
  showBrushCursor(event);
  if (!drawing || !originalImage) return;
  const point = canvasPoint(event);
  if (mode === "rectangle" || mode === "ellipse") {
    drawSelectionShape(shapeStart, point);
  } else {
    drawStrokeShape(lastPoint, point);
  }
  lastPoint = point;
  renderStrokePreview();
});

function finishDrawing(event) {
  if (!drawing) return;
  commitActiveStroke();
  strokeCtx.clearRect(0, 0, strokeCanvas.width, strokeCanvas.height);
  drawing = false;
  lastPoint = null;
  shapeStart = null;
  if (event.pointerId !== undefined) {
    photoCanvas.releasePointerCapture(event.pointerId);
  }
  setEnabled(true);
}

photoCanvas.addEventListener("pointerup", finishDrawing);
photoCanvas.addEventListener("pointercancel", finishDrawing);
photoCanvas.addEventListener("dragstart", (event) => event.preventDefault());
photoCanvas.addEventListener("contextmenu", (event) => event.preventDefault());
photoCanvas.addEventListener("pointerleave", () => {
  if (!drawing) {
    lastPoint = null;
    brushCursor.style.display = "none";
  }
});

function loadImageFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const img = new Image();
  img.onload = () => {
    originalImage = img;
    imageName = file.name.replace(/\.[^.]+$/, "") || "blurred-photo";
    setCanvasSize(img.naturalWidth, img.naturalHeight);
    drawSource();
    effectCtx.clearRect(0, 0, effectCanvas.width, effectCanvas.height);
    strokeCtx.clearRect(0, 0, strokeCanvas.width, strokeCanvas.height);
    featherCtx.clearRect(0, 0, featherCanvas.width, featherCanvas.height);
    undoStack = [];
    emptyState.style.display = "none";
    photoCanvas.style.display = "block";
    imageDimensionsText = `${img.naturalWidth} x ${img.naturalHeight}px`;
    setEnabled(true);
    resetViewZoom();
    render();
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(file);
}

imageInput.addEventListener("change", () => {
  loadImageFile(imageInput.files && imageInput.files[0]);
});

canvasWrap.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  canvasWrap.classList.add("is-dragging");
});

canvasWrap.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
});

canvasWrap.addEventListener("dragleave", (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) canvasWrap.classList.remove("is-dragging");
});

canvasWrap.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  canvasWrap.classList.remove("is-dragging");
  const files = Array.from(event.dataTransfer?.files || []);
  loadImageFile(files.find((file) => file.type.startsWith("image/")));
});

brushSize.addEventListener("input", updateLabels);
blurAmount.addEventListener("input", updateLabels);
featherAmount.addEventListener("input", updateLabels);
window.addEventListener("resize", updateLabels);
canvasWrap.addEventListener("wheel", zoomAtPointer, { passive: false });
window.addEventListener("resize", () => {
  if (!originalImage) return;
  calculateBaseDisplaySize();
  applyViewZoom();
});

function setMode(nextMode, activeButton) {
  mode = nextMode;
  [paintMode, rectangleMode, ellipseMode, eraseMode].forEach((button) => {
    button.classList.toggle("active", button === activeButton);
  });
  brushCursor.style.display = "none";
}

paintMode.addEventListener("click", () => setMode("paint", paintMode));
rectangleMode.addEventListener("click", () => setMode("rectangle", rectangleMode));
ellipseMode.addEventListener("click", () => setMode("ellipse", ellipseMode));
eraseMode.addEventListener("click", () => setMode("erase", eraseMode));

undoButton.addEventListener("click", () => {
  const previous = undoStack.pop();
  if (!previous) return;
  effectCtx.putImageData(previous, 0, 0);
  render();
  setEnabled(true);
});

clearButton.addEventListener("click", () => {
  if (!originalImage) return;
  saveUndo();
  effectCtx.clearRect(0, 0, effectCanvas.width, effectCanvas.height);
  render();
  setEnabled(true);
});

function imageFileDetails() {
  const mimeType = exportType.value;
  const extension = mimeType === "image/png" ? "png" : "jpg";
  const quality = mimeType === "image/jpeg" ? 0.98 : undefined;
  return {
    mimeType,
    extension,
    quality,
    fileName: `${imageName}-blurred.${extension}`,
  };
}

function canvasBlob(mimeType, quality) {
  return new Promise((resolve, reject) => {
    const exportCanvas = prepareExportCanvas(mimeType);
    exportCanvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("無法建立圖片檔案"));
      }
    }, mimeType, quality);
  });
}

function prepareExportCanvas(mimeType) {
  if (mimeType !== "image/jpeg") return photoCanvas;

  const exportCanvas = document.createElement("canvas");
  const exportCtx = exportCanvas.getContext("2d");
  exportCanvas.width = photoCanvas.width;
  exportCanvas.height = photoCanvas.height;
  exportCtx.fillStyle = "#ffffff";
  exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  exportCtx.drawImage(photoCanvas, 0, 0);
  return exportCanvas;
}

function fallbackDownload(details) {
  const link = document.createElement("a");
  link.download = details.fileName;
  link.href = prepareExportCanvas(details.mimeType).toDataURL(details.mimeType, details.quality);
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

downloadButton.addEventListener("click", async () => {
  if (!originalImage) return;
  render();

  const details = imageFileDetails();

  if (!window.showSaveFilePicker) {
    fallbackDownload(details);
    return;
  }

  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: details.fileName,
      types: [
        {
          description: details.extension === "png" ? "PNG 圖片" : "JPG 圖片",
          accept: {
            [details.mimeType]: [`.${details.extension}`],
          },
        },
      ],
    });
    const writable = await handle.createWritable();
    const blob = await canvasBlob(details.mimeType, details.quality);
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    if (error && error.name === "AbortError") return;
    fallbackDownload(details);
  }
});

updateLabels();
setEnabled(false);
