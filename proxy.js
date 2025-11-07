// proxy.js
const express = require("express");
const fetch = require("node-fetch");
const app = express();
const PORT = process.env.PORT || 3000;

// To parse JSON POST requests
app.use(express.json());

// Replace this with your Apps Script web app URL
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec";

// --- Proxy GET requests ---
app.get("*", async (req, res) => {
  try {
    const url = new URL(APPS_SCRIPT_URL);
    Object.keys(req.query).forEach(key => url.searchParams.append(key, req.query[key]));
    
    const response = await fetch(url.toString());
    const data = await response.json();
    
    // Send response with CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.json(data);
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// --- Proxy POST requests ---
app.post("*", async (req, res) => {
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.json(data);
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Start server
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
