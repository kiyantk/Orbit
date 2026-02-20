const { workerData, parentPort } = require("worker_threads");
const heicDecode = require("heic-decode");
const sharp = require("sharp");
const fs = require("fs");

(async () => {
  try {
    const inputBuffer = fs.readFileSync(workerData.filePath);
    const heicImage = await heicDecode({ buffer: inputBuffer });
    const outputBuffer = await sharp(heicImage.data, {
      raw: { width: heicImage.width, height: heicImage.height, channels: 4 },
    }).jpeg({ quality: 80 }).toBuffer();
    parentPort.postMessage({ success: true, buffer: outputBuffer });
  } catch (err) {
    parentPort.postMessage({ success: false, error: err.message });
  }
})();