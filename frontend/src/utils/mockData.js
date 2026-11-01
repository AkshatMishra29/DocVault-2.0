export const mockUser = {
  name: "Ramesh Sharma",
  email: "ramesh.sharma@example.com",
  phone: "+91 98765 43210",
  tier: "Vault Pro (Personal)",
  storageUsedMB: 342,
  storageTotalMB: 5120, // 5GB
  biometricsEnabled: true,
  offlineAccessEnabled: true,
  familyVaults: ["Sharma Family Vault"],
  auditLogsCount: 48
};

export const mockDocuments = [
  {
    id: "doc-1",
    title: "Honda City Comprehensive Insurance Policy",
    category: "Insurance",
    format: "PDF",
    size: "2.4 MB",
    uploadedAt: "2026-10-15",
    tags: ["Vehicle", "Honda City", "Policy", "HDFC ERGO"],
    isFavorite: true,
    isExpiringSoon: true,
    expiryDate: "2026-11-20",
    keyDetails: {
      "Policy Number": "POL-2025-992182",
      "Insurer": "HDFC ERGO General Insurance",
      "Insured Vehicle": "Honda City ZX (DL 3C AB 1234)",
      "IDV Value": "₹ 9,50,000",
      "Valid Till": "20 Nov 2026",
      "Premium Paid": "₹ 14,350"
    },
    summary: "Comprehensive motor policy with zero-depreciation and engine protection add-ons. Renewal required before 20 Nov 2026 to retain 50% No Claim Bonus (NCB)."
  },
  {
    id: "doc-2",
    title: "Daikin 1.5 Ton Split AC Tax Invoice & Warranty Card",
    category: "Appliances",
    format: "PDF",
    size: "1.1 MB",
    uploadedAt: "2026-06-10",
    tags: ["Appliance", "Living Room", "Daikin", "Warranty"],
    isFavorite: false,
    isExpiringSoon: false,
    expiryDate: "2031-06-10",
    keyDetails: {
      "Model": "FTKF50TV16U 1.5T 5 Star Inverter",
      "Serial Number": "DK-2024-AC-8819",
      "Purchase Date": "10 Jun 2024",
      "Comprehensive Warranty": "Expired (1 Year)",
      "Compressor Warranty": "Valid till 10 Jun 2034 (10 Years)",
      "Vendor": "Croma Electronics, Connaught Place"
    },
    summary: "Standard invoice and warranty registration. PCB warranty active till Jun 2029; compressor 10-year warranty active till 2034. Requires annual filter service."
  },
  {
    id: "doc-3",
    title: "Aadhaar Card - Ramesh Sharma",
    category: "Identity",
    format: "PDF (Encrypted)",
    size: "850 KB",
    uploadedAt: "2026-01-05",
    tags: ["KYC", "Govt ID", "Aadhaar", "High Security"],
    isFavorite: true,
    isExpiringSoon: false,
    expiryDate: null,
    keyDetails: {
      "Aadhaar Number": "XXXX-XXXX-9021",
      "DOB": "14-08-1985",
      "Linked Mobile": "XXXXXX3210",
      "Address": "B-402, Green Valley Apts, Sector 62, Noida, UP"
    },
    summary: "UIDAI issued e-Aadhaar with verified digital signature. Client-side encrypted with master security key."
  },
  {
    id: "doc-4",
    title: "Max Life Term Insurance Policy Document",
    category: "Insurance",
    format: "PDF",
    size: "4.8 MB",
    uploadedAt: "2025-12-01",
    tags: ["Life Insurance", "Family Security", "Term Plan"],
    isFavorite: true,
    isExpiringSoon: false,
    expiryDate: "2055-12-01",
    keyDetails: {
      "Policy No": "MAX-SMART-99201",
      "Sum Assured": "₹ 1,50,00,000 (1.5 Crore)",
      "Premium Due": "Every December 1st (₹ 24,000/yr)",
      "Nominee": "Sunita Sharma (Spouse - 100%)"
    },
    summary: "Pure term plan providing ₹1.5 Cr coverage up to age 70. Premium payment status is active."
  },
  {
    id: "doc-5",
    title: "Apartment Sale Deed & Registration Certificate",
    category: "Property",
    format: "PDF",
    size: "12.4 MB",
    uploadedAt: "2025-08-18",
    tags: ["Real Estate", "Noida Flat", "Legal", "Original Deed"],
    isFavorite: false,
    isExpiringSoon: false,
    expiryDate: null,
    keyDetails: {
      "Registration No": "2021/SUB/REG/8812",
      "Unit Details": "Flat B-402, Green Valley Apartments",
      "Super Area": "1,450 sq. ft.",
      "Ownership": "Joint (Ramesh Sharma & Sunita Sharma)"
    },
    summary: "Sub-registrar stamped ownership deed. Encumbrance free as per last registry check."
  }
];

export const mockAssets = [
  {
    id: "asset-1",
    name: "Honda City 1.5L ZX CVT",
    category: "Vehicle",
    purchaseDate: "2022-11-15",
    estimatedValue: "₹ 10,20,000",
    docsCount: 4,
    status: "Active Insurance",
    insuranceExpiry: "2026-11-20",
    pucExpiry: "2026-12-10",
    nextService: "2026-11-15 (40,000 km Service)",
    icon: "Car"
  },
  {
    id: "asset-2",
    name: "Daikin Inverter Split AC (1.5T)",
    category: "Home Appliances",
    purchaseDate: "2024-06-10",
    estimatedValue: "₹ 44,000",
    docsCount: 2,
    status: "Compressor Under Warranty",
    warrantyExpiry: "2034-06-10",
    nextService: "2027-04-01 (Pre-Summer Cleaning)",
    icon: "Wind"
  },
  {
    id: "asset-3",
    name: "MacBook Pro 14\" M3 Pro",
    category: "Electronics",
    purchaseDate: "2024-02-20",
    estimatedValue: "₹ 1,85,000",
    docsCount: 3,
    status: "AppleCare+ Active",
    warrantyExpiry: "2027-02-19",
    nextService: "N/A",
    icon: "Laptop"
  }
];

export const mockDeadlines = [
  {
    id: "dl-1",
    title: "Honda City Motor Insurance Renewal",
    date: "2026-11-20",
    daysLeft: 24,
    severity: "urgent",
    linkedDocId: "doc-1",
    action: "Renew via HDFC ERGO"
  },
  {
    id: "dl-2",
    title: "Car Pollution (PUC) Certificate Expiry",
    date: "2026-12-10",
    daysLeft: 44,
    severity: "upcoming",
    linkedDocId: "doc-1",
    action: "Visit Fuel Station"
  },
  {
    id: "dl-3",
    title: "Max Life Term Insurance Annual Premium",
    date: "2026-12-01",
    daysLeft: 35,
    severity: "upcoming",
    linkedDocId: "doc-4",
    action: "Pay ₹ 24,000 Premium"
  }
];

export const mockAiSuggestions = [
  "What is the claim process for my Honda City insurance?",
  "When does my Daikin AC compressor warranty expire?",
  "Show my Aadhaar card details for flight check-in",
  "How much annual insurance premium am I paying across all policies?"
];
