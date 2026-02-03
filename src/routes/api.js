const express = require("express");
const router = express.Router();
const userController = require("../controller/userController");
const { protect, adminOnly } = require("../middleware/AuthVerifyMiddleWare"); 

// ==================== PUBLIC ROUTES (No Authentication Needed) ====================

// Customer Registration flow (OTP Based)
router.post("/customer/register", userController.registerCustomerAndSendOTP);           // Step 1: Register & get OTP
router.post("/customer/verify-otp", userController.verifyOTPAndCompleteRegistration); // Step 2: Verify OTP
router.post("/customer/resend-otp", userController.resendOTP);                 // Resend OTP

// Initial Admin Setup (First Time Only)
router.post("/admin/setup", userController.createAdmin); // Only for initial setup

// Login (All Roles)
router.post("/login", userController.loginUser);

// Password reset (All Roles - No auth needed)
router.post("/forgot-password", userController.forgotPassword);       // Request OTP
router.post("/reset-password", userController.resetPassword);         // Verify OTP & reset password

// ==================== PROTECTED ROUTES (Authentication Needed) ====================

// COMMON ROUTES (All Authenticated Users)
router.get("/profile", protect, userController.getUserProfile);
router.put("/profile", protect, userController.updateProfile);
router.post("/change-password", protect, userController.changePassword);
router.post("/logout", protect, userController.logoutUser);

// ==================== ADMIN ONLY ROUTES ====================

// Staff Management
router.post("/admin/staff/create", 
  protect, 
  adminOnly, 
  userController.createStaff);

// User Management
router.get("/admin/users", 
  protect, 
  adminOnly, 
  userController.getAllUsers);

router.get("/admin/users/role/:role", 
  protect, 
  adminOnly, 
  userController.getUsersByRole);

router.get("/admin/users/:userId", 
  protect, 
  adminOnly, 
  userController.getUserById);

router.put("/admin/users/:userId", 
  protect, 
  adminOnly, 
  userController.updateUser);

router.delete("/admin/users/:userId", 
  protect, 
  adminOnly, 
  userController.deleteUser);

// ==================== OPERATIONS STAFF ROUTES ====================
// (Add specific operations routes here when needed)
router.get("/operations/dashboard", 
  protect, 
  adminOnly, 
  (req, res) => {
    res.json({ message: "Operations Dashboard" });
  });

// ==================== WAREHOUSE MANAGER ROUTES ====================
// (Add specific warehouse routes here when needed)
router.get("/warehouse/dashboard", 
  protect, 
  adminOnly, 
  (req, res) => {
    res.json({ message: "Warehouse Dashboard" });
  });

// ==================== CUSTOMER ROUTES ====================
router.get("/customer/dashboard", 
  protect,adminOnly, 
  (req, res) => {
    res.json({ message: "Customer Dashboard" });
  });
module.exports = router;