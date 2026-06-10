import { Injectable, signal } from '@angular/core';

export type Language = 'en' | 'th';

const THAI_TRANSLATIONS: Record<string, string> = {
  // Sidebar
  'Audit Log': 'บันทึกการตรวจสอบ',
  'Record PM': 'บันทึก PM',
  'Scheduled': 'ตามกำหนดการ',
  'No overdue tasks.': 'ไม่มีงานที่เกินกำหนด',
  "Today's Schedule": 'กำหนดการวันนี้',
  'Nothing scheduled for today.': 'ไม่มีกำหนดการสำหรับวันนี้',
  'Month Summary': 'สรุปประจำเดือน',
  'To Approve': 'รออนุมัติ',
  'View permission grants, delegations, and departmental template activity': 'ดูการให้สิทธิ์ การมอบหมาย และกิจกรรมแม่แบบของแผนก',
  'Search logs...': 'ค้นหาบันทึก...',
  'System Activity Log': 'บันทึกกิจกรรมระบบ',
  'Timestamp': 'เวลา',
  'Actor': 'ผู้ดำเนินการ',
  'Target': 'เป้าหมาย',
  'No audit logs found matching your search.': 'ไม่พบบันทึกการตรวจสอบที่ตรงกับการค้นหา',
  'Review and approve submitted preventive maintenance records': 'ตรวจสอบและอนุมัติบันทึกการซ่อมบำรุงที่ส่งมา',
  'Execute assigned preventive maintenance tasks': 'ดำเนินการงานซ่อมบำรุงที่ได้รับมอบหมาย',
  'Action Required': 'ต้องดำเนินการ',
  'Approved Records': 'บันทึกที่อนุมัติแล้ว',
  'History': 'ประวัติ',
  'Pending Approvals': 'รอการอนุมัติ',
  'My Pending Tasks': 'งานรอดำเนินการของฉัน',
  'No tasks available.': 'ไม่มีงาน',
  'Select a task from the list to approve': 'เลือกงานจากรายการเพื่ออนุมัติ',
  'Select a task from the list to execute': 'เลือกงานจากรายการเพื่อดำเนินการ',
  'tasks': 'งาน',
  'Approved & Rejected PM Records': 'บันทึก PM ที่อนุมัติและปฏิเสธ',
  'My Completed PMs': 'PM ที่เสร็จสิ้นของฉัน',
  'All Records': 'บันทึกทั้งหมด',
  'Approved Only': 'เฉพาะที่อนุมัติ',
  'Rejected Only': 'เฉพาะที่ปฏิเสธ',
  'Pending Only': 'เฉพาะรอดำเนินการ',
  'Done Only': 'เฉพาะเสร็จสิ้น',
  'Create PM': 'สร้าง PM',
  'Overview': 'ภาพรวม',
  'Dashboard': 'แดชบอร์ด',
  'PM Work': 'งาน PM',
  'Assign PM': 'มอบหมาย PM',
  'PM Calendar': 'ปฏิทิน PM',
  'PM Reports': 'รายงาน PM',
  'Administration': 'การจัดการ',
  'Search PM work orders…': 'ค้นหาใบสั่งงาน PM…',
  'Notifications': 'การแจ้งเตือน',
  'Settings': 'การตั้งค่า',
  'Profile': 'โปรไฟล์',
  'Preferences': 'การตั้งค่าเพิ่มเติม',
  'Sign out': 'ออกจากระบบ',
  'Close': 'ปิด',
  'Confirm': 'ยืนยัน',
  'Cancel': 'ยกเลิก',

  // Roles
  'Technician': 'ช่างเทคนิค',
  'Engineer': 'วิศวกร',
  'Manager': 'ผู้จัดการ',
  'Admin': 'ผู้ดูแลระบบ',
  'Facility Manager': 'ผู้จัดการอาคารสถานที่',

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

  // Columns & Fields
  'Tasks': 'งาน',
  'Parts': 'อะไหล่',
  'Product': 'ผลิตภัณฑ์',
  'PM ID': 'รหัส PM',
  'Product & Dept': 'ผลิตภัณฑ์ & แผนก',
  'Asset': 'เครื่องจักร',
  'Department': 'แผนก',
  'Unassigned PMs': 'PM ที่ยังไม่มอบหมาย',
  'Assigned PMs': 'PM ที่มอบหมายแล้ว',
  'Temporary Permissions': 'สิทธิ์ชั่วคราว',
  'Department Filter:': 'กรองตามแผนก:',
  'Unassigned PM Work Orders': 'ใบสั่งงาน PM ที่ยังไม่มอบหมาย',
  'All tasks are assigned!': 'งานทั้งหมดถูกมอบหมายแล้ว!',
  'Grant Temporary Access': 'ให้สิทธิ์เข้าถึงชั่วคราว',
  'TARGET USER': 'ผู้ใช้เป้าหมาย',
  'Select users...': 'เลือกผู้ใช้...',
  'Select products...': 'เลือกผลิตภัณฑ์...',
  'Select All': 'เลือกทั้งหมด',
  'Assign work orders and manage temporary permissions': 'มอบหมายใบสั่งงานและจัดการสิทธิ์ชั่วคราว',
  'No assigned tasks match the criteria.': 'ไม่มีงานที่มอบหมายตรงตามเงื่อนไข',
  'Dept': 'แผนก',
  'DEPT': 'แผนก',
  'Est. Time': 'เวลาโดยประมาณ',
  'EST. TIME': 'เวลาโดยประมาณ',
  'PM Details': 'รายละเอียด PM',
  'Completion Notes': 'บันทึกการดำเนินการ',
  'Photo Uploaded': 'อัปโหลดรูปภาพแล้ว',
  'Reject PM Record': 'ปฏิเสธบันทึก PM',
  'PM Preview': 'ดูตัวอย่าง PM',
  'Parts Required': 'อะไหล่ที่ต้องการ',
  'PM TYPE': 'ประเภท PM',
  'Select or type product...': 'เลือกหรือพิมพ์ผลิตภัณฑ์...',
  'Select product first...': 'กรุณาเลือกผลิตภัณฑ์ก่อน...',
  'Describe the maintenance task...': 'อธิบายงานซ่อมบำรุง...',
  'e.g. Weekly Calibration Setup': 'เช่น ตั้งค่าเทียบมาตรฐานรายสัปดาห์',
  'Select or type part and press Enter...': 'เลือกหรือพิมพ์อะไหล่แล้วกด Enter...',
  'Define a new preventive maintenance task': 'กำหนดงานซ่อมบำรุงเชิงป้องกันใหม่',
  'Save Template': 'บันทึกแม่แบบ',
  'Save the current checklist as a template.': 'บันทึกรายการตรวจสอบปัจจุบันเป็นแม่แบบ',
  'Template Name': 'ชื่อแม่แบบ',
  'Manage Templates': 'จัดการแม่แบบ',
  'Delete saved templates.': 'ลบแม่แบบที่บันทึกไว้',
  'No templates saved.': 'ไม่มีแม่แบบที่บันทึกไว้',
  'Delete': 'ลบ',
  'Type': 'ประเภท',
  'Frequency': 'ความถี่',
  'Created By': 'สร้างโดย',
  'Due Date': 'วันที่ครบกำหนด',
  'Assign To': 'มอบหมายให้',
  'Assigned To': 'มอบหมายแล้ว',
  'Assigned By': 'มอบหมายโดย',
  'Executed By': 'ดำเนินการโดย',
  'Approved By': 'อนุมัติโดย',
  'Submitted': 'ส่งแล้ว',
  'Rejected By': 'ปฏิเสธโดย',
  'Time Spent': 'เวลาที่ใช้',
  'Status': 'สถานะ',
  'Time Stamp': 'เวลา',
  'User': 'ผู้ใช้',
  'Valid Until': 'ใช้ได้ถึง',
  'Action': 'การกระทำ',
  'Title': 'หัวข้อ',
  'Description': 'คำอธิบาย',
  'Duration (Days)': 'ระยะเวลา (วัน)',
  'Estimated Time (hours)': 'เวลาโดยประมาณ (ชม.)',

  // Sections & Headers
  'My Tasks': 'งานของฉัน',
  'Team Pending Tasks': 'งานรอดำเนินการของทีม',
  'Delegate Access': 'มอบหมายการเข้าถึง',
  'Active Delegations': 'การมอบหมายที่ใช้อยู่',
  'Confirm Assignment': 'ยืนยันการมอบหมาย',
  'Pending & Urgent Work Orders': 'ใบสั่งงานรอดำเนินการ & เร่งด่วน',
  'Activity Stream': 'ความเคลื่อนไหวล่าสุด',
  'completed by': 'ดำเนินการเสร็จโดย',
  'assigned to': 'มอบหมายให้',
  'Week Total': 'ยอดรวมสัปดาห์',
  'Corrective': 'CM',
  'Preventive': 'PM',
  'Emergency': 'EM',

  // Empty States
  'No active delegations.': 'ไม่มีการมอบหมายที่ทำงานอยู่',
  'No assigned PMs.': 'ไม่มี PM ที่ได้รับมอบหมาย',
  'No recent activity.': 'ไม่มีความเคลื่อนไหวล่าสุด',
  'No pending or overdue tasks. Great job!': 'ไม่มีงานที่รอดำเนินการหรือเกินกำหนด เยี่ยมมาก!',
  'No records found.': 'ไม่พบข้อมูล',

  // Dashboard Stats
  'Total Work Orders': 'ใบสั่งงานทั้งหมด',
  'vs last month': 'เทียบกับเดือนที่แล้ว',
  'Total Assets': 'สินทรัพย์ทั้งหมด',
  'active machines': 'เครื่องจักรที่ทำงานอยู่',
  'Overdue PMs': 'PM ที่เกินกำหนด',
  'requires attention': 'ต้องการการดูแล',
  'Compliance Rate': 'อัตราความสอดคล้อง',
  'target': 'เป้าหมาย',
  'PM Compliance': 'ความสอดคล้องของ PM',

  // Buttons & Actions
  'Grant Access': 'ให้สิทธิ์เข้าถึง',
  'Bulk Assign': 'มอบหมายแบบกลุ่ม',
  'Revoke': 'เพิกถอน',
  'Approve': 'อนุมัติ',
  'Reject': 'ปฏิเสธ',
  'View All': 'ดูทั้งหมด',
  'View Calendar': 'ดูปฏิทิน'
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



















