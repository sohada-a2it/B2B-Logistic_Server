const UserModel = require("../models/userModel");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { 
  sendRegistrationOTPEmail, 
  sendPasswordResetOTPEmail,
  sendWelcomeEmail 
} = require("../service/emailService");

// Temporary storage (use Redis in production)
const tempRegistrationStore = new Map();

// Clean up expired temp data every hour
setInterval(() => {
  const now = new Date();
  for (const [email, data] of tempRegistrationStore.entries()) {
    if (now > data.otpExpiry) {
      tempRegistrationStore.delete(email);
    }
  }
}, 3600000); // 1 hour

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ==================== CUSTOMER REGISTRATION (Only for customers) ====================

const registerCustomerAndSendOTP = async (req, res) => {
  try {
    const { 
      firstName, 
      lastName, 
      email, 
      password, 
      phone, 
      photo, 
      companyName, 
      companyAddress, 
      companyVAT,
      businessType,
      industry,
      originCountries,
      destinationMarkets
    } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, email, and password are required"
      });
    }

    // Check if email already exists and is verified
    const existingVerifiedUser = await UserModel.findOne({ 
      email: email.toLowerCase(), 
      isVerified: true 
    });
    
    if (existingVerifiedUser) {
      return res.status(400).json({
        success: false,
        message: "User already registered with this email"
      });
    }

    // Check if there's existing temp registration
    if (tempRegistrationStore.has(email)) {
      tempRegistrationStore.delete(email); // Remove old temp data
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);

    // Send OTP via Email
    const emailResult = await sendRegistrationOTPEmail(email, otp, firstName);
    
    // Store user data temporarily in Map (use Redis in production)
    const tempUserData = {
      firstName,
      lastName,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone: phone || "",
      photo: photo || "",
      companyName: companyName || "",
      companyAddress: companyAddress || "",
      companyVAT: companyVAT || "",
      businessType: businessType || 'Trader',
      industry: industry || "",
      originCountries: originCountries || ['China', 'Thailand'],
      destinationMarkets: destinationMarkets || ['USA', 'UK', 'Canada'],
      otp,
      otpExpiry,
      createdAt: new Date()
    };

    // Store in temporary storage
    tempRegistrationStore.set(email.toLowerCase(), tempUserData);
    
    const responseData = {
      email,
      expiresAt: otpExpiry
    };
    
    // Development mode-এ OTP রেসপন্সে পাঠান
    if (process.env.NODE_ENV === 'development' || emailResult.mode === 'fallback') {
      responseData.otp = otp;
      console.log(`📧 OTP for ${email}: ${otp}`);
    }
    
    res.status(200).json({
      success: true,
      message: emailResult.message || "OTP sent to your email. Please verify to complete registration.",
      data: responseData
    });

  } catch (error) {
    console.error("Customer registration error:", error);
    
    res.status(500).json({
      success: false,
      message: "Registration failed",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

// OTP Verification and Save to MongoDB
const verifyCustomerOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required"
      });
    }

    // Get temporary data from storage
    const tempData = tempRegistrationStore.get(email.toLowerCase());
    if (!tempData) {
      return res.status(400).json({
        success: false,
        message: "Registration session expired or invalid. Please register again."
      });
    }
    
    // Check OTP
    if (tempData.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    // Check OTP expiry
    if (new Date() > new Date(tempData.otpExpiry)) {
      tempRegistrationStore.delete(email.toLowerCase());
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please register again."
      });
    }

    // Check if user somehow already exists (double-check)
    const existingUser = await UserModel.findOne({ 
      email: email.toLowerCase(),
      isVerified: true 
    });
    
    if (existingUser) {
      tempRegistrationStore.delete(email.toLowerCase());
      return res.status(400).json({
        success: false,
        message: "User already registered with this email"
      });
    }

    // Create verified user in database (ONLY AFTER OTP VERIFICATION)
    const user = new UserModel({
      firstName: tempData.firstName,
      lastName: tempData.lastName,
      email: tempData.email,
      password: tempData.password,
      phone: tempData.phone,
      photo: tempData.photo,
      role: 'customer',
      isVerified: true,
      companyName: tempData.companyName,
      companyAddress: tempData.companyAddress,
      companyVAT: tempData.companyVAT,
      businessType: tempData.businessType,
      industry: tempData.industry,
      originCountries: tempData.originCountries,
      destinationMarkets: tempData.destinationMarkets,
      customerStatus: 'Active',
      customerSince: new Date(),
      status: 'active',
      isActive: true,
      notificationPreferences: {
        emailNotifications: true,
        shipmentUpdates: true,
        invoiceNotifications: true,
        marketingEmails: false
      },
      preferredCurrency: 'USD',
      language: 'en',
      timezone: 'UTC'
    });

    await user.save();

    // Clear temporary data
    tempRegistrationStore.delete(email.toLowerCase());

    // Send welcome email (optional - don't fail if it doesn't work)
    try {
      await sendWelcomeEmail(email, user.firstName);
    } catch (emailError) {
      console.error("Welcome email failed:", emailError);
      // Don't fail registration if welcome email fails
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id,
        email: user.email,
        firstName: user.firstName,
        role: user.role
      },
      process.env.JWT_SECRET || "your_secret_key",
      { expiresIn: '7d' }
    );

    // Remove sensitive data from response
    const userData = user.toObject();
    delete userData.password;

    res.status(200).json({
      success: true,
      message: "Registration completed successfully",
      token,
      data: userData
    });

  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({
      success: false,
      message: "Verification failed",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

// Resend OTP
const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    // Get temporary data
    const tempData = tempRegistrationStore.get(email.toLowerCase());
    if (!tempData) {
      return res.status(400).json({
        success: false,
        message: "Registration session expired. Please register again."
      });
    }

    // Check if last OTP was sent within 1 minute
    const lastSent = tempData.createdAt;
    const oneMinuteAgo = new Date(Date.now() - 60000);
    
    if (lastSent > oneMinuteAgo) {
      return res.status(429).json({
        success: false,
        message: "Please wait 1 minute before requesting another OTP"
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);

    // Update temp data
    tempData.otp = otp;
    tempData.otpExpiry = otpExpiry;
    tempData.createdAt = new Date();
    
    tempRegistrationStore.set(email.toLowerCase(), tempData);

    // Send OTP via Email
    const emailResult = await sendRegistrationOTPEmail(email, otp, tempData.firstName);
    
    const responseData = {
      email,
      expiresAt: otpExpiry
    };
    
    // Development mode-এ OTP রেসপন্সে পাঠান
    if (process.env.NODE_ENV === 'development' || emailResult.mode === 'fallback') {
      responseData.otp = otp;
      console.log(`📧 New OTP for ${email}: ${otp}`);
    }

    res.status(200).json({
      success: true,
      message: "New OTP sent to your email",
      data: responseData
    });

  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resend OTP",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

// ==================== STAFF CREATION (Admin Only - No OTP Needed) ====================

const createStaff = async (req, res) => {
  try {
    const { 
      firstName, 
      lastName, 
      email, 
      password, 
      phone, 
      role, 
      employeeId, 
      department,
      designation,
      warehouseLocation,
      warehouseAccess,
      assignedCustomers
    } = req.body;

    // Check if requester is admin
    const requester = await UserModel.findById(req.user.userId);
    if (!requester || requester.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin only."
      });
    }

    // Validation
    if (!firstName || !lastName || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, email, password, and role are required"
      });
    }

    // Validate role
    const validRoles = ['operations', 'warehouse'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Must be 'operations' or 'warehouse'"
      });
    }

    // Check if user already exists
    const existingUser = await UserModel.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email"
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create staff object
    const staffData = {
      firstName,
      lastName,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone: phone || "",
      photo: "",
      role,
      isVerified: true,
      status: 'active',
      isActive: true,
      employeeId: employeeId || "",
      department: department || "",
      designation: designation || "",
      employmentDate: new Date(),
      createdBy: req.user.userId,
      notificationPreferences: {
        emailNotifications: true,
        shipmentUpdates: true,
        invoiceNotifications: true,
        marketingEmails: false
      },
      preferredCurrency: 'USD',
      language: 'en',
      timezone: 'UTC'
    };

    // Add role-specific fields
    if (role === 'operations') {
      staffData.assignedCustomers = assignedCustomers || [];
      staffData.permissions = [
        'confirm_bookings',
        'update_shipment_milestones',
        'upload_shipment_docs',
        'assign_to_container',
        'generate_tracking_numbers',
        'view_customer_shipments',
        'create_shipment_quotes'
      ];
    } else if (role === 'warehouse') {
      staffData.warehouseLocation = warehouseLocation || "";
      staffData.warehouseAccess = warehouseAccess || ['China_Warehouse', 'Thailand_Warehouse'];
      staffData.permissions = [
        'receive_cargo',
        'assign_warehouse_location',
        'group_shipments',
        'update_container_loading',
        'view_warehouse_inventory',
        'manage_packages'
      ];
    }

    // Create staff user
    const staff = new UserModel(staffData);
    await staff.save();

    // Remove sensitive data from response
    const responseData = staff.toObject();
    delete responseData.password;

    res.status(201).json({
      success: true,
      message: `${role} staff created successfully`,
      data: responseData
    });

  } catch (error) {
    console.error("Create staff error:", error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Email already exists in the system"
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Failed to create staff member",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

// ==================== ADMIN CREATION (Initial Setup) ====================

const createAdmin = async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone } = req.body;

    // Check if any admin already exists
    const existingAdmin = await UserModel.findOne({ role: 'admin' });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: "Admin already exists. Use staff creation for additional admins."
      });
    }

    // Validation
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    // Check if user already exists
    const existingUser = await UserModel.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email"
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create admin user
    const admin = new UserModel({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone: phone || "",
      role: 'admin',
      isVerified: true,
      status: 'active',
      isActive: true,
      createDate: new Date(),
      updateDate: new Date()
    });

    await admin.save();

    // Remove sensitive data
    const adminData = admin.toObject();
    delete adminData.password;

    res.status(201).json({
      success: true,
      message: "Admin created successfully",
      data: adminData
    });

  } catch (error) {
    console.error("Create admin error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create admin",
      error: error.message
    });
  }
};

