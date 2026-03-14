let cam;
let socket;

let faceLandmarker = null;
let faceLandmarkerReady = false;
let lastVideoTime = -1;

let faceDetected = false;
let statusText = "Loading face tracker...";

let eyeOpenValue = 0.32;
let smoothedEyeOpenValue = 0.32;

let clarityValue = 0;
let smoothedClarityValue = 0;

let currentBlur = 15;
let currentFogAlpha = 165;

let targetBlur = 15;
let targetFogAlpha = 165;

let sendGraphics;
let lastFrameSentAt = 0;
let sendIntervalMs = 120;

let qrPanelCreated = false;
let mobileViewerURL = "";

let currentLandmarks = null;
let leftEyeBox = null;
let rightEyeBox = null;

const LEFT_EYE_INDICES = [33, 133, 159, 145, 160, 144, 158, 153];
const RIGHT_EYE_INDICES = [362, 263, 386, 374, 385, 380, 387, 373];

function setup() {
  createCanvas(windowWidth, windowHeight);

  cam = createCapture(VIDEO);
  cam.size(640, 480);
  cam.hide();

  socket = io();

  sendGraphics = createGraphics(640, 480);

  textFont("Arial");
  noStroke();

  setupFaceLandmarker();
  createQRCodePanel();
}

async function setupFaceLandmarker() {
  while (!window.mediapipeReady) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  try {
    const vision = await window.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    faceLandmarker = await window.FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: false,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    faceLandmarkerReady = true;
    statusText = "Face tracker ready";
  } catch (error) {
    console.error(error);
    statusText = "Failed to load face tracker";
  }
}

function draw() {
  background(0);

  updateFaceTracking();
  updateVisionState();

  drawBaseBlurredCamera();
  drawPeripheralGhosting();
  drawFocusedClarityEllipse();
  drawResidualLightScatter();
  drawUniformFog();
  drawSoftHaze();
  drawFineTexture();
  drawHorizontalVeil();
  drawSquintOcclusion();
  drawAlgorithmGazeOverlay();
  drawVignette();
  drawStatusText();

  sendClearFeedToMobile();
}

function updateFaceTracking() {
  faceDetected = false;
  currentLandmarks = null;
  leftEyeBox = null;
  rightEyeBox = null;

  if (!faceLandmarkerReady) {
    return;
  }

  if (!cam || !cam.elt || cam.elt.readyState < 2) {
    statusText = "Waiting for camera...";
    return;
  }

  if (cam.elt.currentTime === lastVideoTime) {
    return;
  }

  lastVideoTime = cam.elt.currentTime;

  let results = null;

  try {
    results = faceLandmarker.detectForVideo(cam.elt, performance.now());
  } catch (error) {
    console.error(error);
    statusText = "Face detection error";
    return;
  }

  if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
    faceDetected = true;
    statusText = "Face detected";

    const landmarks = results.faceLandmarks[0];
    currentLandmarks = landmarks;

    const leftEyeOpen = getEyeOpenRatio(landmarks, 159, 145, 33, 133);
    const rightEyeOpen = getEyeOpenRatio(landmarks, 386, 374, 362, 263);

    eyeOpenValue = (leftEyeOpen + rightEyeOpen) * 0.5;

    leftEyeBox = getEyeBoundingBox(landmarks, LEFT_EYE_INDICES, 20);
    rightEyeBox = getEyeBoundingBox(landmarks, RIGHT_EYE_INDICES, 20);
  } else {
    faceDetected = false;
    statusText = "No face detected";
  }
}

function getEyeOpenRatio(landmarks, upperIndex, lowerIndex, leftCornerIndex, rightCornerIndex) {
  const upper = landmarks[upperIndex];
  const lower = landmarks[lowerIndex];
  const leftCorner = landmarks[leftCornerIndex];
  const rightCorner = landmarks[rightCornerIndex];

  const verticalDist = dist(upper.x, upper.y, lower.x, lower.y);
  const horizontalDist = dist(leftCorner.x, leftCorner.y, rightCorner.x, rightCorner.y);

  if (horizontalDist === 0) {
    return 0;
  }

  return verticalDist / horizontalDist;
}

