export type RelaySettingsResponse = {
  id?: string | null;
  urlType?: string | null;
  relayOnUrl?: string | null;
  relaySilentUrl?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type RelayApiRow = {
  id: string;
  urlType: string | null;
  relayOnUrl: string | null;
  relaySilentUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ErpSettingsResponse = {
  id?: string | null;
  urlType?: string | null;
  erpBaseUrl?: string | null;
  erpPrefix?: string | null;
  erpAttendanceEndpoint?: string | null;
  isActive?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ErpApiRow = {
  id: string;
  urlType: string | null;
  erpBaseUrl: string | null;
  erpPrefix: string | null;
  erpAttendanceEndpoint: string | null;
  isActive: boolean | null;
  createdAt: string;
  updatedAt: string;
};
