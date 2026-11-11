import mongoose from 'mongoose';

const AssetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },
  category: { 
    type: String, 
    required: true,
    default: 'General',
    index: true 
  },
  cardColor: { type: String, default: 'blue' }, // blue, green, purple, amber, rose, slate
  tags: [{ type: String }],
  customFields: [{
    label: { type: String, required: true },
    value: { type: String, default: '' },
    type: { type: String, default: 'text' } // text, date, number, currency
  }],
  description: { type: String, default: '' },
  estimatedValue: { type: String, default: '' },
  purchasePrice: { type: Number, default: 0 },
  purchaseDate: { type: String }, // YYYY-MM-DD
  status: { type: String, enum: ['Active', 'In Maintenance', 'Disposed', 'Sold'], default: 'Active' },
  notes: { type: String, default: '' },

  // Category-Specific Metadata (Flexible Map / Mixed)
  // Vehicle: regNumber, make, model, fuelType, regDate, pucExpiry, chassisNumber, engineNumber
  // Appliance: brand, modelNumber, serialNumber, warrantyDurationYears
  // Electronics: brand, modelNumber, serialNumber, imei, specs
  // Property: address, propertyType, squareFeet, registrationNumber
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Warranty & Service Lifecycle
  warrantyExpiry: { type: String }, // YYYY-MM-DD
  warrantyDurationMonths: { type: Number, default: null },
  insuranceExpiry: { type: String }, // YYYY-MM-DD
  pucExpiry: { type: String }, // YYYY-MM-DD (specifically for Vehicles)
  nextService: { type: String }, // YYYY-MM-DD
  icon: { type: String, default: 'Box' },

  // Document Relationships
  linkedDocumentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

AssetSchema.index({ userId: 1, category: 1 });

export const Asset = mongoose.model('Asset', AssetSchema);