function updateVisionState() {
  smoothedEyeOpenValue = lerp(smoothedEyeOpenValue, eyeOpenValue, 0.2);

  if (faceDetected) {
    clarityValue = constrain(
      map(smoothedEyeOpenValue, 0.60, 0.28, 0, 1),
      0,
      1
    );

    clarityValue = pow(clarityValue, 1.45);
  } else {
    clarityValue = 0;
  }

  smoothedClarityValue = lerp(smoothedClarityValue, clarityValue, 0.14);

  targetBlur = lerp(16, 11.2, smoothedClarityValue);
  targetFogAlpha = lerp(170, 118, smoothedClarityValue);

  currentBlur = lerp(currentBlur, targetBlur, 0.1);
  currentFogAlpha = lerp(currentFogAlpha, targetFogAlpha, 0.1);
}

function drawBaseBlurredCamera() {
  push();
  drawingContext.filter = `blur(${currentBlur}px)`;
  drawCameraCover();
  pop();
}

function drawPeripheralGhosting() {
  let strength = smoothedClarityValue;
  if (strength <= 0.01) return;

  let cx = width * 0.5;
  let cy = height * 0.52;
  let focusW = lerp(width * 0.75, width * 0.46, strength);
  let focusH = lerp(height * 0.45, height * 0.22, strength);

  let ghostAlpha = lerp(0, 46, strength);
  let ghostBlur = lerp(8.5, 4.5, strength);
  let shiftX = lerp(9, 16, strength);
  let shiftY = lerp(3, 7, strength);

  push();

  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(0, 0, width, height);
  drawingContext.ellipse(cx, cy, focusW * 0.5, focusH * 0.5, 0, 0, Math.PI * 2);
  drawingContext.clip("evenodd");

  tint(255, ghostAlpha);
  drawingContext.filter = `blur(${ghostBlur}px)`;
  drawCameraCoverWithOffset(-shiftX, -shiftY);

  drawingContext.restore();

  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(0, 0, width, height);
  drawingContext.ellipse(cx, cy, focusW * 0.5, focusH * 0.5, 0, 0, Math.PI * 2);
  drawingContext.clip("evenodd");

  tint(255, ghostAlpha * 0.7);
  drawingContext.filter = `blur(${ghostBlur + 1}px)`;
  drawCameraCoverWithOffset(shiftX, shiftY);

  drawingContext.restore();

  noTint();
  pop();
}

function drawFocusedClarityEllipse() {
  let strength = smoothedClarityValue;
  if (strength <= 0.01) return;

  let centerX = width * 0.5;
  let centerY = height * 0.52;

  let ellipseW = lerp(width * 0.74, width * 0.34, strength);
  let ellipseH = lerp(height * 0.44, height * 0.12, strength);

  let localBlur = lerp(8.2, 0.25, strength);

  push();

  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.ellipse(centerX, centerY, ellipseW * 0.5, ellipseH * 0.5, 0, 0, Math.PI * 2);
  drawingContext.clip();
  drawingContext.filter = `blur(${localBlur}px)`;
  drawCameraCover();
  drawingContext.restore();

  pop();

  drawEllipseFeather(centerX, centerY, ellipseW, ellipseH, strength);
}

function drawEllipseFeather(cx, cy, ew, eh, strength) {
  push();
  noStroke();

  let featherSteps = 30;

  for (let i = 0; i < featherSteps; i++) {
    let t = i / (featherSteps - 1);
    let alpha = lerp(0, 20 * strength, t);
    fill(236, 239, 243, alpha);

    let extraW = lerp(0, width * 0.16, t);
    let extraH = lerp(0, height * 0.10, t);

    ellipse(cx, cy, ew + extraW, eh + extraH);
  }

  pop();
}

function drawResidualLightScatter() {
  let strength = smoothedClarityValue;

  let glowX = width * 0.5 + sin(frameCount * 0.004) * width * 0.012;
  let glowY = height * 0.35 + cos(frameCount * 0.0035) * height * 0.01;

  let scatterAlpha = lerp(18, 10, strength);
  let scatterSize = lerp(1.02, 0.84, strength);

  push();
  blendMode(ADD);

  for (let r = 260; r > 0; r -= 20) {
    let alpha = map(r, 260, 0, 0.3, 2.0) * scatterAlpha * 0.08;
    fill(255, 255, 255, alpha);
    ellipse(glowX, glowY, r * 2 * scatterSize);
  }

  for (let r = 220; r > 0; r -= 22) {
    let alpha = map(r, 220, 0, 0.2, 1.2) * scatterAlpha * 0.05;
    fill(255, 248, 245, alpha);
    ellipse(glowX + width * 0.04, glowY + height * 0.02, r * 2 * scatterSize);
  }

  pop();
}

