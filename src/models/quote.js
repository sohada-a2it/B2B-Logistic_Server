import mongoose from 'mongoose';

const QuoteSchema = new mongoose.Schema({
  // Shipment Details
  origin: { type: String, required: true },
  destination: { type: String, required: true },
  freightType: { type: String, required: true },
  weight: { type: String, required: true },
  dimensions: { type: String },
  
  // Contact Information
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  company: { type: String },
  address: { type: String, required: true },
  
  // Additional
  instructions: { type: String },
  
  // Metadata
  status: { 
    type: String, 
    enum: ['pending', 'contacted', 'quoted', 'completed', 'cancelled'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Prevent model recompilation
export default mongoose.models.Quote || mongoose.model('Quote', QuoteSchema);