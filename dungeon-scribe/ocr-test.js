import tesseract from "node-tesseract-ocr";

const config = { lang: "eng+chi_sim", oem: 1, psm: 3 };

async function run() {
  try {
    const text = await tesseract.recognize("./public/uploads/test.png", config);
    console.log("OCR Result:", text);
  } catch (e) {
    console.error("OCR Error:", e);
  }
}

run();