function drawCameraCover() {
  let cover = getCameraCoverRect();
  image(cam, cover.x, cover.y, cover.w, cover.h);
}

function drawCameraCoverWithOffset(dx, dy) {
  let cover = getCameraCoverRect();
  image(cam, cover.x + dx, cover.y + dy, cover.w, cover.h);
}

function getCameraCoverRect() {
  let camAspect = cam.width / cam.height;
  let canvasAspect = width / height;

  let drawW, drawH, offsetX, offsetY;

  if (camAspect > canvasAspect) {
    drawH = height;
    drawW = drawH * camAspect;
    offsetX = (width - drawW) * 0.5;
    offsetY = 0;
  } else {
    drawW = width;
    drawH = drawW / camAspect;
    offsetX = 0;
    offsetY = (height - drawH) * 0.5;
  }

  return {
    x: offsetX,
    y: offsetY,
    w: drawW,
    h: drawH
  };
}

function drawUniformFog() {
  push();

  let fogReduction = lerp(1.0, 0.86, smoothedClarityValue);

  fill(238, 240, 244, currentFogAlpha * fogReduction);
  rect(0, 0, width, height);

  fill(255, 255, 255, currentFogAlpha * 0.08 * fogReduction);
  rect(0, 0, width, height);

  pop();
}

function drawSoftHaze() {
  push();
  noStroke();

  let hazeReduction = lerp(1.0, 0.88, smoothedClarityValue);

  let driftX1 = width * 0.5 + sin(frameCount * 0.0025) * width * 0.015;
  let driftY1 = height * 0.45 + cos(frameCount * 0.002) * height * 0.012;

  let driftX2 = width * 0.32 + cos(frameCount * 0.0018) * width * 0.012;
  let driftY2 = height * 0.62 + sin(frameCount * 0.0015) * height * 0.01;

  let driftX3 = width * 0.72 + sin(frameCount * 0.0017) * width * 0.01;
  let driftY3 = height * 0.34 + cos(frameCount * 0.0019) * height * 0.01;

  fill(255, 255, 255, currentFogAlpha * 0.055 * hazeReduction);
  ellipse(driftX1, driftY1, width * 0.95, height * 0.78);

  fill(255, 255, 255, currentFogAlpha * 0.04 * hazeReduction);
  ellipse(driftX2, driftY2, width * 0.72, height * 0.60);

  fill(255, 255, 255, currentFogAlpha * 0.03 * hazeReduction);
  ellipse(driftX3, driftY3, width * 0.65, height * 0.52);

  pop();
}

function drawFineTexture() {
  push();
  strokeWeight(1);

  let textureReduction = lerp(1.0, 0.90, smoothedClarityValue);

  for (let y = 0; y < height; y += 2) {
    let alpha = (2 + noise(y * 0.02, frameCount * 0.01) * 4) * textureReduction;
    stroke(255, alpha);
    line(0, y, width, y);
  }

  pop();
}

function drawHorizontalVeil() {
  push();
  noStroke();

  let veilReduction = lerp(1.0, 0.87, smoothedClarityValue);

  for (let y = 0; y < height; y += 12) {
    let alpha = map(noise(y * 0.015, frameCount * 0.004), 0, 1, 1, 6) * veilReduction;
    fill(255, 255, 255, alpha);
    rect(0, y, width, 12);
  }

  pop();
}

function drawSquintOcclusion() {
  let strength = smoothedClarityValue;
  if (strength <= 0.01) return;

  push();
  noStroke();

  let topCover = lerp(0, height * 0.18, strength);
  let bottomCover = lerp(0, height * 0.20, strength);

  for (let i = 0; i < topCover; i++) {
    let alpha = map(i, 0, topCover, 0, 26 * strength);
    fill(230, 232, 236, alpha);
    rect(0, i, width, 1);
  }

  for (let i = 0; i < bottomCover; i++) {
    let alpha = map(i, 0, bottomCover, 0, 28 * strength);
    fill(230, 232, 236, alpha);
    rect(0, height - i, width, 1);
  }

  pop();
}