// ==================== LOGIN (All Roles) ====================

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    // Find verified user
    const user = await UserModel.findOne({ 
      email: email.toLowerCase(), 
      isVerified: true 
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    // Check if user is active
    if (user.status !== 'active' || !user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is deactivated. Please contact admin."
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    // Update last login
    user.lastLogin = new Date();
    user.updateDate = new Date();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id,
        email: user.email,
        firstName: user.firstName,
        role: user.role
      },
      process.env.JWT_SECRET || "your_secret_key",
      { expiresIn: '7d' }
    );

    // User data
    const userData = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      photo: user.photo,
      role: user.role,
      isVerified: user.isVerified,
      permissions: user.permissions
    };

    // Add role-specific data
    if (user.role === 'customer') {
      userData.companyName = user.companyName;
      userData.companyAddress = user.companyAddress;
      userData.companyVAT = user.companyVAT;
    } else if (user.role === 'operations' || user.role === 'warehouse') {
      userData.employeeId = user.employeeId;
      userData.department = user.department;
    }

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      data: userData
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Login failed",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

// ==================== PASSWORD RESET ====================

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    const user = await UserModel.findOne({ 
      email: email.toLowerCase(), 
      isVerified: true 
    });

    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If an account exists with this email, OTP will be sent"
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);

    // Save OTP to user (temporary)
    user.resetPasswordOTP = otp;
    user.resetPasswordOTPExpires = otpExpiry;
    user.updateDate = new Date();
    await user.save();

    // Send OTP
    await sendPasswordResetOTPEmail(email, otp, user.firstName);

    res.status(200).json({
      success: true,
      message: "OTP sent to your email",
      data: {
        email: user.email,
        expiresAt: otpExpiry
      }
    });

  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process request",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, OTP and new password are required"
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters"
      });
    }

    const user = await UserModel.findOne({ 
      email: email.toLowerCase(), 
      isVerified: true 
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check OTP
    if (!user.resetPasswordOTP || !user.resetPasswordOTPExpires) {
      return res.status(400).json({
        success: false,
        message: "No password reset request found"
      });
    }

    if (new Date() > user.resetPasswordOTPExpires) {
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new one."
      });
    }

    if (user.resetPasswordOTP !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    user.password = hashedPassword;
    user.resetPasswordOTP = undefined;
    user.resetPasswordOTPExpires = undefined;
    user.updateDate = new Date();
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password reset successful"
    });

  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reset password",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

