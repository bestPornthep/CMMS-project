import { Injectable, signal } from '@angular/core';

export type Language = 'en' | 'th';

const THAI_TRANSLATIONS: Record<string, string> = {
  // Sidebar
  'Overview': 'ภาพรวม',
  'Dashboard': 'แดชบอร์ด',
  'PM Work': 'งาน PM',
  'Create PM': 'สร้าง PM',
  'Assign PM': 'มอบหมาย PM',
  'Record PM': 'บันทึก PM',
  'PM Calendar': 'ปฏิทิน PM',
  'PM Reports': 'รายงาน PM',
  'Administration': 'การจัดการ',
  'Audit Log': 'บันทึกการตรวจสอบ',
  
  // Topbar
  'Search PM work orders…': 'ค้นหาใบสั่งงาน PM…',
  'Notifications': 'การแจ้งเตือน',
  'Settings': 'การตั้งค่า',
  'Profile': 'โปรไฟล์',
  'Preferences': 'การตั้งค่าเพิ่มเติม',
  'Sign out': 'ออกจากระบบ',

  // Common Statuses
  'Pending Approval': 'รอการอนุมัติ',
  'In Progress': 'กำลังดำเนินการ',
  'Done': 'เสร็จสิ้น',
  'Pending': 'รอดำเนินการ',
  'Overdue': 'เกินกำหนด',
  
  // Departments
  'All Departments': 'ทุกแผนก',
  'Facility': 'อาคารสถานที่',
  'Mechanic': 'ช่างกล',
  'Manufacturing': 'การผลิต',
  'Maintenance': 'การบำรุงรักษา',
  'Test': 'ทดสอบ',

  // Dashboard Stats
  'Total Work Orders': 'ใบสั่งงานทั้งหมด',
  'vs last month': 'เทียบกับเดือนที่แล้ว',
  'Total Assets': 'สินทรัพย์ทั้งหมด',
  'active machines': 'เครื่องจักรที่ทำงานอยู่',
  'Overdue PMs': 'PM ที่เกินกำหนด',
  'requires attention': 'ต้องการการดูแล',
  'Compliance Rate': 'อัตราความสอดคล้อง',
  'target': 'เป้าหมาย'
};

@Injectable({ providedIn: 'root' })
export class TranslationService {
  currentLang = signal<Language>((localStorage.getItem('assetintel_lang') as Language) || 'en');

  toggleLanguage() {
    const next = this.currentLang() === 'en' ? 'th' : 'en';
    this.currentLang.set(next);
    localStorage.setItem('assetintel_lang', next);
  }

  translate(key: string): string {
    if (this.currentLang() === 'en') return key;
    return THAI_TRANSLATIONS[key] || key;
  }
}
