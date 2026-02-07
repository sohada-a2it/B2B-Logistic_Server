const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // ==================== COMMON FIELDS (ALL ROLES) ====================
    firstName: {
        type: String,
        required: [true, "First name is required"],
        trim: true
    },
    lastName: {
        type: String,
        required: [true, "Last name is required"],
        trim: true
    },
    email: {
        type: String,
        required: [true, "Email is required"],
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: [true, "Password is required"],
        minlength: 6
    },
    phone: {
        type: String,
        default: "",
        trim: true
    },
    photo: {
        type: String,
        default: ""
    },
    
    // ==================== ROLE & PERMISSIONS ====================
    role: {
        type: String,
        enum: ['admin', 'operations', 'warehouse', 'customer'],
        default: 'customer'
    },
    
    // Role-specific permissions
    permissions: {
        type: [String],
        default: function() {
            const rolePermissions = {
                'admin': [
                    'manage_all_customers', 
                    'manage_all_shipments', 
                    'manage_staff', 
                    'create_invoices',
                    'track_global_shipments',
                    'view_all_reports',
                    'manage_warehouse',
                    'manage_containers',
                    'manage_documents',
                    'manage_billing'
                ],
                'operations': [
                    'confirm_bookings',
                    'update_shipment_milestones',
                    'upload_shipment_docs',
                    'assign_to_container',
                    'generate_tracking_numbers',
                    'view_customer_shipments',
                    'create_shipment_quotes'
                ],
                'warehouse': [
                    'receive_cargo',
                    'assign_warehouse_location',
                    'group_shipments',
                    'update_container_loading',
                    'view_warehouse_inventory',
                    'manage_packages'
                ],
                'customer': [
                    'book_shipments',
                    'upload_packing_list',
                    'track_own_shipments',
                    'download_own_invoices',
                    'upload_documents',
                    'view_own_bookings'
                ]
            };
            return rolePermissions[this.role] || [];
        }
    },
    
    // ==================== CUSTOMER-SPECIFIC FIELDS ====================
    companyName: {
        type: String,
        default: "",
        trim: true
    },
    companyAddress: {
        type: String,
        default: "",
        trim: true
    },
    companyVAT: {
        type: String,
        default: "",
        trim: true
    },
    // Business Information (Customer only)
    businessType: {
        type: String,
        enum: ['Manufacturer', 'Trader', 'Wholesaler', 'Retailer', 'Importer', 'Exporter', 'Other'],
        default: 'Trader'
    },
    industry: {
        type: String,
        default: ""
    },
    // Shipping Information (Customer only)
    originCountries: [{
        type: String,
        enum: ['China', 'Thailand', 'Vietnam', 'India', 'Other']
    }],
    destinationMarkets: [{
        type: String,
        enum: ['USA', 'UK', 'Canada', 'Australia', 'Germany', 'France', 'Japan', 'Other']
    }],
    // Customer Status
    customerStatus: {
        type: String,
        enum: ['Active', 'Inactive', 'Suspended', 'Pending'],
        default: 'Active'
    },
    customerSince: {
        type: Date,
        default: Date.now
    },
    // Account Manager (Admin/Staff assigned)
    accountManager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // ==================== STAFF-SPECIFIC FIELDS (Operations/Warehouse) ====================
    employeeId: {
        type: String,
        default: "",
        trim: true
    },
    department: {
        type: String,
        default: "",
        trim: true
    },
    designation: {
        type: String,
        default: "",
        trim: true
    },
    employmentDate: {
        type: Date,
        default: Date.now
    },
    // Operations Staff specific
    assignedCustomers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    // Warehouse Manager specific
    warehouseLocation: {
        type: String,
        default: ""
    },
    warehouseAccess: [{
        type: String,
        enum: ['China_Warehouse', 'Thailand_Warehouse', 'USA_Warehouse', 'UK_Warehouse', 'Canada_Warehouse']
    }],
    
    // ==================== ADMIN-SPECIFIC FIELDS ====================
    adminLevel: {
        type: String,
        enum: ['super_admin', 'admin', 'manager'],
        default: 'admin'
    },
    accessLevel: {
        type: String,
        enum: ['full', 'limited', 'financial_only'],
        default: 'full'
    },
    canCreateStaff: {
        type: Boolean,
        default: true
    },
    canApprovePayments: {
        type: Boolean,
        default: true
    },
    
    // ==================== AUTHENTICATION FIELDS ====================
    isVerified: {
        type: Boolean,
        default: false
    },
    registrationOTP: {
        type: String
    },
    registrationOTPExpires: {
        type: Date
    },
    resetPasswordOTP: {
        type: String
    },
    resetPasswordOTPExpires: {
        type: Date,
    },
    otpAttempts: {
        type: Number,
        default: 0
    },
    lastLogin: {
        type: Date,
        default: Date.now
    },
    loginHistory: [{
        timestamp: Date,
        ipAddress: String,
        device: String
    }],
    
    // ==================== SYSTEM FIELDS ====================
    isActive: {
        type: Boolean,
        default: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended', 'pending'],
        default: 'active'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    
    // ==================== NOTIFICATIONS & PREFERENCES ====================
    notificationPreferences: {
        emailNotifications: {
            type: Boolean,
            default: true
        },
        shipmentUpdates: {
            type: Boolean,
            default: true
        },
        invoiceNotifications: {
            type: Boolean,
            default: true
        },
        marketingEmails: {
            type: Boolean,
            default: false
        }
    },
    
    // ==================== ADDITIONAL INFO ====================
    timezone: {
        type: String,
        default: 'UTC'
    },
    preferredCurrency: {
        type: String,
        enum: ['USD', 'GBP', 'CAD', 'EUR', 'THB', 'CNY'],
        default: 'USD'
    },
    language: {
        type: String,
        enum: ['en', 'th', 'zh', 'fr', 'es'],
        default: 'en'
    },
    
    // Notes (for admin use)
    adminNotes: {
        type: String,
        default: ""
    }
}, {
    versionKey: false,
    timestamps: true
});

// ==================== MIDDLEWARE ====================
userSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// ==================== METHODS ====================
// Check permission
userSchema.methods.hasPermission = function(permission) {
    return this.permissions.includes(permission);
};

// Check role
userSchema.methods.isRole = function(role) {
    return this.role === role;
};

// Check if user is admin
userSchema.methods.isAdmin = function() {
    return this.role === 'admin';
};

// Check if user is staff
userSchema.methods.isStaff = function() {
    return ['admin', 'operations', 'warehouse'].includes(this.role);
};

// Check if user is customer
userSchema.methods.isCustomer = function() {
    return this.role === 'customer';
};

// Get full name
userSchema.methods.getFullName = function() {
    return `${this.firstName} ${this.lastName}`;
};

// ==================== STATICS ====================
// Find by role
userSchema.statics.findByRole = function(role) {
    return this.find({ role: role });
};

// Find active users
userSchema.statics.findActive = function() {
    return this.find({ isActive: true, status: 'active' });
};

// Find customers by account manager
userSchema.statics.findCustomersByAccountManager = function(accountManagerId) {
    return this.find({ 
        role: 'customer', 
        accountManager: accountManagerId,
        isActive: true 
    });
};

// ==================== INDEXES ====================
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ 'customerStatus': 1 });
userSchema.index({ employeeId: 1 }, { sparse: true });
userSchema.index({ companyName: 1 }, { sparse: true });
userSchema.index({ createdBy: 1 });

// Create model
const UserModel = mongoose.model('User', userSchema);

// Export model
module.exports = UserModel;