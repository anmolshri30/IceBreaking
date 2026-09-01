export interface EventItem {
  id: string;
  title: string;
  category: string;
  date: string;
  location: string;
  fee: number;
  originalFee?: number;
  description: string;
  bannerUrl?: string;
  status: 'Upcoming' | 'Live' | 'Closed';
}

export interface Registrant {
  docId: string;
  full_name: string;
  user_email: string;
  registration_number: string;
  phone: string;
  branch: string;
  registered_at: any;
  is_present?: boolean;
}
