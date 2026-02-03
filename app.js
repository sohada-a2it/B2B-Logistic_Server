// app.js - SIMPLE VERSION WITHOUT MONGODB OPTIONS
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const route = require('./src/routes/api');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Logging middleware
app.use((req, res, next) => {
  console.log(`\n📨 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('Auth header:', req.headers.authorization ? 'Present ✓' : 'Missing ✗');
  console.log('Body keys:', Object.keys(req.body).length > 0 ? Object.keys(req.body) : 'Empty');
  next();
});

// ===================== Mongoose Connect =====================
let mongoose;
try {
  mongoose = require('mongoose');
  console.log('Mongoose version:', mongoose.version);

  const url = `mongodb+srv://a2itsohada_db_user:a2it-hrm@cluster0.18g6dhm.mongodb.net/B2B_Logistic?retryWrites=true&w=majority`;

  mongoose.connect(url)
    .then(async () => {
      console.log("✅ B2B_Logistic DB Connected");

    })
    .catch(err => {
      console.log("⚠️ MongoDB Connection Warning:", err.message);
      console.log("⚠️ API will work but database operations will fail");
    });

} catch (error) {
  console.log("⚠️ Mongoose not available, running in test mode");
}

// Routes
app.use("/api/v1", route); 

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ message: "Route not found" });
});
// server.js or app.js এ
const cron = require('node-cron');
module.exports = app;
