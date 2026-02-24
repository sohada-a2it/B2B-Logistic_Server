const UserModel = require("../models/userModel");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { 
  sendRegistrationOTPEmail, 
  sendPasswordResetOTPEmail,
  sendWelcomeEmail 
} = require("../service/emailService");

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

    // Check if already registered and verified (any role)
    const existingVerifiedUser = await UserModel.findOne({ 
      email, 
      isVerified: true 
    });
    
    if (existingVerifiedUser) {
      return res.status(400).json({
        success: false,
        message: "User already registered with this email"
      });
    }

    // Check if unverified user exists
    const existingUnverifiedUser = await UserModel.findOne({ 
      email, 
      isVerified: false 
    });

    if (existingUnverifiedUser) {
      // Delete old unverified user
      await UserModel.deleteOne({ _id: existingUnverifiedUser._id });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);

    // Send OTP via Email first
    const emailResult = await sendRegistrationOTPEmail(email, otp, firstName);
    
    // Store user data temporarily in cache/Redis
    const tempUserData = {
      firstName,
      lastName,
      email,
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

    // Store in temporary storage (Redis recommended)
    // await redisClient.setex(`temp_registration:${email}`, 600, JSON.stringify(tempUserData));
    
    // For development without Redis, you can use a Map
    // tempStorage.set(email, tempUserData);
    
    const responseData = {
      email,
      expiresAt: otpExpiry
    };
    
    // যদি development বা fallback mode হয়, OTP রেসপন্সে পাঠান
    if (emailResult.mode === 'development' || emailResult.mode === 'fallback') {
      responseData.otp = otp;
      console.log(`📧 OTP included in response: ${otp}`);
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

// OTP Verification function
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
    // const tempData = await redisClient.get(`temp_registration:${email}`);
    // if (!tempData) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Registration session expired or invalid"
    //   });
    // }
    
    // const userData = JSON.parse(tempData);
    
    // Check OTP
    if (userData.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    // Check OTP expiry
    if (new Date() > new Date(userData.otpExpiry)) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired"
      });
    }

    // Create verified user in database
    const user = new UserModel({
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      password: userData.password,
      phone: userData.phone,
      photo: userData.photo,
      role: 'customer',
      isVerified: true,
      companyName: userData.companyName,
      companyAddress: userData.companyAddress,
      companyVAT: userData.companyVAT,
      businessType: userData.businessType,
      industry: userData.industry,
      originCountries: userData.originCountries,
      destinationMarkets: userData.destinationMarkets,
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
    // await redisClient.del(`temp_registration:${email}`);

    res.status(200).json({
      success: true,
      message: "Registration completed successfully",
      data: {
        email: user.email,
        role: user.role,
        companyName: user.companyName
      }
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
      // Role-specific fields
      warehouseLocation,
      warehouseAccess,
      assignedCustomers
    } = req.body;

    // Check if requester is admin (from auth middleware)
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
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email"
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create base staff object
    const staffData = {
      // Personal Information
      firstName,
      lastName,
      email,
      password: hashedPassword,
      phone: phone || "",
      photo: "",
      
      // Role and System
      role,
      isVerified: true,
      status: 'active',
      isActive: true,
      
      // Staff Information
      employeeId: employeeId || "",
      department: department || "",
      designation: designation || "",
      employmentDate: new Date(),
      
      // Created by
      createdBy: req.user.userId,
      
      // Authentication (no OTP needed for staff)
      resetPasswordOTP: undefined,
      resetPasswordOTPExpires: undefined,
      
      // Preferences
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
    } 
    
    else if (role === 'warehouse') {
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
    delete responseData.registrationOTP;
    delete responseData.registrationOTPExpires;
    delete responseData.resetPasswordOTP;
    delete responseData.resetPasswordOTPExpires;

    res.status(201).json({
      success: true,
      message: `${role.charAt(0).toUpperCase() + role.slice(1)} staff created successfully`,
      data: responseData
    });

  } catch (error) {
    console.error("Create staff error:", error);
    
    // Handle duplicate email error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Email already exists in the system",
        error: "Duplicate email address"
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: messages
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
    const existingUser = await UserModel.findOne({ email });
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
      email,
      password: hashedPassword,
      phone: phone || "",
      role: 'admin',
      isVerified: true,
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

// ==================== OTP VERIFICATION (Customer Only) ====================

const verifyOTPAndCompleteRegistration = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required"
      });
    }

    // Find unverified customer
    const user = await UserModel.findOne({ 
      email: email.toLowerCase(), 
      isVerified: false,
      role: 'customer' // Only customers need OTP verification
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Registration session not found. Please register again."
      });
    }

    // Check OTP attempts
    if (user.otpAttempts >= 5) {
      return res.status(400).json({
        success: false,
        message: "Too many failed attempts. Please register again."
      });
    }

    // Check OTP expiry
    const now = new Date();
    if (now > user.registrationOTPExpires) {
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please register again."
      });
    }

    // Verify OTP
    if (user.registrationOTP !== otp) {
      user.otpAttempts += 1;
      user.updateDate = new Date();
      await user.save();

      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
        attemptsLeft: 5 - user.otpAttempts
      });
    }

    // Mark as verified
    user.isVerified = true;
    user.registrationOTP = undefined;
    user.registrationOTPExpires = undefined;
    user.otpAttempts = 0;
    user.updateDate = new Date();
    await user.save();

    // Send welcome email
    try {
      await sendWelcomeEmail(email, user.firstName);
      console.log(`✅ Welcome email sent to ${email}`);
    } catch (emailError) {
      console.error("❌ Welcome email failed:", emailError);
      // Don't fail registration if welcome email fails
    }

    // Generate JWT token with role
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
      companyName: user.companyName,
      companyAddress: user.companyAddress,
      companyVAT: user.companyVAT,
      isVerified: user.isVerified,
      createDate: user.createDate
    };

    res.status(200).json({
      success: true,
      message: "Registration completed successfully!",
      token,
      data: userData
    });

  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({
      success: false,
      message: "OTP verification failed",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    // Find unverified customer
    const user = await UserModel.findOne({ 
      email: email.toLowerCase(), 
      isVerified: false,
      role: 'customer'
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Registration not found or already completed"
      });
    }

    // Check if last OTP was sent within 1 minute
    const lastSent = user.updateDate || user.createDate;
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

    // Update user
    user.registrationOTP = otp;
    user.registrationOTPExpires = otpExpiry;
    user.otpAttempts = 0;
    user.updateDate = new Date();
    await user.save();

    // Send OTP via Email
    try {
      await sendRegistrationOTPEmail(email, otp, user.firstName);
      console.log(`✅ New OTP sent to ${email}: ${otp}`);
    } catch (emailError) {
      console.error("❌ Resend OTP email failed:", emailError);
      
      // Development mode-এ কনসোলে OTP দেখাবে
      console.log(`📧 DEV MODE - New OTP for ${email}: ${otp}`);
      
      if (process.env.NODE_ENV === 'production') {
        throw new Error("Failed to resend OTP email");
      }
    }

    res.status(200).json({
      success: true,
      message: "New OTP sent to your email",
      data: {
        expiresAt: otpExpiry,
        // Development mode-এ OTP রেসপন্সে পাঠান
        ...(process.env.NODE_ENV === 'development' && { otp: otp })
      }
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

    // Find verified user (any role)
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

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    // Update last login time
    user.updateDate = new Date();
    await user.save();

    // Generate JWT token with role
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

    // User data based on role
    const userData = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      photo: user.photo,
      role: user.role,
      isVerified: user.isVerified,
      createDate: user.createDate,
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
      userData.createdBy = user.createdBy;
    } else if (user.role === 'admin') {
      userData.isAdmin = true;
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

// ==================== PASSWORD RESET (All Roles) ====================

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    // Find verified user (any role)
    const user = await UserModel.findOne({ 
      email: email.toLowerCase(), 
      isVerified: true 
    });

    if (!user) {
      // Don't reveal if user exists (security)
      return res.status(200).json({
        success: true,
        message: "If an account exists with this email, OTP will be sent"
      });
    }

    // Check if last reset request was within 2 minutes
    const lastResetAttempt = user.resetPasswordOTPExpires || user.updateDate;
    const twoMinutesAgo = new Date(Date.now() - 120000);
    
    if (lastResetAttempt && lastResetAttempt > twoMinutesAgo) {
      return res.status(429).json({
        success: false,
        message: "Please wait 2 minutes before requesting another password reset"
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);

    // Save OTP
    user.resetPasswordOTP = otp;
    user.resetPasswordOTPExpires = otpExpiry;
    user.updateDate = new Date();
    await user.save();

    // Send OTP via Email
    try {
      await sendPasswordResetOTPEmail(email, otp, user.firstName);
      console.log(`✅ Password reset OTP sent to ${email}: ${otp}`);
    } catch (emailError) {
      console.error("❌ Password reset email failed:", emailError);
      
      // Development mode-এ কনসোলে OTP দেখাবে
      console.log(`🔐 DEV MODE - Password reset OTP for ${email}: ${otp}`);
      
      if (process.env.NODE_ENV === 'production') {
        throw new Error("Failed to send password reset OTP");
      }
    }

    res.status(200).json({
      success: true,
      message: "OTP sent to your email",
      data: {
        email: user.email,
        role: user.role,
        expiresAt: otpExpiry,
        // Development mode-এ OTP রেসপন্সে পাঠান
        ...(process.env.NODE_ENV === 'development' && { otp: otp })
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

    // Find verified user (any role)
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

    // Check OTP expiry
    const now = new Date();
    if (now > user.resetPasswordOTPExpires) {
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new one."
      });
    }

    // Verify OTP
    if (user.resetPasswordOTP !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password and clear OTP
    user.password = hashedPassword;
    user.resetPasswordOTP = undefined;
    user.resetPasswordOTPExpires = undefined;
    user.updateDate = new Date();
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password reset successful. You can now login with your new password.",
      data: {
        email: user.email,
        role: user.role
      }
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
    const userId = req.user.userId; // From auth middleware

    const user = await UserModel.findById(userId).select('-password -registrationOTP -registrationOTPExpires -resetPasswordOTP -resetPasswordOTPExpires');
    
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

    // Get current user to check role
    const currentUser = await UserModel.findById(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Prepare update data
    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName.trim();
    if (lastName !== undefined) updateData.lastName = lastName.trim();
    if (phone !== undefined) updateData.phone = phone.trim();
    if (photo !== undefined) updateData.photo = photo;
    
    // Only customers can update company info
    if (currentUser.role === 'customer') {
      if (companyName !== undefined) updateData.companyName = companyName.trim();
      if (companyAddress !== undefined) updateData.companyAddress = companyAddress.trim();
      if (companyVAT !== undefined) updateData.companyVAT = companyVAT.trim();
    }
    
    updateData.updateDate = new Date();

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

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect"
      });
    }

    // Check if new password is same as old password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: "New password cannot be same as current password"
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
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
    // In JWT, logout is handled client-side by removing token
    // If using token blacklist, add token to blacklist here
    
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
    // Check if user is admin
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
    
    // Check if requester is admin
    const requester = await UserModel.findById(req.user.userId);
    if (requester.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin only."
      });
    }

    // Check if user exists
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Prevent self-deletion
    if (req.user.userId === userId) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete your own account"
      });
    }

    // Prevent deleting other admins
    if (user.role === 'admin' && req.user.userId !== userId) {
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

    // Check if requester is admin
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

    // Check if requester is admin
    const requester = await UserModel.findById(req.user.userId);
    if (requester.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin only."
      });
    }

    // Prevent updating certain fields
    const restrictedFields = ['_id', 'password', 'email', 'createDate'];
    restrictedFields.forEach(field => {
      delete updateData[field];
    });

    // Check if user exists
    const existingUser = await UserModel.findById(userId);
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // If updating email, check if email already exists
    if (updateData.email && updateData.email !== existingUser.email) {
      const emailExists = await UserModel.findOne({ 
        email: updateData.email,
        _id: { $ne: userId }
      });
      
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Email already exists"
        });
      }
    }

    // Update user
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

    // Check if requester is admin
    const requester = await UserModel.findById(req.user.userId);
    if (requester.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin only."
      });
    }

    // Validate role
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
  // Customer Registration (OTP Based)
  registerCustomerAndSendOTP,
  verifyOTPAndCompleteRegistration,
  resendOTP,
  
  // Staff Creation (Admin Only - No OTP)
  createStaff,
  
  // Admin Creation (Initial Setup)
  createAdmin,
  
  // Auth
  loginUser,
  
  // Password Reset (All Roles)
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