// ==================== PROTECTED ROUTES ====================

const getUserProfile = async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.userId)
      .select('-password -registrationOTP -registrationOTPExpires -resetPasswordOTP -resetPasswordOTPExpires');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get profile",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { firstName, lastName, phone, photo, companyName, companyAddress, companyVAT } = req.body;

    const currentUser = await UserModel.findById(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const updateData = {
      updateDate: new Date()
    };
    
    if (firstName) updateData.firstName = firstName.trim();
    if (lastName) updateData.lastName = lastName.trim();
    if (phone) updateData.phone = phone.trim();
    if (photo) updateData.photo = photo;
    
    if (currentUser.role === 'customer') {
      if (companyName) updateData.companyName = companyName.trim();
      if (companyAddress) updateData.companyAddress = companyAddress.trim();
      if (companyVAT) updateData.companyVAT = companyVAT.trim();
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password -registrationOTP -registrationOTPExpires -resetPasswordOTP -resetPasswordOTPExpires');

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser
    });

  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current and new password are required"
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters"
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect"
      });
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: "New password cannot be same as current password"
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    user.updateDate = new Date();
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully"
    });

  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to change password",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

const logoutUser = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: "Logged out successfully"
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Logout failed",
      error: error.message
    });
  }
};

// ==================== ADMIN FUNCTIONS ====================

