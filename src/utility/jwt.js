// utility/jwt.js
const jwt = require("jsonwebtoken");

const generateToken = (user) => {
  try {
    console.log('🔐 Generating token for:', user.email);
    
    const secret = process.env.JWT_SECRET || 'fallback_secret_for_dev_123';
    
    const token = jwt.sign(
      { 
        id: user._id.toString(),  // ✅ string ensure করো
        role: user.role,
        email: user.email 
      },
      secret,
      { 
        expiresIn: process.env.JWT_EXPIRE || "7d" 
      }
    );
    
    // ✅ Token clean করো
    const cleanToken = token.replace(/\n/g, '').replace(/\r/g, '').trim();
    
    console.log('✅ Token generated, length:', cleanToken.length);
    
    return cleanToken;
  } catch (error) {
    console.error('❌ JWT generation error:', error);
    throw error;
  }
};

module.exports = generateToken;