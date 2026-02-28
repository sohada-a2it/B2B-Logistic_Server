const express = require("express");
const router = express.Router();
const userController = require("../controller/userController"); 
const { protect, adminOnly } = require("../middleware/AuthVerifyMiddleWare"); 
const bookingController = require('../controller/bookingController');
const shipmentController = require('../controller/shipmentController');
const { body } = require('express-validator');
// ==================== PUBLIC ROUTES (No Authentication Needed) ==================== 
router.post("/login", userController.loginUser);  //all roles can login through this route
router.post("/customer/register", userController.registerCustomerAndSendOTP);  // customer  
router.post("/customer/verify-otp", userController.verifyCustomerOTP); 
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

// booking
// Public tracking (no auth required)
router.get('/track/:trackingNumber', bookingController.trackByNumber); 

// Customer routes
router.post('/createBooking',protect, bookingController.createBooking); 

// Admin/Staff routes
router.get('/getAllBooking', protect, adminOnly, bookingController.getAllBookings);
router.get('/getBookingById/:id', bookingController.getBookingById);
router.put('/booking/:id/price-quote', protect, adminOnly, bookingController.updatePriceQuote);

// Customer response routes
router.put('/booking/:id/accept',protect, adminOnly, bookingController.acceptQuote);
router.put('/booking/:id/reject',protect, adminOnly, bookingController.rejectQuote);
router.put('/booking/:id/cancel', bookingController.cancelBooking); // Both customer and admin
router.get('/my-bookings', protect, bookingController.getMyBookings);

router.get('/my-bookings/summary',protect, bookingController.getMyBookingsSummary);

router.get('/my-bookings/:id', protect, bookingController.getMyBookingById);

router.get('/my-bookings/:id/timeline',protect,  bookingController.getMyBookingTimeline);

router.get('/my-bookings/:id/invoice', protect,  bookingController.getMyBookingInvoices);

router.get('/my-bookings/:id/quote', protect,  bookingController.getMyBookingQuote);  
// shipment
// ==================== PUBLIC ROUTES ==================== 
// ========== PUBLIC TRACKING (No Auth Required) ==========
router.get('/track/:trackingNumber',protect, shipmentController.trackByNumber); 

// ========== CUSTOMER ROUTES ==========
router.get('/my-shipments',protect,  shipmentController.getMyShipments); // কাস্টমারের নিজের shipment দেখা
router.get('/my-shipments/:id',protect,  shipmentController.getMyShipmentById); // কাস্টমারের নিজের shipment details
router.get('/my-shipments/:id/timeline',protect,  shipmentController.getMyShipmentTimeline); // কাস্টমারের নিজের timeline

// ========== COMMON ROUTES (Accessible by multiple roles) ==========
router.get('/stats/dashboard', protect, shipmentController.getShipmentStatistics); // Admin/Operations দেখতে পারবে
router.get('/:id',protect,  shipmentController.getShipmentById); // সবাই দেখতে পারে (permission inside controller)
router.get('/:id/timeline',protect,  shipmentController.getShipmentTimeline); // সবাই দেখতে পারে

// ========== ADMIN + OPERATIONS ROUTES ==========
router.get('/getAllShipment',protect,  adminOnly, shipmentController.getAllShipments); // সব shipments দেখা
router.post('/create',protect,  adminOnly, shipmentController.createShipment); // নতুন shipment create
router.put('/:id',protect,  adminOnly, shipmentController.updateShipment); // shipment update
router.delete('/:id',protect,  adminOnly, shipmentController.deleteShipment); // shipment delete
router.patch('/:id/status',protect,  adminOnly, shipmentController.updateShipmentStatus); // status update
router.post('/:id/tracking',protect,  adminOnly, shipmentController.addTrackingUpdate); // tracking update
router.post('/:id/assign',protect,  adminOnly, shipmentController.assignShipment); // assign to staff
router.post('/:id/transport',protect,  adminOnly, shipmentController.updateTransportDetails); // transport details
router.post('/:id/documents',protect,  adminOnly, shipmentController.addDocument); // documents add
router.post('/:id/notes/internal',protect,  adminOnly, shipmentController.addInternalNote); // internal notes
router.post('/:id/cancel',protect,  adminOnly, shipmentController.cancelShipment); // cancel shipment

// ========== COSTS ROUTES (Finance/Admin) ==========
router.post('/:id/costs',protect,  adminOnly, shipmentController.addCost); // add cost
router.get('/:id/costs',protect,  adminOnly, shipmentController.getShipmentCosts); // get costs
router.put('/:id/costs/:costId',protect,  adminOnly, shipmentController.updateCost); // update cost
router.delete('/:id/costs/:costId',protect,  adminOnly, shipmentController.deleteCost); // delete cost

// ========== WAREHOUSE ROUTES ==========
// router.get('/warehouse/pending',protect,  warehouseOnly, shipmentController.getPendingWarehouseShipments); // pending warehouse shipments
// router.patch('/:id/warehouse/receive',protect,  warehouseOnly, shipmentController.receiveAtWarehouse); // receive at warehouse
// router.patch('/:id/warehouse/process',protect,  warehouseOnly, shipmentController.processWarehouse); // warehouse processing

// ========== NOTES ROUTES ==========
router.post('/:id/notes/customer', protect, shipmentController.addCustomerNote); // customer notes (customer+admin)
module.exports = router;