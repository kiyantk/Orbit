import { pipeline, env, AutoTokenizer, CLIPTextModelWithProjection } from "@xenova/transformers";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

env.cacheDir = path.join(__dirname, "../models");
env.allowRemoteModels = true;

const MODEL = "Xenova/clip-vit-base-patch32";

console.log("Downloading image pipeline...");
await pipeline("image-feature-extraction", MODEL, { quantized: true });

console.log("Downloading tokenizer...");
await AutoTokenizer.from_pretrained(MODEL);

console.log("Downloading text model...");
await CLIPTextModelWithProjection.from_pretrained(MODEL, { quantized: true });

console.log("Done — model saved to ./models/");