function drawAlgorithmGazeOverlay() {
  if (!faceDetected || !leftEyeBox || !rightEyeBox) return;

  push();

  let eyeCenterX = (leftEyeBox.cx + rightEyeBox.cx) * 0.5;
  let eyeCenterY = (leftEyeBox.cy + rightEyeBox.cy) * 0.5;

  drawEyeTrackingBox(leftEyeBox, "LEFT EYE");
  drawEyeTrackingBox(rightEyeBox, "RIGHT EYE");


  stroke(0, 255, 255, 170);
  strokeWeight(1.8);
  line(eyeCenterX - 24, eyeCenterY, eyeCenterX + 24, eyeCenterY);
  line(eyeCenterX, eyeCenterY - 24, eyeCenterX, eyeCenterY + 24);


  noFill();
  stroke(0, 255, 255, 110);
  strokeWeight(1.2);
  ellipse(eyeCenterX, eyeCenterY, 50);


  noStroke();
  fill(0, 255, 255, 180);
  ellipse(eyeCenterX, eyeCenterY, 5);


  stroke(0, 255, 255, 70);
  strokeWeight(1.2);
  let scanY = map(sin(frameCount * 0.018), -1, 1, eyeCenterY - 34, eyeCenterY + 34);
  line(eyeCenterX - 100, scanY, eyeCenterX + 100, scanY);


  stroke(0, 255, 255, 35);
  strokeWeight(1);
  line(0, eyeCenterY, width, eyeCenterY);

  
  noStroke();
  fill(0, 255, 255, 150);
  rect(eyeCenterX + 42, eyeCenterY - 48, 150, 40);

  fill(0);
  textAlign(LEFT, TOP);
  textSize(11);
  text("VISION LOCK", eyeCenterX + 50, eyeCenterY - 43);
  textSize(9);
  text("EYE PATTERN TRACKING", eyeCenterX + 50, eyeCenterY - 28);

  pop();
}

function drawEyeTrackingBox(box, label) {
  push();


  stroke(0, 255, 255, 190);
  strokeWeight(2);
  noFill();
  rect(box.x, box.y, box.w, box.h);


  let corner = 14;

  stroke(0, 255, 255, 230);
  strokeWeight(2.4);

  line(box.x, box.y, box.x + corner, box.y);
  line(box.x, box.y, box.x, box.y + corner);

  line(box.x + box.w, box.y, box.x + box.w - corner, box.y);
  line(box.x + box.w, box.y, box.x + box.w, box.y + corner);

  line(box.x, box.y + box.h, box.x + corner, box.y + box.h);
  line(box.x, box.y + box.h, box.x, box.y + box.h - corner);

  line(box.x + box.w, box.y + box.h, box.x + box.w - corner, box.y + box.h);
  line(box.x + box.w, box.y + box.h, box.x + box.w, box.y + box.h - corner);


  noStroke();
  fill(0, 255, 255, 170);
  rect(box.x, box.y - 22, 96, 16);


  
  fill(0);
  textAlign(LEFT, TOP);
  textSize(10);
  text(label, box.x + 6, box.y - 20);


  fill(0, 255, 255, 150);
  textSize(8);
  text("TARGET DETECTED", box.x, box.y + box.h + 6);

  pop();
}

function drawSquintPrompt() {
  if (!faceDetected) return;
  if (smoothedClarityValue < 0.18) return;

  push();
  textAlign(CENTER, CENTER);
  rectMode(CENTER);

  let alpha = map(smoothedClarityValue, 0.18, 1.0, 50, 190);

  // Stable status panel
  noStroke();
  fill(0, 255, 255, alpha * 0.7);
  rect(width * 0.5, height * 0.16, 250, 46);

  fill(0);
  textSize(16);
  text("SQUINT DETECTED", width * 0.5, height * 0.16 - 7);

  textSize(10);
  text("FOCUS ASSIST / CENTRAL RECOVERY", width * 0.5, height * 0.16 + 9);


  fill(0, 255, 255, alpha * 0.85);
  textSize(11);
  text("SYSTEM RESPONSE ACTIVE", width * 0.5, height * 0.16 + 40);

  pop();
}

