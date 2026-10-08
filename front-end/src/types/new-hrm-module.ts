// src/types/new-hrm-module.ts

/**
 * Type declarations for the New HRM Module API
 */

export interface HrmCompany {
  id: string;
  company_name: string;
  company_code: string;
  group_id?: string;
  company_name_in_bengali?: string;
  company_phone?: string;
  short_name?: string;
  address?: string;
  address_in_bengali?: string;
  status?: string;
  profile_picture_path?: string;
}

export interface HrmArea {
  id: string;
  area_name: string;
  area_code: string;
  company_id: string;
  area_name_in_english?: string;
  area_name_in_bengali?: string;
  short_name?: string;
  status?: string;
}

export interface HrmDepartment {
  id: string;
  department_name: string;
  department_code?: string;
  company_id?: string;
  area_id?: string;
  name_in_english?: string;
  name_in_bengali?: string;
  code?: string;
  short_name?: string;
  status?: string;
}

export interface HrmSection {
  id: string;
  section_name: string;
  section_code?: string;
  department_id?: string;
  company_id?: string;
  section_name_in_english?: string;
  section_name_in_bengali?: string;
  short_name?: string;
  status?: string;
}

export interface HrmUnit {
  id: string;
  unit_name: string;
  unit_code?: string;
  company_id?: string;
  unit_name_in_english?: string;
  unit_name_in_bengali?: string;
  short_name?: string;
  sort_order?: number;
  status?: string;
}

export interface HrmLine {
  id: string;
  line_name: string;
  line_code?: string;
  company_id?: string;
  section_id?: string;
  unit_id?: string;
  line_name_in_english?: string;
  line_name_in_bengali?: string;
  short_name?: string;
  sort_order?: number;
  status?: string;
}

export interface HrmEmployeeDepartment {
  id: string;
  name_in_english?: string;
  name_in_bengali?: string;
  code?: string;
  short_name?: string;
  company_id?: string;
  status?: string;
}

export interface HrmEmployeeDesignation {
  id: string;
  designation_name_english?: string;
  designation_name_bengali?: string;
  code?: string;
  remarks?: string;
  status?: string;
}

export interface HrmEmployeeCompany {
  id: string;
  company_name?: string;
  company_name_in_bengali?: string;
  company_code?: string;
  short_name?: string;
}

export interface HrmEmployeeWorkingArea {
  id: string;
  area_name_in_english?: string;
  area_name_in_bengali?: string;
  area_code?: string;
  short_name?: string;
}

export interface HrmEmployeeDetails {
  id?: string;
  employee_id?: string;
  contact_person_name?: string;
  contact_person_mobile?: string;
  employee_portrait?: string;
  official_email?: string;
  personal_email?: string;
  national_id?: string;
}

export interface HrmEmployee {
  id: string;
  employee_id?: string;
  employee_id_system?: string;
  employee_id_company?: string;
  employee_code?: string;
  name: string;
  name_in_english?: string;
  name_in_bengali?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  official_email?: string;
  official_mobile_no?: string;
  personal_email?: string;
  personal_mobile_no?: string;
  company_id: string;
  company_name: string;
  area_id: string;
  area_name: string;
  working_area_id?: string;
  department_id: string;
  department_name: string;
  section_id: string;
  section_name: string;
  unit_id: string;
  unit_name: string;
  line_id: string;
  line_name: string;
  designation_id?: string;
  designation?: string;
  profile_pic?: string;
  employee_portrait?: string;
  status?: string;
  details?: HrmEmployeeDetails | null;
  department?: HrmEmployeeDepartment | null;
  designation_details?: HrmEmployeeDesignation | null;
  company?: HrmEmployeeCompany | null;
  working_area?: HrmEmployeeWorkingArea | null;
}

export interface HrmFilters {
  companyId?: string;
  areaId?: string;
  departmentId?: string;
  sectionId?: string;
  unitId?: string;
  lineId?: string;
  search?: string;
}

export interface HrmUserData {
  user_id: string;
  employee_id: string;
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  company_id: string;
  area_id: string;
  department_id: string;
  role_id: string;
  profile_pic?: string;
  redirect_url?: string;
}

export interface HrmAuthData {
  access_token: string;
  refresh_token: string;
  companies: HrmCompany[];
  areas: HrmArea[];
  user: HrmUserData;
}

export interface HrmAuthResponse {
  status: number;
  message: string;
  timestamp: string;
  data: HrmAuthData;
}

