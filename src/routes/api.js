const express = require("express");
const router = express.Router();
const userController = require("../controller/userController"); 
const { protect, adminOnly } = require("../middleware/AuthVerifyMiddleWare"); 
const bookingController = require('../controller/bookingController');
const shipmentController = require('../controller/shipmentController');
const warehouseController = require('../controller/warehouseController');
const { body } = require('express-validator');
// ==================== PUBLIC ROUTES (No Authentication Needed) ==================== 
router.post("/login", userController.loginUser);  
router.post("/customer/register", userController.registerCustomerAndSendOTP);  
router.post("/customer/verify-otp", userController.verifyCustomerOTP); 
router.post("/customer/resend-otp", userController.resendOTP);  
router.post("/admin/setup", userController.createAdmin); 
router.post("/forgot-password", userController.forgotPassword); 
router.post("/reset-password", userController.resetPassword);        

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
router.put('/booking/:id/cancel', bookingController.cancelBooking); 
router.get('/my-bookings', protect, bookingController.getMyBookings);

router.get('/my-bookings/summary',protect, bookingController.getMyBookingsSummary);

router.get('/my-bookings/:id', protect, bookingController.getMyBookingById);

router.get('/my-bookings/:id/timeline',protect,  bookingController.getMyBookingTimeline);

router.get('/my-bookings/:id/invoice', protect,  bookingController.getMyBookingInvoices);

router.get('/my-bookings/:id/quote', protect,  bookingController.getMyBookingQuote);  
// shipment
// ==================== PUBLIC ROUTES ==================== 
// ========== PUBLIC TRACKING (No Auth Required) ==========
router.get('/getAllShipment',protect,  adminOnly, shipmentController.getAllShipments); 
router.get('/track/:trackingNumber',protect, shipmentController.trackByNumber); 

// ========== CUSTOMER ROUTES ==========
router.get('/my-shipments',protect,  shipmentController.getMyShipments); 
router.get('/my-shipments/:id',protect,  shipmentController.getMyShipmentById); 
router.get('/my-shipments/:id/timeline',protect,  shipmentController.getMyShipmentTimeline); 

// ========== COMMON ROUTES (Accessible by multiple roles) ==========
router.get('/stats/dashboard', protect, shipmentController.getShipmentStatistics); 
router.get('/my-shipment-by-id/:id',protect,  shipmentController.getShipmentById); 
router.get('/my-shipment-timeline/:id/timeline',protect,  shipmentController.getShipmentTimeline); 

// ========== ADMIN + OPERATIONS ROUTES ==========
router.post('/my-shipment/create',protect,  adminOnly, shipmentController.createShipment); 
router.put('/update-shipment/:id',protect,  adminOnly, shipmentController.updateShipment); 
router.delete('/delete-shipment/:id',protect,  adminOnly, shipmentController.deleteShipment); 
router.patch('/update-shipment-status/:id',protect,  adminOnly, shipmentController.updateShipmentStatus);  
router.post('/add-tracking-update/:id',protect,  adminOnly, shipmentController.addTrackingUpdate);  
router.post('/assign-shipment/:id',protect,  adminOnly, shipmentController.assignShipment); 
router.post('/update-transport-details/:id',protect,  adminOnly, shipmentController.updateTransportDetails); 
router.post('/add-document/:id',protect,  adminOnly, shipmentController.addDocument); 
router.post('/my-shipment/:id/notes/internal',protect,  adminOnly, shipmentController.addInternalNote); 
router.post('/my-shipment/:id/cancel',protect,  adminOnly, shipmentController.cancelShipment);  

// ========== COSTS ROUTES (Finance/Admin) ==========
router.post('/my-shipment/:id/costs',protect,  adminOnly, shipmentController.addCost); 
router.get('/my-shipment/:id/costs',protect,  adminOnly, shipmentController.getShipmentCosts); 
router.put('/my-shipment/:id/costs/:costId',protect,  adminOnly, shipmentController.updateCost); 
router.delete('/my-shipment/:id/costs/:costId',protect,  adminOnly, shipmentController.deleteCost);  

// ========== WAREHOUSE ROUTES ==========
router.get('/warehouse/pending',protect,  adminOnly, shipmentController.getPendingWarehouseShipments); 
router.patch('/:id/warehouse/receive',protect,  adminOnly, shipmentController.receiveAtWarehouse); 
router.patch('/:id/warehouse/process',protect,  adminOnly, shipmentController.processWarehouse); 

// ========== NOTES ROUTES ==========
router.post('/my-shipment/:id/notes/customer', protect, shipmentController.addCustomerNote); // customer notes (customer+admin)

// ========== WAREHOUSE MANAGEMENT ==========

// Get all warehouses (admin only)
router.get('/getAllwarehouses',protect,  adminOnly,warehouseController.getAllWarehouses);

// Create warehouse (admin only)
router.post('/warehouses',protect,  adminOnly,warehouseController.createWarehouse);

// Update warehouse (admin only)
router.put('/warehouses/:id',protect,warehouseController.updateWarehouse);

// ========== WAREHOUSE OPERATIONS ==========

// Dashboard
router.get('/dashboard',protect,  adminOnly,warehouseController.getWarehouseDashboard);

// Expected shipments (pending receipt)
router.get('/expected-shipments',protect,  adminOnly,warehouseController.getExpectedShipments);

// Receive shipment at warehouse
router.post('/receive/:shipmentId',protect,  adminOnly,warehouseController.receiveShipment);

// Inspect received shipment
router.post('/inspect/:receiptId',protect,  adminOnly,warehouseController.inspectShipment);

// ========== WAREHOUSE RECEIPTS ==========

// Get all receipts
router.get('/receipts',protect,  adminOnly,warehouseController.getWarehouseReceipts);

// Get receipt by ID
router.get(
    '/receipts/:id',
    protect,
    adminOnly,
    warehouseController.getReceiptById
);

// ========== WAREHOUSE INVENTORY ==========

// Get inventory
router.get(
    '/inventory',
    protect,
    adminOnly,
    warehouseController.getWarehouseInventory
);

// Update inventory location
router.put(
    '/inventory/:id/location',
    protect,
    adminOnly,
    warehouseController.updateInventoryLocation
);

// ========== CONSOLIDATION ==========

// Get all consolidations
router.get(
    '/consolidations',
    protect,
    adminOnly,
    warehouseController.getConsolidations
);

// Get consolidation by ID
router.get(
    '/consolidations/:id',
    protect,
    adminOnly,
    warehouseController.getConsolidationById
);

// Start consolidation
router.post(
    '/consolidations/start',
    protect,
    adminOnly,
    warehouseController.startConsolidation
);

// Complete consolidation
router.put(
    '/consolidations/:id/complete',
    protect,
    adminOnly,
    warehouseController.completeConsolidation
);

// Load and depart consolidation
router.put(
    '/consolidations/:id/depart',
    protect,
    adminOnly,
    warehouseController.loadAndDepart
);

// Add documents to consolidation
router.post(
    '/consolidations/:id/documents',
    protect,
    adminOnly,
    warehouseController.addConsolidationDocuments
);

module.exports = router;