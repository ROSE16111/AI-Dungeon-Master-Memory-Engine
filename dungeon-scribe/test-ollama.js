// test-ollama.js
import fetch from "node-fetch";

async function run() {
  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "phi3:medium",
      prompt: "Hello from test",
    }),
  });

  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Response:", text);
}

run().catch((err) => console.error("Test Ollama error:", err));
