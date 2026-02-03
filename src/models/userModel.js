const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
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
    // Role-based access control
    role: {
        type: String,
        enum: ['admin', 'operations', 'warehouse', 'customer'],
        default: 'customer'
    },
    // Company info for B2B customers
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
    // Permissions based on role (could also be managed separately)
    permissions: {
        type: [String],
        default: function() {
            const rolePermissions = {
                'admin': [
                    'manage_customers', 
                    'manage_shipments', 
                    'assign_staff', 
                    'create_invoices',
                    'track_global_status',
                    'view_reports',
                    'manage_all_users'
                ],
                'operations': [
                    'confirm_bookings',
                    'update_milestones',
                    'upload_documents',
                    'assign_warehouse_container'
                ],
                'warehouse': [
                    'warehouse_receiving',
                    'package_grouping',
                    'container_loading_status'
                ],
                'customer': [
                    'book_shipments',
                    'upload_packing_list',
                    'track_shipments',
                    'download_invoices_documents'
                ]
            };
            return rolePermissions[this.role] || [];
        }
    },
    // Staff-specific fields (for admin-created staff accounts)
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
    isActive: {
        type: Boolean,
        default: true
    },
    // Customer registration fields
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
    createDate: {
        type: Date,
        default: Date.now
    },
    updateDate: {
        type: Date,
        default: Date.now
    },
    // Track who created the user (for staff accounts)
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    versionKey: false,
    timestamps: false
});

// Middleware to update timestamp
userSchema.pre('save', function(next) {
    this.updateDate = Date.now();
    next();
});

// Method to check if user has specific permission
userSchema.methods.hasPermission = function(permission) {
    return this.permissions.includes(permission);
};

// Method to check user role
userSchema.methods.isRole = function(role) {
    return this.role === role;
};

// Create model
const UserModel = mongoose.model('User', userSchema);

// Export model
module.exports = UserModel;