function getEyeBoundingBox(landmarks, indices, padding = 0) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const index of indices) {
    const pt = landmarkToCanvas(landmarks[index]);
    minX = min(minX, pt.x);
    minY = min(minY, pt.y);
    maxX = max(maxX, pt.x);
    maxY = max(maxY, pt.y);
  }

  return {
    x: minX - padding,
    y: minY - padding,
    w: maxX - minX + padding * 2,
    h: maxY - minY + padding * 2,
    cx: (minX + maxX) * 0.5,
    cy: (minY + maxY) * 0.5
  };
}

function landmarkToCanvas(landmark) {
  const cover = getCameraCoverRect();

  return {
    x: cover.x + landmark.x * cover.w,
    y: cover.y + landmark.y * cover.h
  };
}

function drawVignette() {
  push();

  for (let i = 0; i < 140; i++) {
    let alpha = map(i, 0, 139, 0, 5.5);
    stroke(40, 45, 55, alpha);
    noFill();
    rect(i * 2, i * 2, width - i * 4, height - i * 4);
  }

  pop();
}

function drawStatusText() {
  push();

  fill(255, 225);
  textSize(15);
  textAlign(LEFT, TOP);
  text(`Status: ${statusText}`, 20, 20);
  text(`Eye open value: ${nf(smoothedEyeOpenValue, 1, 3)}`, 20, 42);
  text(`Clarity: ${nf(smoothedClarityValue, 1, 2)}`, 20, 64);
  text(`Blur: ${nf(currentBlur, 1, 2)}`, 20, 86);
  text(`Fog: ${nf(currentFogAlpha, 1, 1)}`, 20, 108);
  text(`Camera ready: ${cam && cam.elt && cam.elt.readyState >= 2}`, 20, 130);
  text(`Socket connected: ${socket && socket.connected}`, 20, 152);

  fill(255, 190);
  textSize(14);
  text("Squint to narrow vision and sharpen the center", 20, height - 28);

  pop();
}

function sendClearFeedToMobile() {
  if (!socket) return;
  if (!cam || !cam.elt || cam.elt.readyState < 2) return;

  const now = millis();
  if (now - lastFrameSentAt < sendIntervalMs) return;
  lastFrameSentAt = now;

  sendGraphics.clear();
  sendGraphics.image(cam, 0, 0, sendGraphics.width, sendGraphics.height);

  const imageData = sendGraphics.elt.toDataURL("image/jpeg", 0.5);

  socket.emit("cameraFrame", {
    imageData: imageData
  });

  socket.emit("visionState", {
    clarity: smoothedClarityValue
  });
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

async function createQRCodePanel() {
  if (qrPanelCreated) return;
  qrPanelCreated = true;

  try {
    const response = await fetch("/server-info");
    const info = await response.json();

    if (info && info.mobileURL) {
      mobileViewerURL = info.mobileURL;
    } else {
      mobileViewerURL = "Mobile URL unavailable";
    }
  } catch (error) {
    console.error("Failed to fetch server info:", error);
    mobileViewerURL = "Mobile URL unavailable";
  }

  const panel = document.createElement("div");
  panel.id = "qr-panel";

  const title = document.createElement("div");
  title.id = "qr-title";
  title.textContent = "Scan to enter clear view";

  const qrCodeContainer = document.createElement("div");
  qrCodeContainer.id = "qr-code";

  const linkText = document.createElement("div");
  linkText.id = "qr-link";
  linkText.textContent = mobileViewerURL;

  panel.appendChild(title);
  panel.appendChild(qrCodeContainer);
  panel.appendChild(linkText);
  document.body.appendChild(panel);

  if (mobileViewerURL.startsWith("http")) {
    new QRCode(qrCodeContainer, {
      text: mobileViewerURL,
      width: 140,
      height: 140
    });
  } else {
    qrCodeContainer.textContent = "QR unavailable";
    qrCodeContainer.style.display = "flex";
    qrCodeContainer.style.alignItems = "center";
    qrCodeContainer.style.justifyContent = "center";
    qrCodeContainer.style.color = "black";
    qrCodeContainer.style.fontSize = "14px";
  }
}