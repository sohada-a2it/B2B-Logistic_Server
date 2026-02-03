
// middleware/AuthVerifyMiddleWare.js - UPDATED
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");

exports.protect = async (req, res, next) => {
  console.log('🔐 Protect Middleware Called');
  console.log('🔍 Full Authorization Header:', req.headers.authorization);
  
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      
      // ✅ CRITICAL FIX: Remove all whitespace (newlines, spaces, tabs)
      token = token.replace(/\s+/g, '');
      
      console.log('🔐 Token after cleaning:');
      console.log('Length:', token.length);
      console.log('First 50 chars:', token.substring(0, 50));
      console.log('Contains dot?', token.includes('.'));
      console.log('Number of dots:', token.split('.').length);
      
      // Check if it's a valid JWT format (should have 2 dots)
      if (token.split('.').length !== 3) {
        console.log('❌ Invalid JWT format - wrong number of parts');
        return res.status(401).json({ message: "Invalid token format" });
      }
      
      console.log('🔐 JWT_SECRET exists?', !!process.env.JWT_SECRET);
      const secret = process.env.JWT_SECRET || 'fallback_secret_for_dev_123';
      
      console.log('🔄 Verifying token...');
      const decoded = jwt.verify(token, secret);
      console.log('✅ Token verified successfully!');
      console.log('Decoded user ID:', decoded.id);
      console.log('Decoded email:', decoded.email);
      
      req.user = await User.findById(decoded.id).select("-password");
      
      if (!req.user) {
        console.log('❌ User not found in database');
        return res.status(401).json({ message: "User not found" });
      }
      
      console.log('✅ User authenticated:', req.user.email);
      next();
    } catch (error) {
      console.log('❌ Token verification FAILED!');
      console.log('Error name:', error.name);
      console.log('Error message:', error.message);
      console.log('Token that failed:', token ? token.substring(0, 100) : 'No token');
      
      // Send specific error messages
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ message: "Token expired" });
      } else if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: "Invalid token" });
      } else if (error.name === 'SyntaxError') {
        return res.status(401).json({ message: "Malformed token" });
      }
      
      return res.status(401).json({ message: "Unauthorized" });
    }
  } else {
    console.log('❌ No Bearer token in headers');
    console.log('Available headers:', Object.keys(req.headers));
    return res.status(401).json({ message: "No token found" });
  }
};

exports.adminOnly = (req, res, next) => {
  console.log('👑 Admin check for:', req.user?.email);
  
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin only access" });
  }
  
  console.log('✅ Admin access granted');
  next();
};
 