export interface VisitorFormData {
  visitorName: string;
  contactNumber: string;
  emailAddress?: string;
  companyAddress: string;
  
  visitorType: string;
  purposeOfVisit: string;
  department: string;
  hostEmployeeId: string;
  hostEmployeeName?: string;
  hostPicUrl?: string;
  
  idProofType: string;
  idProofNumber?: string;
  vehicleNumber?: string;
  extraGuest?: string;
  visitorPassNo: string;
  
  dateOfVisit: string;
  timeIn: string;
  entryAuthorizedBy?: string;
  remarks?: string;
  
  visitorPhoto?: string; // Base64 image data or URL
}

export interface VisitorSelectOption {
  id: string;
  label: string;
}