const getAllUsers = async (req, res) => {
  try {
    const requester = await UserModel.findById(req.user.userId);
    if (requester.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin only."
      });
    }

    const users = await UserModel.find({})
      .select('-password -registrationOTP -registrationOTPExpires -resetPasswordOTP -resetPasswordOTPExpires')
      .sort({ createDate: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });

  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get users",
      error: error.message
    });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const requester = await UserModel.findById(req.user.userId);
    if (requester.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin only."
      });
    }

    if (req.user.userId === userId) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete your own account"
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (user.role === 'admin') {
      return res.status(400).json({
        success: false,
        message: "Cannot delete another admin"
      });
    }

    await UserModel.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: "User deleted successfully"
    });

  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete user",
      error: error.message
    });
  }
};

const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    const requester = await UserModel.findById(req.user.userId);
    if (requester.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin only."
      });
    }

    const user = await UserModel.findById(userId)
      .select('-password -registrationOTP -registrationOTPExpires -resetPasswordOTP -resetPasswordOTPExpires');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error("Get user by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user",
      error: error.message
    });
  }
};

const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const updateData = req.body;

    const requester = await UserModel.findById(req.user.userId);
    if (requester.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin only."
      });
    }

    const restrictedFields = ['_id', 'password', 'createDate'];
    restrictedFields.forEach(field => delete updateData[field]);

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (updateData.email && updateData.email !== user.email) {
      const emailExists = await UserModel.findOne({ 
        email: updateData.email.toLowerCase(),
        _id: { $ne: userId }
      });
      
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Email already exists"
        });
      }
      updateData.email = updateData.email.toLowerCase();
    }

    updateData.updateDate = new Date();

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password -registrationOTP -registrationOTPExpires -resetPasswordOTP -resetPasswordOTPExpires');

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: updatedUser
    });

  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update user",
      error: error.message
    });
  }
};

const getUsersByRole = async (req, res) => {
  try {
    const { role } = req.params;

    const requester = await UserModel.findById(req.user.userId);
    if (requester.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin only."
      });
    }

    const validRoles = ['admin', 'operations', 'warehouse', 'customer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role"
      });
    }

    const users = await UserModel.find({ role })
      .select('-password -registrationOTP -registrationOTPExpires -resetPasswordOTP -resetPasswordOTPExpires')
      .sort({ createDate: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });

  } catch (error) {
    console.error("Get users by role error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get users by role",
      error: error.message
    });
  }
};

// ==================== EXPORTS ====================

module.exports = {
  // Customer Registration (OTP Based - No DB save until verification)
  registerCustomerAndSendOTP,
  verifyCustomerOTP,
  resendOTP,
  
  // Staff Creation (Admin Only - Direct DB save)
  createStaff,
  
  // Admin Creation (Initial Setup)
  createAdmin,
  
  // Auth
  loginUser,
  
  // Password Reset
  forgotPassword,
  resetPassword,
  
  // Protected Routes
  getUserProfile,
  updateProfile,
  changePassword,
  logoutUser,
  
  // Admin Functions
  getAllUsers,
  deleteUser,
  getUserById,
  updateUser,
  getUsersByRole
};