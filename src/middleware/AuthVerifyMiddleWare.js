// middleware/AuthVerifyMiddleWare.js - UPDATED
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");

exports.protect = async (req, res, next) => {
  console.log('🔐 Protect Middleware Called');
  
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      
      // ✅ Remove whitespace
      token = token.replace(/\s+/g, '');
      
      console.log('🔐 Token Info - Length:', token.length);
      
      const secret = process.env.JWT_SECRET || 'fallback_secret_for_dev_123';
      
      console.log('🔄 Verifying token...');
      const decoded = jwt.verify(token, secret);
      console.log('✅ Token verified! Decoded:', decoded);
      
      // ✅ FIX: Check for both 'userId' and 'id' in token
      const userId = decoded.userId || decoded.id || decoded._id;
      console.log('🆔 Extracted User ID from token:', userId);
      
      if (!userId) {
        console.log('❌ No user ID found in token');
        return res.status(401).json({ 
          success: false,
          message: "No user ID in token" 
        });
      }
      
      // ✅ Find user by ID
      const user = await User.findById(userId).select("-password");
      
      if (!user) {
        console.log('❌ User not found in database for ID:', userId);
        return res.status(401).json({ 
          success: false,
          message: "User not found" 
        });
      }
      
      // ✅ Set req.user with proper structure
      req.user = {
        userId: user._id.toString(),  // ✅ This is what controller uses
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        role: user.role,
        ...user.toObject()
      };
      
      console.log('✅ User authenticated:', req.user.email, 'ID:', req.user.userId);
      next();
    } catch (error) {
      console.log('❌ Token verification FAILED:', error.message);
      
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          success: false,
          message: "Token expired" 
        });
      } else if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ 
          success: false,
          message: "Invalid token" 
        });
      }
      
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
    }
  } else {
    console.log('❌ No Bearer token in headers');
    return res.status(401).json({ 
      success: false,
      message: "No token found" 
    });
  }
};

exports.adminOnly = (req, res, next) => {
  console.log('👑 Admin check for:', req.user?.email);
  
  if (req.user.role !== "admin") {
    return res.status(403).json({ 
      success: false,
      message: "Admin only access" 
    });
  }
  
  console.log('✅ Admin access granted');
  next();
};