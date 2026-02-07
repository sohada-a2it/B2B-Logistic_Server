const express = require("express");
const router = express.Router();
const userController = require("../controller/userController");
const shipmentController = require('../controller/shipmentController');
const bookingController = require('../controller/bookingController');
const { protect, adminOnly } = require("../middleware/AuthVerifyMiddleWare"); 

// ==================== PUBLIC ROUTES (No Authentication Needed) ==================== 
router.post("/login", userController.loginUser);  //all roles can login through this route
router.post("/customer/register", userController.registerCustomerAndSendOTP);  // customer  
router.post("/customer/verify-otp", userController.verifyOTPAndCompleteRegistration); 
router.post("/customer/resend-otp", userController.resendOTP);  
router.post("/admin/setup", userController.createAdmin); //Initial Admin Setup(First Time Only) 
router.post("/forgot-password", userController.forgotPassword); // Password reset (All Roles)
router.post("/reset-password", userController.resetPassword);  // Password reset (All Roles)       

// ==================== PROTECTED ROUTES (Authentication Needed) ====================
// COMMON ROUTES (All Authenticated Users)
router.get("/getUserprofile", protect, userController.getUserProfile);
router.put("/updateUserprofile", protect, userController.updateProfile);
router.post("/change-password", protect, userController.changePassword);
router.post("/logout", protect, userController.logoutUser);

// ==================== ADMIN ONLY ROUTES ====================
// Staff Management
router.post("/admin/staff/create", protect, adminOnly, userController.createStaff);

// User Management
router.get("/admin/users", protect, adminOnly, userController.getAllUsers);
router.get("/admin/users/role/:role", protect, adminOnly, userController.getUsersByRole);
router.get("/admin/getUsers/:userId", protect, adminOnly, userController.getUserById);
router.put("/admin/updateUsers/:userId", protect, adminOnly, userController.updateUser);
router.delete("/admin/users/:userId", protect, adminOnly, userController.deleteUser);

// ==================== OPERATIONS STAFF ROUTES ==================== 
router.get("/operations/dashboard",  protect, adminOnly, (req, res) => {res.json({ message:"Operations Dashboard" });});

// ==================== WAREHOUSE MANAGER ROUTES ==================== 
router.get("/warehouse/dashboard", protect, adminOnly, (req, res) => {res.json({ message:"Warehouse Dashboard" });});

// ==================== CUSTOMER ROUTES ====================
router.get("/customer/dashboard", protect,adminOnly, (req, res) => {res.json({ message: "Customer Dashboard" });});

// ==================== CUSTOMER ROUTES ====================
router.post('/customer/create',  protect, shipmentController.createShipmentRequest);
router.get('/customer/my-shipments', protect, shipmentController.getMyShipments);
router.get('/customer/:shipmentId', protect, shipmentController.getShipmentDetails);
router.put('/customer/:shipmentId/cancel', protect, shipmentController.cancelShipmentRequest);

// ==================== STAFF ROUTES ====================
router.get('/shipments/all', protect,adminOnly, shipmentController.getAllShipments);
router.put('/shipments/:shipmentId/approve', protect, adminOnly,shipmentController.approveShipment);
router.put('/shipments/:shipmentId/status', protect,adminOnly, shipmentController.updateShipmentStatus);
router.put('/shipments/:shipmentId/tracking', protect,adminOnly, shipmentController.assignTrackingNumber);
router.put('/shipments/:shipmentId/activate', protect, adminOnly, shipmentController.activateShipment);
router.put('/shipments/:shipmentId/assign-container', protect,adminOnly, shipmentController.assignToContainer);

// ==================== ADMIN ROUTES ====================
router.get('/admin/stats', protect,adminOnly, shipmentController.getShipmentStats);
router.delete('/admin/:shipmentId', protect,adminOnly, shipmentController.deleteShipment);
router.patch('/:shipmentId/milestones/:milestoneId',protect,adminOnly, shipmentController.updateMilestone);  
router.get('/:shipmentId/timeline',protect,adminOnly,shipmentController.getShipmentTimeline);

// booking routes
// Public routes (no authentication required)
router.get('/track/:trackingNumber', protect, bookingController.searchByTrackingNumber);
router.post('/calculate-cost', protect, bookingController.calculateShippingCost);
router.post('/quotation', protect, bookingController.getBookingQuotation);
router.get('/product-options', protect, bookingController.getProductOptions);
router.post('/validate-product', protect, bookingController.validateProductAndPackage);

// Customer routes
router.post('/air-freight',protect, 
  bookingController.createAirFreightBooking
);

router.post('/sea-freight',protect, 
  bookingController.createSeaFreightBooking
);

router.post('/express-courier', protect,
  bookingController.createExpressCourierBooking
);

router.get('/customer/my-bookings',protect,
  bookingController.getCustomerBookings
);

// Authenticated routes for all users
router.get('/', 
  protect, 
  bookingController.getAllBookings
);

router.get('/:id', 
  protect, 
  bookingController.getBookingById
);

router.put('/:id', 
  protect, 
  bookingController.updateBooking
);

router.delete('/:id', 
  protect, 
  bookingController.deleteBooking
);

// Status management routes
router.put('/:id/status', protect,
  bookingController.updateBookingStatus
);

router.get('/:id/status-history', 
  protect, 
  bookingController.getBookingStatusHistory
);

// Assignment routes
router.post('/assign', protect,
  bookingController.assignBookingToStaff
);

// Warehouse specific routes
router.get('/warehouse/pending', protect,
  bookingController.getWarehousePendingBookings
);

router.post('/warehouse/consolidate', protect,
  bookingController.consolidateShipments
);

// Document generation routes
router.get('/:id/download', 
  protect, 
  bookingController.generateBookingPDF
);

// Reports and analytics
router.get('/reports/statistics', 
  protect, 
  bookingController.getBookingStatistics
);

router.get('/reports/monthly', 
  protect, 
  bookingController.getMonthlyReport
);

// Export routes
router.get('/export/data', 
  protect,  
  bookingController.exportBookings
);
module.exports = router;